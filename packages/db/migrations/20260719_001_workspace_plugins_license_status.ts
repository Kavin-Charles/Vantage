import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * License health for paid marketplace plugins, written by the install/enable
 * routes and the license-check worker. Mirrors the platform's status values
 * plus the two client-side outcomes (bound_elsewhere, not_found).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('license_status', sql`varchar(24)`, col => col)
    .execute();

  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('license_checked_at', 'timestamptz', col => col)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workspace_plugins').dropColumn('license_checked_at').execute();
  await db.schema.alterTable('workspace_plugins').dropColumn('license_status').execute();
}
