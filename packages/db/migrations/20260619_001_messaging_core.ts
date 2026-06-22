import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('channels')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'varchar(120)', c => c.notNull())
    .addColumn('type', 'varchar(20)', c => c.notNull().defaultTo('channel'))
    .addColumn('is_private', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('topic', 'text')
    .addColumn('created_by', 'uuid', c => c.references('users.id').onDelete('set null'))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('channels_workspace_idx')
    .on('channels')
    .columns(['workspace_id'])
    .execute();

  await db.schema
    .createTable('channel_members')
    .addColumn('channel_id', 'uuid', c => c.notNull().references('channels.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'varchar(20)', c => c.notNull().defaultTo('member'))
    .addColumn('joined_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('channel_members_pkey', ['channel_id', 'user_id'])
    .execute();

  await db.schema
    .createIndex('channel_members_user_idx')
    .on('channel_members')
    .columns(['user_id'])
    .execute();

  await db.schema
    .createTable('messages')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('channel_id', 'uuid', c => c.notNull().references('channels.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.references('users.id').onDelete('set null'))
    .addColumn('body', 'text', c => c.notNull())
    .addColumn('parent_message_id', 'uuid', c => c.references('messages.id').onDelete('cascade'))
    .addColumn('thread_count', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('mention_user_ids', sql`uuid[]`)
    .addColumn('edited_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  // Cursor pagination: messages for channel, newest first
  await db.schema
    .createIndex('messages_channel_created_idx')
    .on('messages')
    .columns(['channel_id', 'created_at'])
    .execute();

  // Mentions lookup: messages where a user is mentioned
  await sql`
    CREATE INDEX messages_mention_user_ids_idx
    ON messages USING GIN(mention_user_ids)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('messages_mention_user_ids_idx').ifExists().execute();
  await db.schema.dropIndex('messages_channel_created_idx').ifExists().execute();
  await db.schema.dropTable('messages').execute();
  await db.schema.dropIndex('channel_members_user_idx').ifExists().execute();
  await db.schema.dropTable('channel_members').execute();
  await db.schema.dropIndex('channels_workspace_idx').ifExists().execute();
  await db.schema.dropTable('channels').execute();
}
