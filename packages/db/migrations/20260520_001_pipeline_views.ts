import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS view varchar(20) NOT NULL DEFAULT 'kanban'`.execute(db);
  await sql`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS table_columns jsonb`.execute(db);
  await sql`ALTER TABLE pipelines ADD CONSTRAINT pipelines_view_check CHECK (view IN ('kanban','table','list'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE pipelines DROP CONSTRAINT IF EXISTS pipelines_view_check`.execute(db);
  await sql`ALTER TABLE pipelines DROP COLUMN IF EXISTS table_columns`.execute(db);
  await sql`ALTER TABLE pipelines DROP COLUMN IF EXISTS view`.execute(db);
}
