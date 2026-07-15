import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('plugin_hub_records')
    .ifNotExists()
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('contract', 'varchar(120)', col => col.notNull())
    .addColumn('provider_plugin_id', 'varchar(128)', col => col.notNull())
    .addColumn('external_id', 'varchar(255)', col => col.notNull())
    .addColumn('data', 'jsonb', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('plugin_hub_records_identity_unique')
    .ifNotExists()
    .unique()
    .on('plugin_hub_records')
    .columns(['workspace_id', 'contract', 'provider_plugin_id', 'external_id'])
    .execute();

  await db.schema
    .createIndex('plugin_hub_records_query_idx')
    .ifNotExists()
    .on('plugin_hub_records')
    .columns(['workspace_id', 'contract', 'updated_at', 'id'])
    .execute();

  // Per-workspace kill switch for cross-plugin data sharing
  await db.schema
    .alterTable('workspaces')
    .addColumn('plugin_data_sharing', 'boolean', col => col.notNull().defaultTo(true))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workspaces').dropColumn('plugin_data_sharing').execute();
  await db.schema.dropTable('plugin_hub_records').execute();
}
