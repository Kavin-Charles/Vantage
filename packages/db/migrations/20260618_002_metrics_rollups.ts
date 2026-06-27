import { type Kysely, sql } from 'kysely';

/**
 * Production metrics retention:
 *   - raw `metrics_snapshots` kept short-term (pruned by retention worker)
 *   - `metrics_rollups` holds hourly + daily aggregates for long-range charts
 *
 * Also records agent/host metadata reported on ping so the UI can show what
 * the box actually is (OS, arch, kernel, hostname, agent version).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('metrics_rollups')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('server_id', 'uuid', (c) => c.notNull().references('servers.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('granularity', 'varchar(8)', (c) => c.notNull()) // 'hour' | 'day'
    .addColumn('bucket', 'timestamptz', (c) => c.notNull())      // truncated bucket start
    .addColumn('cpu_avg', 'real', (c) => c.notNull())
    .addColumn('cpu_max', 'real', (c) => c.notNull())
    .addColumn('mem_avg', 'real', (c) => c.notNull())
    .addColumn('mem_max', 'real', (c) => c.notNull())
    .addColumn('disk_avg', 'real', (c) => c.notNull())
    .addColumn('disk_max', 'real', (c) => c.notNull())
    .addColumn('load_avg_1m_avg', 'real', (c) => c.notNull())
    .addColumn('net_in_bytes_sum', 'bigint', (c) => c.notNull())
    .addColumn('net_out_bytes_sum', 'bigint', (c) => c.notNull())
    .addColumn('sample_count', 'integer', (c) => c.notNull())
    .execute();

  // One rollup row per (server, granularity, bucket) — enables idempotent upsert.
  await db.schema
    .createIndex('metrics_rollups_unique_idx')
    .on('metrics_rollups')
    .columns(['server_id', 'granularity', 'bucket'])
    .unique()
    .execute();

  // Range-query index: "rollups for server X at granularity G newest-first".
  await db.schema
    .createIndex('metrics_rollups_range_idx')
    .on('metrics_rollups')
    .columns(['server_id', 'granularity', 'bucket'])
    .execute();

  // Index raw snapshots by recorded_at so retention pruning is cheap.
  await db.schema
    .createIndex('metrics_snapshots_recorded_at_idx')
    .ifNotExists()
    .on('metrics_snapshots')
    .columns(['recorded_at'])
    .execute();

  await db.schema
    .alterTable('servers')
    .addColumn('hostname', 'varchar(255)')
    .addColumn('os', 'varchar(120)')
    .addColumn('arch', 'varchar(40)')
    .addColumn('kernel', 'varchar(120)')
    .addColumn('agent_version', 'varchar(40)')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('servers').dropColumn('agent_version').dropColumn('kernel')
    .dropColumn('arch').dropColumn('os').dropColumn('hostname').execute();
  await db.schema.dropIndex('metrics_snapshots_recorded_at_idx').execute();
  await db.schema.dropTable('metrics_rollups').execute();
}
