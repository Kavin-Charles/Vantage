import { type Kysely, sql } from 'kysely';

/**
 * Adds a structured `metric_type` discriminator to alerts so the agent can
 * dedupe/resolve threshold alerts by an exact key instead of a fragile
 * `message LIKE 'CPU usage%'` match.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('alerts')
    .addColumn('metric_type', 'varchar(20)')
    .execute();

  // Backfill existing unresolved server alerts from their message prefix.
  await sql`UPDATE alerts SET metric_type = 'cpu'  WHERE resource_type = 'server' AND message LIKE 'CPU usage%'`.execute(db);
  await sql`UPDATE alerts SET metric_type = 'mem'  WHERE resource_type = 'server' AND message LIKE 'Memory usage%'`.execute(db);
  await sql`UPDATE alerts SET metric_type = 'disk' WHERE resource_type = 'server' AND message LIKE 'Disk usage%'`.execute(db);

  // Fast lookup of an open alert for (server, metric) during ping evaluation.
  await sql`
    CREATE INDEX alerts_open_metric_idx
    ON alerts (workspace_id, resource_type, resource_id, metric_type)
    WHERE resolved = false
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('alerts_open_metric_idx').execute();
  await db.schema.alterTable('alerts').dropColumn('metric_type').execute();
}
