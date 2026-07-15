import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_sidebar_groups')
    .ifNotExists()
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('position', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('is_default', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('item_keys', 'jsonb', (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('workspace_sidebar_groups_ws_idx')
    .ifNotExists()
    .on('workspace_sidebar_groups')
    .column('workspace_id')
    .execute();

  await db.schema
    .createTable('user_sidebar_prefs')
    .ifNotExists()
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('pinned_keys', 'jsonb', (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('collapsed_group_keys', 'jsonb', (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('user_sidebar_prefs_pk', ['user_id', 'workspace_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_sidebar_prefs').ifExists().execute();
  await db.schema.dropTable('workspace_sidebar_groups').ifExists().execute();
}
