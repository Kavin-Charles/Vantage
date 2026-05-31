import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('deployments')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('server_id', 'uuid', col => col.references('servers.id').onDelete('set null'))
    .addColumn('name', 'varchar(255)')
    .addColumn('environment', 'varchar(100)')
    .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('pending'))
    .addColumn('source', 'varchar(20)', col => col.notNull())
    .addColumn('started_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('finished_at', 'timestamptz')
    .addColumn('duration_s', 'integer')
    .addColumn('git_commit', 'varchar(40)')
    .addColumn('git_branch', 'varchar(255)')
    .addColumn('git_tag', 'varchar(255)')
    .addColumn('git_message', 'text')
    .addColumn('git_author', 'varchar(255)')
    .addColumn('meta', 'jsonb')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for the common dashboard query: workspace + time desc
  await db.schema
    .createIndex('deployments_workspace_created_idx')
    .on('deployments')
    .columns(['workspace_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('deployments_workspace_created_idx').execute();
  await db.schema.dropTable('deployments').execute();
}
