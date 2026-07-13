import { sql } from 'kysely';
import type { Kysely } from 'kysely';

/**
 * Switch-model provider selection: one active provider per contract group per
 * workspace. Missing row = builtin default (vencore-crm for the crm group).
 * status 'pending_selection' means a conflicting provider was installed and
 * the admin has not chosen yet — consumers keep previous_provider_id.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_contract_providers')
    .ifNotExists()
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('contract_group', 'varchar(64)', col => col.notNull())
    .addColumn('active_provider_id', 'varchar(128)', col => col.notNull())
    .addColumn('status', 'varchar(24)', col => col.notNull().defaultTo('active').check(sql`status IN ('active', 'pending_selection')`))
    .addColumn('previous_provider_id', 'varchar(128)')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('workspace_contract_providers_unique')
    .ifNotExists()
    .unique()
    .on('workspace_contract_providers')
    .columns(['workspace_id', 'contract_group'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workspace_contract_providers').execute();
}
