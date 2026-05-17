import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('push_tokens')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])),
    )
    .addColumn('user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('token', 'text', col => col.notNull())
    .addColumn('platform', 'varchar(10)', col => col.notNull())
    .addColumn('preferences', 'jsonb', col =>
      col.notNull().defaultTo('{}'),
    )
    .addColumn('created_at', 'timestamptz', col =>
      col.notNull().defaultTo(db.fn('now', [])),
    )
    .addColumn('updated_at', 'timestamptz', col =>
      col.notNull().defaultTo(db.fn('now', [])),
    )
    .execute();

  await db.schema
    .createIndex('push_tokens_user_id_idx')
    .on('push_tokens')
    .column('user_id')
    .execute();

  // Unique constraint: one token per user (allows device switch)
  await db.schema
    .createIndex('push_tokens_user_token_unique')
    .on('push_tokens')
    .columns(['user_id', 'token'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('push_tokens').ifExists().execute();
}
