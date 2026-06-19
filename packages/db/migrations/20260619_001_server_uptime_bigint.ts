import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE servers ALTER COLUMN uptime_seconds TYPE bigint`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE servers ALTER COLUMN uptime_seconds TYPE integer`.execute(db);
}
