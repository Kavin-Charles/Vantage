import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('plugin_storage')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('key', 'text', (c) => c.notNull())
    .addColumn('value', 'jsonb', (c) => c.notNull())
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn('now', [])))
    .addUniqueConstraint('plugin_storage_workspace_key_unique', ['workspace_id', 'key'])
    .execute();

  await db.schema
    .createIndex('plugin_storage_workspace_idx')
    .on('plugin_storage')
    .columns(['workspace_id'])
    .execute();

  await db.schema
    .createTable('plugin_files')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('plugin_id', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('mime', 'text', (c) => c.notNull())
    .addColumn('size', 'bigint', (c) => c.notNull())
    .addColumn('r2_key', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('plugin_files_workspace_plugin_idx')
    .on('plugin_files')
    .columns(['workspace_id', 'plugin_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('plugin_files_workspace_plugin_idx').execute();
  await db.schema.dropTable('plugin_files').execute();
  await db.schema.dropIndex('plugin_storage_workspace_idx').execute();
  await db.schema.dropTable('plugin_storage').execute();
}
