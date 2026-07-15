import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('instance_meta')
    .ifNotExists()
    .addColumn('id', 'integer', c => c.primaryKey().defaultTo(1).check(sql`id = 1`))
    .addColumn('latest_version', 'text')
    .addColumn('release_url', 'text')
    .addColumn('last_checked_at', 'timestamptz')
    .addColumn('notified_version', 'text')
    .execute();

  await sql`INSERT INTO instance_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('instance_meta').ifExists().execute();
}
