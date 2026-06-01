import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_plugins')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('plugin_id', 'varchar(128)', col => col.notNull())
    .addColumn('name', 'varchar(255)', col => col.notNull())
    .addColumn('version', 'varchar(32)', col => col.notNull())
    .addColumn('manifest', 'jsonb', col => col.notNull())
    .addColumn('enabled', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('installed_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('workspace_plugins_workspace_plugin_unique', [
      'workspace_id',
      'plugin_id',
    ])
    .execute();

  await db.schema
    .createIndex('workspace_plugins_workspace_idx')
    .on('workspace_plugins')
    .columns(['workspace_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('workspace_plugins_workspace_idx').execute();
  await db.schema.dropTable('workspace_plugins').execute();
}
