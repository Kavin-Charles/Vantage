import { type Kysely, sql } from 'kysely';

/**
 * Per-server alert threshold overrides. A NULL server_id is the workspace
 * default (the existing single row); a row with server_id set overrides it for
 * that server only. Partial unique indexes keep one default per workspace and
 * one override per server.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('alert_thresholds')
    .addColumn('server_id', 'uuid', (c) => c.references('servers.id').onDelete('cascade'))
    .execute();

  await sql`
    CREATE UNIQUE INDEX alert_thresholds_workspace_default_idx
    ON alert_thresholds (workspace_id)
    WHERE server_id IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX alert_thresholds_server_idx
    ON alert_thresholds (server_id)
    WHERE server_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('alert_thresholds_server_idx').execute();
  await db.schema.dropIndex('alert_thresholds_workspace_default_idx').execute();
  await db.schema.alterTable('alert_thresholds').dropColumn('server_id').execute();
}
