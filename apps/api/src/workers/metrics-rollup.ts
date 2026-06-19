// Aggregates raw metric snapshots into hourly + daily rollups and prunes old
// data so the metrics tables don't grow without bound. Idempotent: every step
// upserts on (server_id, granularity, bucket), so re-runs and late-arriving
// samples self-heal.
import { type Kysely, sql } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from '../lib/logger';

const INTERVAL_MS = 15 * 60 * 1000; // every 15 min

// Retention windows.
const RAW_RETENTION = "7 days";
const HOUR_RETENTION = "30 days";
const DAY_RETENTION = "400 days";

async function rollupHourly(db: Kysely<Database>): Promise<void> {
  // Re-aggregate the last 8h of raw snapshots to absorb late/clock-skewed pings.
  await sql`
    INSERT INTO metrics_rollups
      (server_id, workspace_id, granularity, bucket,
       cpu_avg, cpu_max, mem_avg, mem_max, disk_avg, disk_max,
       load_avg_1m_avg, net_in_bytes_sum, net_out_bytes_sum, sample_count)
    SELECT
      server_id, workspace_id, 'hour', date_trunc('hour', recorded_at),
      avg(cpu_pct), max(cpu_pct), avg(mem_pct), max(mem_pct),
      avg(disk_pct), max(disk_pct), avg(load_avg_1m),
      sum(net_in_bytes), sum(net_out_bytes), count(*)
    FROM metrics_snapshots
    WHERE recorded_at >= now() - interval '8 hours'
    GROUP BY server_id, workspace_id, date_trunc('hour', recorded_at)
    ON CONFLICT (server_id, granularity, bucket) DO UPDATE SET
      cpu_avg = EXCLUDED.cpu_avg, cpu_max = EXCLUDED.cpu_max,
      mem_avg = EXCLUDED.mem_avg, mem_max = EXCLUDED.mem_max,
      disk_avg = EXCLUDED.disk_avg, disk_max = EXCLUDED.disk_max,
      load_avg_1m_avg = EXCLUDED.load_avg_1m_avg,
      net_in_bytes_sum = EXCLUDED.net_in_bytes_sum,
      net_out_bytes_sum = EXCLUDED.net_out_bytes_sum,
      sample_count = EXCLUDED.sample_count
  `.execute(db);
}

async function rollupDaily(db: Kysely<Database>): Promise<void> {
  // Daily aggregates derive from hourly rollups; averages are sample-weighted.
  await sql`
    INSERT INTO metrics_rollups
      (server_id, workspace_id, granularity, bucket,
       cpu_avg, cpu_max, mem_avg, mem_max, disk_avg, disk_max,
       load_avg_1m_avg, net_in_bytes_sum, net_out_bytes_sum, sample_count)
    SELECT
      server_id, workspace_id, 'day', date_trunc('day', bucket),
      sum(cpu_avg * sample_count) / sum(sample_count), max(cpu_max),
      sum(mem_avg * sample_count) / sum(sample_count), max(mem_max),
      sum(disk_avg * sample_count) / sum(sample_count), max(disk_max),
      sum(load_avg_1m_avg * sample_count) / sum(sample_count),
      sum(net_in_bytes_sum), sum(net_out_bytes_sum), sum(sample_count)
    FROM metrics_rollups
    WHERE granularity = 'hour' AND bucket >= now() - interval '3 days'
    GROUP BY server_id, workspace_id, date_trunc('day', bucket)
    ON CONFLICT (server_id, granularity, bucket) DO UPDATE SET
      cpu_avg = EXCLUDED.cpu_avg, cpu_max = EXCLUDED.cpu_max,
      mem_avg = EXCLUDED.mem_avg, mem_max = EXCLUDED.mem_max,
      disk_avg = EXCLUDED.disk_avg, disk_max = EXCLUDED.disk_max,
      load_avg_1m_avg = EXCLUDED.load_avg_1m_avg,
      net_in_bytes_sum = EXCLUDED.net_in_bytes_sum,
      net_out_bytes_sum = EXCLUDED.net_out_bytes_sum,
      sample_count = EXCLUDED.sample_count
  `.execute(db);
}

async function prune(db: Kysely<Database>): Promise<void> {
  await sql`DELETE FROM metrics_snapshots WHERE recorded_at < now() - interval '${sql.raw(RAW_RETENTION)}'`.execute(db);
  await sql`DELETE FROM metrics_rollups WHERE granularity = 'hour' AND bucket < now() - interval '${sql.raw(HOUR_RETENTION)}'`.execute(db);
  await sql`DELETE FROM metrics_rollups WHERE granularity = 'day' AND bucket < now() - interval '${sql.raw(DAY_RETENTION)}'`.execute(db);
}

async function runCycle(db: Kysely<Database>): Promise<void> {
  await rollupHourly(db);
  await rollupDaily(db);
  await prune(db);
}

export function startMetricsRollup(db: Kysely<Database>): void {
  void runCycle(db).catch(err => logger.error({ err }, '[metrics-rollup] initial run failed'));
  setInterval(() => {
    void runCycle(db).catch(err => logger.error({ err }, '[metrics-rollup] run failed'));
  }, INTERVAL_MS);
  logger.info('metrics rollup worker started (15-min cycle)');
}
