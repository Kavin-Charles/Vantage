// apps/api/src/routes/ssh-actions.ts
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { decryptPrivateKey } from '../lib/ssh-crypto';
import { sseStart, sseWrite, withSshSession, runCommand } from '../lib/ssh-exec';

/** Fetch the server, verify workspace ownership, check ip_address is set. */
async function resolveServer(
  db: Kysely<Database>,
  req: Request,
  res: Response,
  workspaceId: string,
) {
  const server = await db
    .selectFrom('servers')
    .where('id', '=', req.params['id']!)
    .where('workspace_id', '=', workspaceId)
    .select(['id', 'workspace_id', 'name', 'ip_address'])
    .executeTakeFirst();

  if (!server) {
    res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
    return null;
  }
  if (!server.ip_address) {
    res.status(400).json({ data: null, error: { code: 'NO_IP', message: 'Server has no ip_address configured' } });
    return null;
  }
  return server;
}

/** Fetch and decrypt the workspace SSH private key. */
async function resolvePrivateKey(
  db: Kysely<Database>,
  res: Response,
  workspaceId: string,
): Promise<string | null> {
  const keypair = await db
    .selectFrom('workspace_ssh_keypairs')
    .where('workspace_id', '=', workspaceId)
    .select(['encrypted_private_key', 'iv'])
    .executeTakeFirst();

  if (!keypair) {
    res.status(400).json({
      data: null,
      error: { code: 'NO_KEYPAIR', message: 'No SSH keypair configured. Generate one in Settings → SSH.' },
    });
    return null;
  }

  return decryptPrivateKey(keypair.encrypted_private_key, keypair.iv);
}

export function createSshActionsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router({ mergeParams: true });

  // POST /api/servers/:id/ssh/exec
  router.post('/exec', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const { command } = z.object({ command: z.string().min(1) }).parse(req.body);

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      sseStart(res);

      let exitCode: number | null = null;
      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          exitCode = await runCommand(conn, res, command);
          sseWrite(res, { type: 'exit', code: exitCode });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
        exitCode = 1;
      }

      await db.insertInto('ssh_command_log').values({
        workspace_id: workspace.id,
        server_id: server.id,
        user_id: user.id,
        command,
        exit_code: exitCode,
      }).execute();

      res.end();
    } catch (err) { next(err); }
  });

  // POST /api/servers/:id/ssh/services — list systemd services
  router.post('/services', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      sseStart(res);

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          await runCommand(conn, res, 'systemctl list-units --type=service --no-pager --no-legend');
          sseWrite(res, { type: 'exit', code: 0 });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
      }

      res.end();
    } catch (err) { next(err); }
  });

  // POST /api/servers/:id/ssh/service/:name — action on a named service
  router.post('/service/:name', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const { action } = z.object({
        action: z.enum(['start', 'stop', 'restart', 'status']),
      }).parse(req.body);
      const serviceName = req.params['name']!;
      if (!/^[\w@.-]+$/.test(serviceName)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_SERVICE_NAME', message: 'Invalid service name' } });
        return;
      }

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      sseStart(res);

      const command = `systemctl ${action} ${serviceName}`;
      let exitCode: number | null = null;
      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          exitCode = await runCommand(conn, res, command);
          sseWrite(res, { type: 'exit', code: exitCode });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
        exitCode = 1;
      }

      await db.insertInto('ssh_command_log').values({
        workspace_id: workspace.id,
        server_id: server.id,
        user_id: user.id,
        command,
        exit_code: exitCode,
      }).execute();

      res.end();
    } catch (err) { next(err); }
  });

  // POST /api/servers/:id/ssh/logs
  router.post('/logs', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = z.discriminatedUnion('source', [
        z.object({
          source: z.literal('journalctl'),
          service: z.string().optional(),
          lines: z.number().int().min(1).max(1000).default(200),
        }),
        z.object({
          source: z.literal('file'),
          path: z.string().min(1),
          lines: z.number().int().min(1).max(1000).default(200),
        }),
      ]).parse(req.body);

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      let command: string;
      if (body.source === 'journalctl') {
        command = body.service
          ? `journalctl -u ${body.service} -n ${body.lines} --no-pager`
          : `journalctl -n ${body.lines} --no-pager`;
      } else {
        if (/[;&|`$<>]/.test(body.path)) {
          res.status(400).json({ data: null, error: { code: 'INVALID_PATH', message: 'Invalid path' } });
          return;
        }
        command = `tail -n ${body.lines} ${body.path}`;
      }

      sseStart(res);

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          await runCommand(conn, res, command);
          sseWrite(res, { type: 'exit', code: 0 });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
      }

      res.end();
    } catch (err) { next(err); }
  });

  // POST /api/servers/:id/ssh/files — list directory
  router.post('/files', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { path } = z.object({ path: z.string().min(1).default('/') }).parse(req.body);
      if (/[;&|`$<>]/.test(path)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PATH', message: 'Invalid path' } });
        return;
      }

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      const lines: string[] = [];
      const command = `ls -la --time-style=+%Y-%m-%dT%H:%M:%S ${path} 2>&1`;

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          return new Promise<void>((resolve, reject) => {
            conn.exec(command, (err, stream) => {
              if (err) { reject(err); return; }
              stream.stdout.on('data', (chunk: Buffer) => {
                lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
              });
              stream.stderr.on('data', (chunk: Buffer) => {
                lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
              });
              stream.on('close', () => resolve());
              stream.on('error', reject);
            });
          });
        });
      } catch (err) {
        res.status(500).json({ data: null, error: { code: 'SSH_ERROR', message: (err as Error).message } });
        return;
      }

      const entries = lines
        .filter(l => !l.startsWith('total') && !/ \.$/.test(l) && !/ \.\.$/.test(l) && l.trim().length > 0)
        .map(line => {
          const parts = line.split(/\s+/);
          const perms = parts[0] ?? '';
          const size = parseInt(parts[4] ?? '0', 10) || 0;
          const modified = parts[5] ?? '';
          const name = parts.slice(8).join(' ');
          const type: 'file' | 'dir' | 'link' | 'other' =
            perms.startsWith('d') ? 'dir'
            : perms.startsWith('l') ? 'link'
            : perms.startsWith('-') ? 'file'
            : 'other';
          return { name, type, size, modified };
        })
        .filter(e => e.name);

      res.json({ data: entries, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/servers/:id/ssh/files/read — read file (1 MB limit)
  router.get('/files/read', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const filePath = req.query['path'] as string | undefined;
      if (!filePath) {
        res.status(400).json({ data: null, error: { code: 'MISSING_PATH', message: 'path query param required' } });
        return;
      }
      if (/[;&|`$<>]/.test(filePath)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PATH', message: 'Invalid path' } });
        return;
      }

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      const MAX_BYTES = 1024 * 1024; // 1 MB
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let tooLarge = false;

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          return new Promise<void>((resolve, reject) => {
            conn.exec(`cat ${filePath}`, (err, stream) => {
              if (err) { reject(err); return; }
              stream.stdout.on('data', (chunk: Buffer) => {
                totalBytes += chunk.length;
                if (totalBytes > MAX_BYTES) { tooLarge = true; stream.destroy(); return; }
                chunks.push(chunk);
              });
              stream.on('close', () => resolve());
              stream.on('error', reject);
            });
          });
        });
      } catch (err) {
        res.status(500).json({ data: null, error: { code: 'SSH_ERROR', message: (err as Error).message } });
        return;
      }

      if (tooLarge) {
        res.status(413).json({ data: null, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 1 MB limit' } });
        return;
      }

      res.json({ data: { content: Buffer.concat(chunks).toString('utf8') }, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/servers/:id/ssh/history
  router.get('/history', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const serverId = (req as unknown as AuthenticatedRequest & { params: { id: string } }).params.id;
      const page = Math.max(1, Number(req.query['page'] ?? 1));
      const perPage = Math.min(100, Number(req.query['per_page'] ?? 50));

      const server = await db
        .selectFrom('servers')
        .where('id', '=', serverId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }

      const logs = await db
        .selectFrom('ssh_command_log')
        .where('server_id', '=', serverId)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(perPage)
        .offset((page - 1) * perPage)
        .execute();

      const { count } = await db
        .selectFrom('ssh_command_log')
        .where('server_id', '=', serverId)
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: logs, total: Number(count), error: null });
    } catch (err) { next(err); }
  });

  return router;
}
