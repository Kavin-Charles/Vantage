import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL`.execute(db);
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL`.execute(db);
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_item_id uuid REFERENCES pipeline_items(id) ON DELETE SET NULL`.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS idx_projects_contact ON projects(contact_id) WHERE contact_id IS NOT NULL`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_projects_source_item ON projects(source_item_id) WHERE source_item_id IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_projects_contact`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_projects_source_item`.execute(db);
  await sql`ALTER TABLE projects DROP COLUMN IF EXISTS contact_id`.execute(db);
  await sql`ALTER TABLE projects DROP COLUMN IF EXISTS company_id`.execute(db);
  await sql`ALTER TABLE projects DROP COLUMN IF EXISTS source_item_id`.execute(db);
}
