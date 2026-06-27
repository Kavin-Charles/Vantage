import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('hook_providers')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('provider_id', 'varchar(120)', col => col.notNull())
    .addColumn('name', 'varchar(255)', col => col.notNull())
    .addColumn('source', 'varchar(20)', col => col.notNull().check(sql`source IN ('builtin', 'plugin')`))
    .addColumn('enabled', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('meta', 'jsonb')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('hook_providers_workspace_provider_unique')
    .unique()
    .on('hook_providers')
    .columns(['workspace_id', 'provider_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('hook_providers').execute();
}
