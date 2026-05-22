import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('calendar_events')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'text', col => col.notNull().defaultTo('other'))
    .addColumn('color', 'text')
    .addColumn('start_date', 'date', col => col.notNull())
    .addColumn('end_date', 'date')
    .addColumn('all_day', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_by', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('calendar_events_workspace_id_idx')
    .on('calendar_events')
    .column('workspace_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('calendar_events_workspace_id_idx').ifExists().execute();
  await db.schema.dropTable('calendar_events').ifExists().execute();
}
