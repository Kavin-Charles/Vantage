import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('channel_read_state')
    .addColumn('channel_id', 'uuid', c => c.notNull().references('channels.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('last_read_message_id', 'uuid', c => c.references('messages.id').onDelete('set null'))
    .addPrimaryKeyConstraint('channel_read_state_pkey', ['channel_id', 'user_id'])
    .execute();

  // Full-text search index on message body, scoped to workspace via partial index style
  await sql`
    CREATE INDEX messages_fts_idx
    ON messages
    USING GIN(to_tsvector('english', body))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS messages_fts_idx`.execute(db);
  await db.schema.dropTable('channel_read_state').execute();
}
