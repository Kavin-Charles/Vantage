import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('pipeline_items')
    .addColumn('contact_id', 'uuid', c => c.references('contacts.id').onDelete('set null'))
    .addColumn('company_id', 'uuid', c => c.references('companies.id').onDelete('set null'))
    .execute();
  await db.schema.createIndex('pipeline_items_contact_id_idx').on('pipeline_items').column('contact_id').execute();
  await db.schema.createIndex('pipeline_items_company_id_idx').on('pipeline_items').column('company_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('pipeline_items_company_id_idx').execute();
  await db.schema.dropIndex('pipeline_items_contact_id_idx').execute();
  await db.schema.alterTable('pipeline_items').dropColumn('company_id').dropColumn('contact_id').execute();
}
