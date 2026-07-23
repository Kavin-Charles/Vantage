import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('contacts').addColumn('title', 'text', c => c).execute();
  await db.schema.alterTable('contacts').addColumn('social_links', 'jsonb', c => c).execute();
  await db.schema.alterTable('contacts').addColumn('avatar_url', 'text', c => c).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('contacts').dropColumn('avatar_url').execute();
  await db.schema.alterTable('contacts').dropColumn('social_links').execute();
  await db.schema.alterTable('contacts').dropColumn('title').execute();
}
