import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { SmtpConfig } from '@vantage/config';
import { createRequireAgentToken, type AgentRequest } from '../middleware/agentAuth';
import { sendAlertEmail } from '../lib/send-alert-email';
import { sendPush } from '../lib/push-notify';

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

export function createAgentRouter(db: Kysely<Database>, smtp?: SmtpConfig | null): ExpressRouter {
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
          .select(['id'])
          .where('workspace_id', '=', server.workspace_id)
          .where('resource_type', '=', 'server')
          .where('resource_id', '=', server.id)
          .where('resolved', '=', false)
          .where('message', 'like', `${metric.prefix}%`)
          .executeTakeFirst();

        if (metric.value > metric.threshold) {
          if (!existingAlert) {
            const severity: 'critical' | 'warning' = metric.value >= 95 ? 'critical' : 'warning';
            await db.insertInto('alerts').values({
              workspace_id: server.workspace_id,
              resource_type: 'server',
              resource_id: server.id,
              severity,
              message: `${metric.prefix} at ${Math.round(metric.value)}% on "${server.name}" (threshold: ${metric.threshold}%)`,
            }).execute();

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
        }
      }

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
