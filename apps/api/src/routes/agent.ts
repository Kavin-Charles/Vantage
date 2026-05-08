import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { createRequireAgentToken, type AgentRequest } from '../middleware/agentAuth';

const dbCheckSchema = z.object({
  type: z.string(),
  port: z.number(),
  ok: z.boolean(),
  latency_ms: z.number(),
});

const pingSchema = z.object({
  cpu_pct: z.number().min(0).max(100),
  mem_pct: z.number().min(0).max(100),
  disk_pct: z.number().min(0).max(100),
  uptime_seconds: z.number().min(0),
  load_avg_1m: z.number().min(0),
  net_in_bytes: z.number().min(0),
  net_out_bytes: z.number().min(0),
  db_checks: z.array(dbCheckSchema).default([]),
});

export function createAgentRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();
  const requireAgentToken = createRequireAgentToken(db);

  router.post('/ping', requireAgentToken, async (req, res, next) => {
    try {
      const { server } = req as unknown as AgentRequest;
      const payload = pingSchema.parse(req.body);
      const now = new Date().toISOString();

      // Write snapshot
      await db.insertInto('metrics_snapshots').values({
        server_id: server.id,
        workspace_id: server.workspace_id,
        cpu_pct: payload.cpu_pct,
        mem_pct: payload.mem_pct,
        disk_pct: payload.disk_pct,
        load_avg_1m: payload.load_avg_1m,
        net_in_bytes: payload.net_in_bytes,
        net_out_bytes: payload.net_out_bytes,
      }).execute();

      // Update server current metrics
      await db.updateTable('servers')
        .set({
          cpu_pct: payload.cpu_pct,
          mem_pct: payload.mem_pct,
          disk_pct: payload.disk_pct,
          uptime_seconds: payload.uptime_seconds,
          load_avg_1m: payload.load_avg_1m,
          net_in_bytes: payload.net_in_bytes,
          net_out_bytes: payload.net_out_bytes,
          last_ping_at: now,
          status: 'online',
          updated_at: now,
        })
        .where('id', '=', server.id)
        .execute();

      // Update infra_databases from db_checks (match by port)
      for (const check of payload.db_checks) {
        await db.updateTable('infra_databases')
          .set({
            status: check.ok ? 'healthy' : 'offline',
            last_checked_at: now,
            updated_at: now,
          })
          .where('workspace_id', '=', server.workspace_id)
          .where('port', '=', check.port)
          .execute();
      }

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
