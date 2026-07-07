/**
 * Plugin cron worker — fires scheduled jobs registered by plugin backends via
 * vencore.cron.register(schedule, name, handler).
 *
 * The handler lives inside the plugin sandbox; the parent only tracks the
 * schedule (plugin_cron_jobs) and pokes the sandbox with a `cron:<name>`
 * bus event when a job is due. Poll interval: 60 s.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { sendBusEventToSandbox, isSandboxRunning } from '../lib/plugin-sandbox/manager';
import { loadPluginBackend } from '../lib/plugin-loader';
import { logger } from '../lib/logger';

// Supported schedule shapes (no cron library — deliberate, minimal surface):
//   "*/N * * * *"  → every N minutes
//   "0 * * * *"    → hourly
//   "every Nm"     → every N minutes
//   "every Nh"     → every N hours
// Anything else falls back to 60 minutes.
export function scheduleToMinutes(schedule: string): number {
  const s = schedule.trim();
  let m = /^\*\/(\d+) \* \* \* \*$/.exec(s);
  if (m) return Math.max(1, parseInt(m[1]!, 10));
  if (/^0 \* \* \* \*$/.test(s)) return 60;
  m = /^every (\d+)m$/i.exec(s);
  if (m) return Math.max(1, parseInt(m[1]!, 10));
  m = /^every (\d+)h$/i.exec(s);
  if (m) return Math.max(1, parseInt(m[1]!, 10) * 60);
  return 60;
}

async function tick(db: Kysely<Database>): Promise<void> {
  const now = new Date();
  const due = await db
    .selectFrom('plugin_cron_jobs')
    .innerJoin('workspace_plugins', (join) =>
      join
        .onRef('workspace_plugins.workspace_id', '=', 'plugin_cron_jobs.workspace_id')
        .onRef('workspace_plugins.plugin_id', '=', 'plugin_cron_jobs.plugin_id'),
    )
    .select([
      'plugin_cron_jobs.id as id',
      'plugin_cron_jobs.workspace_id as workspace_id',
      'plugin_cron_jobs.plugin_id as plugin_id',
      'plugin_cron_jobs.job_name as job_name',
      'plugin_cron_jobs.schedule as schedule',
    ])
    .where('plugin_cron_jobs.enabled', '=', true)
    .where('plugin_cron_jobs.next_run_at', '<=', now)
    .where('workspace_plugins.enabled', '=', true)
    .limit(100)
    .execute();

  for (const job of due) {
    const intervalMin = scheduleToMinutes(job.schedule);
    const nextRunAt = new Date(now.getTime() + intervalMin * 60_000);

    // Advance the clock first — a crashing handler must not create a hot loop
    await db
      .updateTable('plugin_cron_jobs')
      .set({ last_run_at: now, next_run_at: nextRunAt })
      .where('id', '=', job.id)
      .execute();

    if (!isSandboxRunning(job.plugin_id, job.workspace_id)) {
      // Sandbox may have been evicted (API restart) — respawn and let the
      // job fire on the next tick once setup completes.
      loadPluginBackend(job.plugin_id, job.workspace_id, db);
      logger.info(
        { pluginId: job.plugin_id, workspaceId: job.workspace_id, job: job.job_name },
        'Plugin cron: sandbox not running, respawned — job deferred to next tick',
      );
      continue;
    }

    const sent = sendBusEventToSandbox(job.plugin_id, job.workspace_id, `cron:${job.job_name}`, {
      job: job.job_name,
      fired_at: now.toISOString(),
    });
    if (!sent) {
      logger.warn(
        { pluginId: job.plugin_id, workspaceId: job.workspace_id, job: job.job_name },
        'Plugin cron: failed to deliver job to sandbox',
      );
    }
  }
}

export function startPluginCron(db: Kysely<Database>): void {
  setInterval(() => {
    tick(db).catch((err) => logger.error({ err }, 'Plugin cron tick failed'));
  }, 60_000);
}
