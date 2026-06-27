import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_hook_configs')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('module_id', 'varchar(120)', col => col.notNull())
    .addColumn('feature_id', 'varchar(120)', col => col.notNull())
    .addColumn('provider_id', 'uuid', col => col.references('hook_providers.id').onDelete('set null'))
    .addColumn('enabled', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('workspace_hook_configs_unique')
    .unique()
    .on('workspace_hook_configs')
    .columns(['workspace_id', 'module_id', 'feature_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workspace_hook_configs').execute();
}
