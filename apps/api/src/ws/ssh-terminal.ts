// apps/api/src/ws/ssh-terminal.ts
// Handles WebSocket-based interactive SSH terminal sessions (PTY).
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'ssh2';
import type { WebSocket } from 'ws';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { decryptPrivateKey } from '../lib/ssh-crypto';
import { userHasPermission } from '../middleware/permission';
import { logger } from '../lib/logger';

interface JwtPayload {
  sub: string;
  workspaceId: string;
}

// URL pattern: /api/servers/{serverId}/ssh/terminal
const TERMINAL_URL_RE = /^\/api\/servers\/([^/?]+)\/ssh\/terminal/;

export async function handleTerminalUpgrade(
  ws: WebSocket,
  request: IncomingMessage,
  db: Kysely<Database>,
  jwtSecret: string,
): Promise<void> {
  const url = request.url ?? '';
  const match = TERMINAL_URL_RE.exec(url);
  if (!match) {
    ws.close(4004, 'Not found');
    return;
  }
  const serverId = match[1]!;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieHeader = request.headers.cookie ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=');
      if (idx < 0) return [c.trim(), ''];
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    }),
  );
  const token = cookies['vencore_token'];

  if (!token) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret) as JwtPayload;
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const user = await db
    .selectFrom('users')
    .where('id', '=', payload.sub)
    .select(['id', 'workspace_id', 'role'])
    .executeTakeFirst();
  if (!user) { ws.close(4001, 'Unauthorized'); return; }

  const workspace = await db
    .selectFrom('workspaces')
    .where('id', '=', user.workspace_id)
    .select(['id'])
    .executeTakeFirst();
  if (!workspace) { ws.close(4001, 'Unauthorized'); return; }

  // ── Authorize: SSH access is gated behind servers:ssh ─────────────────────
  if (!(await userHasPermission(db, user, workspace.id, 'servers:ssh'))) {
    ws.close(4003, 'Forbidden');
    return;
  }

  // ── Resolve server ────────────────────────────────────────────────────────
  const server = await db
    .selectFrom('servers')
    .where('id', '=', serverId)
    .where('workspace_id', '=', workspace.id)
    .select(['id', 'ip_address', 'ssh_port'])
    .executeTakeFirst();

  if (!server) { ws.close(4004, 'Server not found'); return; }
  if (!server.ip_address) { ws.close(4000, 'Server has no IP configured'); return; }

  // ── Resolve SSH keypair ────────────────────────────────────────────────────
  const keypair = await db
    .selectFrom('workspace_ssh_keypairs')
    .where('workspace_id', '=', workspace.id)
    .select(['encrypted_private_key', 'iv', 'ssh_user'])
    .executeTakeFirst();

  if (!keypair) { ws.close(4000, 'No SSH keypair configured'); return; }

  let privateKey: string;
  try {
    privateKey = decryptPrivateKey(keypair.encrypted_private_key, keypair.iv);
  } catch (err) {
    logger.error({ err }, '[ws/ssh-terminal] Failed to decrypt private key');
    ws.close(4000, 'SSH key decryption failed');
    return;
  }

  // ── Parse initial PTY dimensions from URL query string ────────────────────
  const urlObj = new URL(url, 'http://localhost');
  const cols = Math.max(10, parseInt(urlObj.searchParams.get('cols') ?? '80', 10) || 80);
  const rows = Math.max(5, parseInt(urlObj.searchParams.get('rows') ?? '24', 10) || 24);

  // ── Open SSH connection ────────────────────────────────────────────────────
  const conn = new Client();

  function sendError(message: string) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message }));
      ws.close();
    }
  }

  conn.on('error', (err) => {
    logger.error({ err, serverId }, '[ws/ssh-terminal] SSH connection error');
    sendError(err.message);
  });

  conn.on('ready', () => {
    conn.shell(
      { term: 'xterm-256color', rows, cols, modes: {} },
      (err, stream) => {
        if (err) {
          sendError(err.message);
          conn.end();
          return;
        }

        // SSH stdout/stderr → WebSocket (raw binary)
        stream.on('data', (data: Buffer) => {
          if (ws.readyState === ws.OPEN) ws.send(data);
        });
        stream.stderr.on('data', (data: Buffer) => {
          if (ws.readyState === ws.OPEN) ws.send(data);
        });

        // SSH stream close → close WebSocket
        stream.on('close', () => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'close' }));
            ws.close();
          }
          conn.end();
        });

        // WebSocket → SSH stdin / resize
        // ws delivers ALL frames as Buffer; use isBinary to distinguish control vs data
        ws.on('message', (msg: Buffer, isBinary: boolean) => {
          if (!isBinary) {
            // Text frame = JSON control message (resize)
            try {
              const event = JSON.parse(msg.toString('utf8')) as { type: string; cols?: number; rows?: number };
              if (event.type === 'resize' && event.cols && event.rows) {
                stream.setWindow(event.rows, event.cols, 0, 0);
              }
            } catch { /* ignore malformed JSON */ }
          } else {
            // Binary frame = raw keystroke bytes → SSH stdin
            stream.write(msg);
          }
        });

        // WebSocket close → close SSH stream
        ws.on('close', () => {
          stream.end();
          conn.end();
        });
      },
    );
  });

  conn.connect({
    host: server.ip_address,
    port: server.ssh_port ?? 22,
    username: keypair.ssh_user,
    privateKey,
    readyTimeout: 30_000,
  });
}
