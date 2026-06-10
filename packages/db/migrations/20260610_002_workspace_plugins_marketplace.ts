import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('pricing_type', sql`varchar(16)`, col => col.notNull().defaultTo('free'))
    .execute();

  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('license_key', 'text', col => col)
    .execute();

  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('source', sql`varchar(16)`, col => col.notNull().defaultTo('local'))
    .execute();

  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('platform_plugin_id', 'text', col => col)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workspace_plugins').dropColumn('platform_plugin_id').execute();
  await db.schema.alterTable('workspace_plugins').dropColumn('source').execute();
  await db.schema.alterTable('workspace_plugins').dropColumn('license_key').execute();
  await db.schema.alterTable('workspace_plugins').dropColumn('pricing_type').execute();
}
