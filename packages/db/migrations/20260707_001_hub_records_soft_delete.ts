import { sql } from 'kysely';
import type { Kysely } from 'kysely';

/**
 * Soft-delete for hub records. Uninstalling a provider tombstones its rows
 * (deleted_at set) rather than hard-deleting, so a reinstall within the
 * retention window restores the synced data without a full re-sync. A daily
 * worker hard-deletes rows past the window.
 *
 * Disable keeps rows live (deleted_at stays NULL) — a disabled provider is
 * simply not the active one, so consumers already fall back to the builtin.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('plugin_hub_records')
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  // Active-row query path: excludes tombstoned rows
  await sql`
    CREATE INDEX IF NOT EXISTS plugin_hub_records_active_idx
    ON plugin_hub_records (workspace_id, contract, updated_at DESC, id DESC)
    WHERE deleted_at IS NULL
  `.execute(db);

  // Retention sweep path
  await sql`
    CREATE INDEX IF NOT EXISTS plugin_hub_records_deleted_idx
    ON plugin_hub_records (deleted_at)
    WHERE deleted_at IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS plugin_hub_records_active_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS plugin_hub_records_deleted_idx`.execute(db);
  await db.schema.alterTable('plugin_hub_records').dropColumn('deleted_at').execute();
}
