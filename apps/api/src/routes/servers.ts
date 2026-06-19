import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

// Accept IPv4, IPv6, or a DNS hostname — agent/SSH connect by any of these.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const hostField = z
  .string()
  .trim()
  .max(253)
  .refine(
    (v) => z.string().ip().safeParse(v).success || HOSTNAME_RE.test(v),
    { message: 'Must be a valid IPv4/IPv6 address or hostname' },
  );

const createServerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional(),
  ip_address: hostField.optional(),
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

export function createServersRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  // List servers
  router.get('/', requirePermission('servers:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const servers = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'name', 'region', 'ip_address', 'cpu_pct', 'mem_pct', 'disk_pct', 'uptime_seconds', 'load_avg_1m', 'net_in_bytes', 'net_out_bytes', 'ssh_port', 'status', 'last_ping_at', 'hostname', 'os', 'arch', 'kernel', 'agent_version', 'created_at', 'updated_at'])
        .orderBy('created_at', 'desc')
        .execute();

      const withStatus = servers.map(s => ({ ...s, status: deriveStatus(s.last_ping_at, s.status) }));
      res.json({ data: withStatus, total: withStatus.length, error: null });
    } catch (err) { next(err); }
  });

  // Get one server with 24h snapshots
  router.get('/:id', requirePermission('servers:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const server = await db
        .selectFrom('servers')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'name', 'region', 'ip_address', 'cpu_pct', 'mem_pct', 'disk_pct', 'uptime_seconds', 'load_avg_1m', 'net_in_bytes', 'net_out_bytes', 'ssh_port', 'status', 'last_ping_at', 'hostname', 'os', 'arch', 'kernel', 'agent_version', 'created_at', 'updated_at'])
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

  // Range-based metrics — raw snapshots for short ranges, rollups for long ones
  router.get('/:id/metrics', requirePermission('servers:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const range = z.enum(['1h', '24h', '7d', '30d']).catch('24h').parse(req.query['range']);

      const server = await db
        .selectFrom('servers')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }

      const cfg = {
        '1h':  { interval: '1 hour',   resolution: 'raw'  as const },
        '24h': { interval: '24 hours', resolution: 'raw'  as const },
        '7d':  { interval: '7 days',   resolution: 'hour' as const },
        '30d': { interval: '30 days',  resolution: 'day'  as const },
      }[range];

      let points;
      if (cfg.resolution === 'raw') {
        const rows = await db
          .selectFrom('metrics_snapshots')
          .where('server_id', '=', server.id)
          .where('recorded_at', '>=', sql<string>`now() - interval '${sql.raw(cfg.interval)}'`)
          .select(['recorded_at', 'cpu_pct', 'mem_pct', 'disk_pct', 'load_avg_1m', 'net_in_bytes', 'net_out_bytes'])
          .orderBy('recorded_at', 'asc')
          .execute();
        points = rows.map(r => ({
          t: r.recorded_at, cpu_pct: r.cpu_pct, mem_pct: r.mem_pct, disk_pct: r.disk_pct,
          load_avg_1m: r.load_avg_1m, net_in_bytes: r.net_in_bytes, net_out_bytes: r.net_out_bytes,
        }));
      } else {
        const rows = await db
          .selectFrom('metrics_rollups')
          .where('server_id', '=', server.id)
          .where('granularity', '=', cfg.resolution)
          .where('bucket', '>=', sql<string>`now() - interval '${sql.raw(cfg.interval)}'`)
          .select(['bucket', 'cpu_avg', 'cpu_max', 'mem_avg', 'mem_max', 'disk_avg', 'disk_max', 'load_avg_1m_avg', 'net_in_bytes_sum', 'net_out_bytes_sum'])
          .orderBy('bucket', 'asc')
          .execute();
        points = rows.map(r => ({
          t: r.bucket, cpu_pct: r.cpu_avg, mem_pct: r.mem_avg, disk_pct: r.disk_avg,
          load_avg_1m: r.load_avg_1m_avg, net_in_bytes: Number(r.net_in_bytes_sum), net_out_bytes: Number(r.net_out_bytes_sum),
          cpu_max: r.cpu_max, mem_max: r.mem_max, disk_max: r.disk_max,
        }));
      }

      res.json({ data: { range, resolution: cfg.resolution, points }, error: null });
    } catch (err) { next(err); }
  });

  // Effective + override thresholds for a server
  router.get('/:id/thresholds', requirePermission('servers:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const rows = await db
        .selectFrom('alert_thresholds')
        .select(['server_id', 'cpu_pct', 'mem_pct', 'disk_pct'])
        .where('workspace_id', '=', workspace.id)
        .where(eb => eb.or([eb('server_id', '=', req.params['id']!), eb('server_id', 'is', null)]))
        .execute();
      const override = rows.find(r => r.server_id === req.params['id']) ?? null;
      const fallback = rows.find(r => r.server_id === null) ?? { cpu_pct: 85, mem_pct: 90, disk_pct: 80 };
      const effective = override ?? fallback;
      res.json({ data: { override, default: fallback, effective }, error: null });
    } catch (err) { next(err); }
  });

  const thresholdSchema = z.object({
    cpu_pct: z.number().min(0).max(100),
    mem_pct: z.number().min(0).max(100),
    disk_pct: z.number().min(0).max(100),
  });

  // Upsert a per-server threshold override
  router.put('/:id/thresholds', requirePermission('servers:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = thresholdSchema.parse(req.body);

      const server = await db.selectFrom('servers')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', workspace.id)
        .select('id').executeTakeFirst();
      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }

      const updated = await db
        .updateTable('alert_thresholds')
        .set({ ...body, updated_at: new Date().toISOString() })
        .where('workspace_id', '=', workspace.id)
        .where('server_id', '=', server.id)
        .returning(['server_id', 'cpu_pct', 'mem_pct', 'disk_pct'])
        .executeTakeFirst();

      const row = updated ?? await db
        .insertInto('alert_thresholds')
        .values({ workspace_id: workspace.id, server_id: server.id, ...body })
        .returning(['server_id', 'cpu_pct', 'mem_pct', 'disk_pct'])
        .executeTakeFirstOrThrow();

      res.json({ data: row, error: null });
    } catch (err) { next(err); }
  });

  // Remove a per-server override (revert to workspace default)
  router.delete('/:id/thresholds', requirePermission('servers:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      await db.deleteFrom('alert_thresholds')
        .where('workspace_id', '=', workspace.id)
        .where('server_id', '=', req.params['id']!)
        .execute();
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // Register server — generate token, return raw once
  router.post('/', requirePermission('servers:create'), async (req, res, next) => {
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
  router.patch('/:id', requirePermission('servers:edit'), async (req, res, next) => {
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
  router.delete('/:id', requirePermission('servers:delete'), async (req, res, next) => {
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
  router.post('/:id/token-regen', requirePermission('servers:edit'), async (req, res, next) => {
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

import { bridgeRegistry } from '@vencore/plugin-runtime';

export function registerServersBridgeMethods(): void {
  bridgeRegistry
    .register('servers.list', 'servers:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db.selectFrom('servers').selectAll().where('workspace_id', '=', ctx.workspaceId);
      if (filter.status) q = q.where('status', '=', filter.status as string);
      if (filter.limit) q = q.limit(Number(filter.limit));
      return q.execute();
    })
    .register('servers.get', 'servers:read', async (ctx, p, db) => {
      const row = await db.selectFrom('servers').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Server not found' };
      return row;
    });
}
