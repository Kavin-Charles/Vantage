import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS instance_meta (
      id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      latest_version text,
      release_url text,
      last_checked_at timestamptz,
      notified_version text
    )
  `.execute(db);
  await sql`INSERT INTO instance_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS instance_meta`.execute(db);
}
