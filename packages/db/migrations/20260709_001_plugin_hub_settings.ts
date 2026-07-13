import type { Kysely } from 'kysely';

/**
 * Feature-level plugin settings contributed to domain settings pages (CRM,
 * infra, general). Distinct from plugin_settings (plugin-private auth config)
 * — these are behavioral settings that belong where users expect them, and
 * can be marked shared so consumers may read them through the hub.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('plugin_hub_settings')
    .ifNotExists()
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('plugin_id', 'varchar(128)', col => col.notNull())
    .addColumn('domain', 'varchar(64)', col => col.notNull())
    .addColumn('key', 'varchar(128)', col => col.notNull())
    .addColumn('value', 'jsonb', col => col.notNull())
    .addColumn('shared', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('plugin_hub_settings_identity_unique')
    .ifNotExists()
    .unique()
    .on('plugin_hub_settings')
    .columns(['workspace_id', 'plugin_id', 'key'])
    .execute();

  await db.schema
    .createIndex('plugin_hub_settings_domain_idx')
    .ifNotExists()
    .on('plugin_hub_settings')
    .columns(['workspace_id', 'domain'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('plugin_hub_settings').execute();
}
