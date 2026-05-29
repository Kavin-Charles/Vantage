import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('system_settings')
    .addColumn('key', 'text', c => c.primaryKey())
    .addColumn('value', 'jsonb', c => c.notNull())
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    INSERT INTO system_settings (key, value)
    VALUES ('setup', '{"configured": false}'::jsonb)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('system_settings').ifExists().execute();
}
