import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE dashboard_layouts ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE dashboard_layouts DROP COLUMN IF EXISTS config`.execute(db);
}
