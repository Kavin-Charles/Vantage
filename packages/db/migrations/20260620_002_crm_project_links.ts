import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('deal_id', 'uuid', c => c.references('pipeline_items.id').onDelete('set null'))
    .execute()

  await db.schema.createIndex('idx_projects_deal_id').on('projects').column('deal_id').execute()

  await db.schema
    .createTable('cross_module_settings')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('setting_key', 'varchar(100)', c => c.notNull())
    .addColumn('enabled', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('config', 'jsonb')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    CREATE UNIQUE INDEX cross_module_settings_workspace_key_idx
    ON cross_module_settings (workspace_id, setting_key)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('cross_module_settings_workspace_key_idx').execute()
  await db.schema.dropTable('cross_module_settings').ifExists().execute()
  await db.schema.dropIndex('idx_projects_deal_id').execute()
  await db.schema.alterTable('projects').dropColumn('deal_id').execute()
}
