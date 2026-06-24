import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('message_reactions')
    .addColumn('message_id', 'uuid', c => c.notNull().references('messages.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('emoji', 'varchar(64)', c => c.notNull())
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('message_reactions_pkey', ['message_id', 'user_id', 'emoji'])
    .execute();

  await db.schema
    .createIndex('message_reactions_message_idx')
    .on('message_reactions')
    .columns(['message_id'])
    .execute();

  await db.schema
    .createTable('message_attachments')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('message_id', 'uuid', c => c.notNull().references('messages.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('r2_key', 'varchar(512)', c => c.notNull())
    .addColumn('filename', 'varchar(255)', c => c.notNull())
    .addColumn('size_bytes', 'bigint', c => c.notNull())
    .addColumn('mime_type', 'varchar(120)', c => c.notNull())
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('message_attachments_message_idx')
    .on('message_attachments')
    .columns(['message_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('message_attachments_message_idx').ifExists().execute();
  await db.schema.dropTable('message_attachments').execute();
  await db.schema.dropIndex('message_reactions_message_idx').ifExists().execute();
  await db.schema.dropTable('message_reactions').execute();
}
