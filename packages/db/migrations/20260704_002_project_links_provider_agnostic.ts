import { sql } from 'kysely';
import type { Kysely } from 'kysely';

/**
 * Project CRM links become provider-agnostic: contact_id/company_id/
 * source_item_id may point at core CRM rows (builtin provider) OR at
 * plugin_hub_records rows (plugin providers). Hard FKs to core tables can't
 * express that, so they're dropped; the crm-provider adapter resolves links
 * and returns null for dangling ids, which the UI already handles.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_contact_id_fkey`.execute(db);
  await sql`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_company_id_fkey`.execute(db);
  await sql`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_source_item_id_fkey`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Dangling links may exist by now — clean before restoring FKs
  await sql`UPDATE projects SET contact_id = NULL WHERE contact_id IS NOT NULL AND contact_id NOT IN (SELECT id FROM contacts)`.execute(db);
  await sql`UPDATE projects SET company_id = NULL WHERE company_id IS NOT NULL AND company_id NOT IN (SELECT id FROM companies)`.execute(db);
  await sql`UPDATE projects SET source_item_id = NULL WHERE source_item_id IS NOT NULL AND source_item_id NOT IN (SELECT id FROM pipeline_items)`.execute(db);
  await sql`ALTER TABLE projects ADD CONSTRAINT projects_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL`.execute(db);
  await sql`ALTER TABLE projects ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL`.execute(db);
  await sql`ALTER TABLE projects ADD CONSTRAINT projects_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES pipeline_items(id) ON DELETE SET NULL`.execute(db);
}
