import type { Kysely } from 'kysely';

/**
 * Per-feature admin config for hook features. Plugin-declared hook features
 * ship a config_schema; the chosen values are stored here alongside the
 * enabled flag.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_hook_configs')
    .addColumn('config', 'jsonb')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workspace_hook_configs').dropColumn('config').execute();
}
