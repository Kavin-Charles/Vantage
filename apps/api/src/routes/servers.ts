import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createServerSchema = z.object({
  name: z.string().min(1),
  region: z.string().optional(),
  ip_address: z.string().optional(),
});

const updateServerSchema = createServerSchema.partial().extend({
  ssh_port: z.number().int().min(1).max(65535).optional(),
});

function deriveStatus(lastPingAt: string | null, storedStatus: string): 'online' | 'degraded' | 'offline' | 'stopped' {
  // No agent has ever pinged — trust the stored status (e.g. demo/seeded servers)
  if (!lastPingAt) return storedStatus as 'online' | 'degraded' | 'offline' | 'stopped';
  const diffMs = Date.now() - new Date(lastPingAt).getTime();
  if (diffMs < 90_000) return 'online';
  if (diffMs < 300_000) return 'degraded';
  return 'offline';
}

export function createServersRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // List servers
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const servers = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'name', 'region', 'ip_address', 'cpu_pct', 'mem_pct', 'disk_pct', 'uptime_seconds', 'load_avg_1m', 'net_in_bytes', 'net_out_bytes', 'ssh_port', 'status', 'last_ping_at', 'created_at', 'updated_at'])
        .orderBy('created_at', 'desc')
        .execute();

      const withStatus = servers.map(s => ({ ...s, status: deriveStatus(s.last_ping_at, s.status) }));
      res.json({ data: withStatus, total: withStatus.length, error: null });
    } catch (err) { next(err); }
  });

  // Get one server with 24h snapshots
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const server = await db
        .selectFrom('servers')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'name', 'region', 'ip_address', 'cpu_pct', 'mem_pct', 'disk_pct', 'uptime_seconds', 'load_avg_1m', 'net_in_bytes', 'net_out_bytes', 'ssh_port', 'status', 'last_ping_at', 'created_at', 'updated_at'])
        .executeTakeFirst();

      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const snapshots = await db
        .selectFrom('metrics_snapshots')
        .where('server_id', '=', server.id)
        .where('recorded_at', '>=', since)
        .selectAll()
        .orderBy('recorded_at', 'asc')
        .execute();

      res.json({ data: { ...server, status: deriveStatus(server.last_ping_at, server.status), snapshots }, error: null });
    } catch (err) { next(err); }
  });

  // Register server — generate token, return raw once
  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = createServerSchema.parse(req.body);

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const server = await db
        .insertInto('servers')
        .values({
          workspace_id: workspace.id,
          name: body.name,
          region: body.region ?? null,
          ip_address: body.ip_address ?? null,
          agent_token_hash: tokenHash,
          status: 'offline',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Return raw token once — never stored in plaintext
      const { agent_token_hash: _, ...serverWithoutHash } = server;
      res.status(201).json({ data: { ...serverWithoutHash, agent_token: rawToken }, error: null });
    } catch (err) { next(err); }
  });

  // Update server
  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateServerSchema.parse(req.body);
      const server = await db
        .updateTable('servers')
        .set({ ...body, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }
      const { agent_token_hash: _h, ...updatedServerWithoutHash } = server;
      res.json({ data: updatedServerWithoutHash, error: null });
    } catch (err) { next(err); }
  });

  // Deregister server
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('servers')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // Regenerate agent token — new token returned once, same one-time reveal as POST /
  router.post('/:id/token-regen', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const updated = await db
        .updateTable('servers')
        .set({ agent_token_hash: tokenHash, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'name'])
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }

      res.json({ data: { agent_token: rawToken }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
