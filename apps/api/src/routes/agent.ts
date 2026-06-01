import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { SmtpConfig } from '@vantage/config';
import { createRequireAgentToken, type AgentRequest } from '../middleware/agentAuth';
import { sendAlertEmail } from '../lib/send-alert-email';
import { sendPush } from '../lib/push-notify';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
import { sseRegistry } from '../lib/sse-registry';
import { createDeploymentSchema } from '@vantage/plugin-deployments';

// Rate-limit snapshot writes: track last insert time per server (resets on restart, acceptable)
const lastSnapshotAt = new Map<string, number>();
const SNAPSHOT_INTERVAL_MS = 30_000;

// Rate-limit SSE broadcasts to prevent event-loop flooding from burst pings
const lastBroadcastAt = new Map<string, number>();
const BROADCAST_INTERVAL_MS = 2_000;

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

export function createAgentDeploymentHandler(db: Kysely<Database>) {
  return async (req: unknown, res: { status: (n: number) => { json: (d: unknown) => void }; json: (d: unknown) => void }, next: (e?: unknown) => void) => {
    try {
      const { server } = req as AgentRequest;
      const body = createDeploymentSchema.omit({ source: true, server_id: true }).parse((req as { body: unknown }).body);

      const deployment = await db
        .insertInto('deployments')
        .values({
          workspace_id: server.workspace_id,
          server_id: server.id,
          name: body.name ?? null,
          environment: body.environment ?? null,
          status: body.status,
          source: 'agent' as const,
          started_at: body.started_at ? new Date(body.started_at) : new Date(),
          git_commit: body.git_commit ?? null,
          git_branch: body.git_branch ?? null,
          git_tag: body.git_tag ?? null,
          git_message: body.git_message ?? null,
          git_author: body.git_author ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: deployment, error: null });
    } catch (err) { next(err); }
  };
}

export function createAgentRouter(db: Kysely<Database>, smtp?: SmtpConfig | null): ExpressRouter {
  const router = Router();
  const requireAgentToken = createRequireAgentToken(db);

  router.post('/ping', requireAgentToken, async (req, res, next) => {
    try {
      const { server } = req as unknown as AgentRequest;
      const payload = pingSchema.parse(req.body);
      const now = new Date().toISOString();

      // Write snapshot at most every 30s to avoid 6× DB write increase at 5s cadence
      const lastSnap = lastSnapshotAt.get(server.id) ?? 0;
      if (Date.now() - lastSnap >= SNAPSHOT_INTERVAL_MS) {
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
        lastSnapshotAt.set(server.id, Date.now());
      }

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

      // Push live metrics — rate-limited per server to prevent burst flooding
      const lastBcast = lastBroadcastAt.get(server.id) ?? 0;
      if (Date.now() - lastBcast >= BROADCAST_INTERVAL_MS) {
        sseRegistry.broadcast(server.workspace_id, 'metric', {
          serverId: server.id,
          cpu_pct: payload.cpu_pct,
          mem_pct: payload.mem_pct,
          disk_pct: payload.disk_pct,
          load_avg_1m: payload.load_avg_1m,
          net_in_bytes: payload.net_in_bytes,
          net_out_bytes: payload.net_out_bytes,
          uptime_seconds: payload.uptime_seconds,
          status: 'online',
          last_ping_at: now,
        });
        lastBroadcastAt.set(server.id, Date.now());
      }

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

      // Threshold alert evaluation
      const thresholds = await db
        .selectFrom('alert_thresholds')
        .select(['cpu_pct', 'mem_pct', 'disk_pct'])
        .where('workspace_id', '=', server.workspace_id)
        .executeTakeFirst()
        ?? { cpu_pct: 85, mem_pct: 90, disk_pct: 80 };

      const metricsToCheck = [
        { prefix: 'CPU usage', value: payload.cpu_pct, threshold: thresholds.cpu_pct },
        { prefix: 'Memory usage', value: payload.mem_pct, threshold: thresholds.mem_pct },
        { prefix: 'Disk usage', value: payload.disk_pct, threshold: thresholds.disk_pct },
      ];

      for (const metric of metricsToCheck) {
        const existingAlert = await db
          .selectFrom('alerts')
          .select(['id', 'severity', 'message', 'resource_type', 'resource_id'])
          .where('workspace_id', '=', server.workspace_id)
          .where('resource_type', '=', 'server')
          .where('resource_id', '=', server.id)
          .where('resolved', '=', false)
          .where('message', 'like', `${metric.prefix}%`)
          .executeTakeFirst();

        if (metric.value > metric.threshold) {
          if (!existingAlert) {
            const severity: 'critical' | 'warning' = metric.value >= 95 ? 'critical' : 'warning';
            const insertedAlert = await db.insertInto('alerts').values({
              workspace_id: server.workspace_id,
              resource_type: 'server',
              resource_id: server.id,
              severity,
              message: `${metric.prefix} at ${Math.round(metric.value)}% on "${server.name}" (threshold: ${metric.threshold}%)`,
            }).returning(['id', 'severity', 'message', 'resource_type', 'resource_id']).executeTakeFirstOrThrow();

            // Notify SSE subscribers so alert bar updates without polling
            sseRegistry.broadcast(server.workspace_id, 'alert_new', {
              id: insertedAlert.id,
              severity: insertedAlert.severity,
              message: insertedAlert.message,
              resource_type: insertedAlert.resource_type,
              resource_id: insertedAlert.resource_id,
            });

            queueWebhook(db, server.workspace_id, 'alert.created', {
              alert_id: insertedAlert.id,
              severity: insertedAlert.severity,
              message: insertedAlert.message,
              resource_type: insertedAlert.resource_type,
              resource_id: insertedAlert.resource_id,
              workspace_id: server.workspace_id,
              timestamp: new Date().toISOString(),
            }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

            // Fire-and-forget notifications + email to workspace admins
            void (async () => {
              try {
                const admins = await db
                  .selectFrom('users')
                  .where('workspace_id', '=', server.workspace_id)
                  .where('role', '=', 'admin')
                  .select(['id', 'email'])
                  .execute();

                if (admins.length > 0) {
                  // In-app notifications
                  await db.insertInto('notifications').values(
                    admins.map(admin => ({
                      workspace_id: server.workspace_id,
                      user_id: admin.id,
                      type: 'alert',
                      title: `${severity === 'critical' ? '🔴' : '🟡'} ${metric.prefix} alert on "${server.name}"`,
                      body: `${metric.prefix} at ${Math.round(metric.value)}% (threshold: ${metric.threshold}%)`,
                      resource_type: 'server',
                      resource_id: server.id,
                    })),
                  ).execute();

                  // Email notification
                  await sendAlertEmail(smtp, admins.map(a => a.email), {
                    severity,
                    message: `${metric.prefix} at ${Math.round(metric.value)}% on "${server.name}" (threshold: ${metric.threshold}%)`,
                    resource_type: 'server',
                  });
                }

                // Push notifications to all workspace users
                const pushTokenRows = await db
                  .selectFrom('push_tokens')
                  .where('workspace_id', '=', server.workspace_id)
                  .select(['token', 'preferences'])
                  .execute();

                const prefKey = severity === 'critical' ? 'alerts_critical' : 'alerts_warning';
                const pushTokens = pushTokenRows
                  .filter(row => {
                    const prefs = (row.preferences ?? {}) as Record<string, boolean>;
                    return prefs[prefKey] !== false; // default on
                  })
                  .map(row => row.token);

                const emoji = severity === 'critical' ? '🔴' : '🟡';
                await sendPush(
                  pushTokens,
                  `${emoji} Alert`,
                  `${server.name}: ${metric.prefix} at ${Math.round(metric.value)}%`,
                );
              } catch {
                // swallowed — never crash agent pings
              }
            })();
          }
        } else if (existingAlert) {
          await db.updateTable('alerts')
            .set({ resolved: true, resolved_at: new Date() })
            .where('id', '=', existingAlert.id)
            .execute();

          queueWebhook(db, server.workspace_id, 'alert.resolved', {
            alert_id: existingAlert.id,
            severity: existingAlert.severity,
            message: existingAlert.message,
            resource_type: existingAlert.resource_type,
            resource_id: existingAlert.resource_id,
            workspace_id: server.workspace_id,
            timestamp: new Date().toISOString(),
          }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
        }
      }

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /agent/deployment — agent reports a deployment event
  router.post('/deployment', requireAgentToken, async (req, res, next) => {
    await createAgentDeploymentHandler(db)(req as never, res as never, next);
  });

  return router;
}
