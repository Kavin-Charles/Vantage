import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('emails').dropColumn('body_html').execute();
  await db.schema.alterTable('emails').dropColumn('body_text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('emails').addColumn('body_html', 'text').execute();
  await db.schema.alterTable('emails').addColumn('body_text', 'text').execute();
}
