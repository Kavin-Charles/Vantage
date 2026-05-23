// apps/api/src/ws/sftp-session.ts
// Handles WebSocket-based SFTP file operations.
import path from 'path';
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'ssh2';
import type { SFTPWrapper, FileEntryWithStats } from 'ssh2';
import type { WebSocket } from 'ws';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { decryptPrivateKey } from '../lib/ssh-crypto';
import { logger } from '../lib/logger';

interface JwtPayload {
  sub: string;
  workspaceId: string;
}

// URL pattern: /api/servers/:id/ssh/sftp
const SFTP_URL_RE = /^\/api\/servers\/([^/?]+)\/ssh\/sftp/;

type SftpOp = 'ls' | 'read' | 'write' | 'delete' | 'rename' | 'mkdir';

interface SftpRequest {
  id: string;
  op: SftpOp;
  path?: string;
  dest?: string;    // for rename
  content?: string; // for write
}

interface SftpResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_READ_BYTES = 10 * 1024 * 1024; // 10 MB

function guardPath(p: string): string | null {
  if (!p || p.includes('\0')) return null;
  const resolved = path.posix.normalize(p);
  if (resolved.includes('..')) return null;
  return resolved;
}

// Promisify for ops that return a result (readdir → FileEntryWithStats[])
function promisifyResult<T>(
  fn: (cb: (err: Error | null | undefined, result: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) =>
    fn((err, result) => (err ? reject(err) : resolve(result))),
  );
}

// Promisify for ops with no result (unlink, rename, mkdir) — Callback = (err?) => void
function promisifyVoid(
  fn: (cb: (err?: Error | null) => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) =>
    fn((err) => (err ? reject(err) : resolve())),
  );
}

async function sftpLs(sftp: SFTPWrapper, path: string) {
  const entries = await promisifyResult<FileEntryWithStats[]>(cb => sftp.readdir(path, cb));
  return entries.map(e => ({
    name: e.filename,
    type: e.attrs.isDirectory() ? 'dir' : e.attrs.isSymbolicLink() ? 'link' : 'file',
    size: e.attrs.size,
    modified: new Date((e.attrs.mtime ?? 0) * 1000).toISOString(),
  }));
}

async function sftpRead(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(path);
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function sftpWrite(sftp: SFTPWrapper, path: string, content: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(path);
    stream.on('close', resolve);
    stream.on('error', reject);
    stream.end(content);
  });
}

async function sftpDelete(sftp: SFTPWrapper, path: string): Promise<void> {
  return promisifyVoid(cb => sftp.unlink(path, cb));
}

async function sftpRename(sftp: SFTPWrapper, src: string, dest: string): Promise<void> {
  return promisifyVoid(cb => sftp.rename(src, dest, cb));
}

async function sftpMkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return promisifyVoid(cb => sftp.mkdir(path, cb));
}

async function handleOp(sftp: SFTPWrapper, msg: SftpRequest): Promise<SftpResponse> {
  const path = guardPath(msg.path ?? '/');
  if (!path) return { id: msg.id, ok: false, error: 'FORBIDDEN' };

  try {
    switch (msg.op) {
      case 'ls': {
        const entries = await sftpLs(sftp, path);
        return { id: msg.id, ok: true, data: { entries } };
      }
      case 'read': {
        const buf = await sftpRead(sftp, path);
        if (buf.length > MAX_READ_BYTES) {
          return { id: msg.id, ok: false, error: 'FILE_TOO_LARGE' };
        }
        return { id: msg.id, ok: true, data: { content: buf.toString('utf8') } };
      }
      case 'write': {
        await sftpWrite(sftp, path, Buffer.from(msg.content ?? '', 'utf8'));
        return { id: msg.id, ok: true, data: null };
      }
      case 'delete': {
        await sftpDelete(sftp, path);
        return { id: msg.id, ok: true, data: null };
      }
      case 'rename': {
        const dest = guardPath(msg.dest ?? '');
        if (!dest) return { id: msg.id, ok: false, error: 'FORBIDDEN' };
        await sftpRename(sftp, path, dest);
        return { id: msg.id, ok: true, data: null };
      }
      case 'mkdir': {
        await sftpMkdir(sftp, path);
        return { id: msg.id, ok: true, data: null };
      }
      default:
        return { id: msg.id, ok: false, error: 'UNKNOWN_OP' };
    }
  } catch (err) {
    return { id: msg.id, ok: false, error: (err as Error).message };
  }
}

export async function handleSftpUpgrade(
  ws: WebSocket,
  request: IncomingMessage,
  db: Kysely<Database>,
  jwtSecret: string,
): Promise<void> {
  const url = request.url ?? '';
  const match = SFTP_URL_RE.exec(url);
  if (!match) { ws.close(4004, 'Not found'); return; }
  const serverId = match[1]!;

  // ── Auth (same pattern as ssh-terminal.ts) ──────────────────────────────────
  const cookieHeader = request.headers.cookie ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=');
      return idx < 0 ? [c.trim(), ''] : [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    }),
  );
  // Also accept ?token= query param — browser can't send custom headers on WS, and
  // SameSite=Strict blocks cross-origin cookies (e.g. vercel.app → railway.app)
  const urlParams = new URL(url, 'http://localhost').searchParams;
  const token = cookies['vantage_token'] ?? urlParams.get('token') ?? '';
  if (!token) { ws.close(4001, 'Unauthorized'); return; }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret) as JwtPayload;
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const user = await db.selectFrom('users').where('id', '=', payload.sub)
    .select(['id', 'workspace_id']).executeTakeFirst();
  if (!user) { ws.close(4001, 'Unauthorized'); return; }

  const workspace = await db.selectFrom('workspaces').where('id', '=', user.workspace_id)
    .select(['id']).executeTakeFirst();
  if (!workspace) { ws.close(4001, 'Unauthorized'); return; }

  // ── Resolve server ──────────────────────────────────────────────────────────
  const server = await db.selectFrom('servers')
    .where('id', '=', serverId).where('workspace_id', '=', workspace.id)
    .select(['id', 'ip_address', 'ssh_port']).executeTakeFirst();
  if (!server) { ws.close(4004, 'Server not found'); return; }
  if (!server.ip_address) { ws.close(4000, 'Server has no IP configured'); return; }

  // ── Resolve keypair ─────────────────────────────────────────────────────────
  const keypair = await db.selectFrom('workspace_ssh_keypairs')
    .where('workspace_id', '=', workspace.id)
    .select(['encrypted_private_key', 'iv', 'ssh_user']).executeTakeFirst();
  if (!keypair) { ws.close(4000, 'NO_KEYPAIR'); return; }

  let privateKey: string;
  try {
    privateKey = decryptPrivateKey(keypair.encrypted_private_key, keypair.iv);
  } catch (err) {
    logger.error({ err }, '[ws/sftp] Failed to decrypt private key');
    ws.close(4000, 'SSH_KEY_DECRYPT_FAILED');
    return;
  }

  // ── Open SSH + SFTP ─────────────────────────────────────────────────────────
  const conn = new Client();

  function send(resp: SftpResponse) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(resp));
  }

  conn.on('error', (err) => {
    logger.error({ err, serverId }, '[ws/sftp] SSH error');
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ id: '', ok: false, error: 'SSH_CONNECT_FAILED' }));
      ws.close(4001, 'SSH_CONNECT_FAILED');
    }
  });

  conn.on('ready', () => {
    conn.sftp((err, sftp) => {
      if (err) {
        logger.error({ err, serverId }, '[ws/sftp] SFTP subsystem error');
        ws.close(4000, 'SFTP_INIT_FAILED');
        conn.end();
        return;
      }

      let idleTimer: ReturnType<typeof setTimeout> = setTimeout(closeIdle, IDLE_TIMEOUT_MS);

      function closeIdle() {
        if (ws.readyState === ws.OPEN) ws.close(4000, 'IDLE_TIMEOUT');
        conn.end();
      }

      function resetIdle() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(closeIdle, IDLE_TIMEOUT_MS);
      }

      ws.on('message', (raw: Buffer) => {
        resetIdle();
        let msg: SftpRequest;
        try {
          msg = JSON.parse(raw.toString('utf8')) as SftpRequest;
        } catch {
          send({ id: '', ok: false, error: 'INVALID_JSON' });
          return;
        }
        void handleOp(sftp, msg).then(send);
      });

      ws.on('close', () => {
        clearTimeout(idleTimer);
        sftp.end();
        conn.end();
      });
    });
  });

  conn.connect({
    host: server.ip_address,
    port: server.ssh_port ?? 22,
    username: keypair.ssh_user,
    privateKey,
    readyTimeout: 30_000,
  });
}
