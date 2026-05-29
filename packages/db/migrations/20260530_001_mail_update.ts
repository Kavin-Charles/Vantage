import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('email_accounts')
    .addColumn('gmail_watch_expiry', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('emails_deal_id_idx')
    .on('emails')
    .column('deal_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('emails_deal_id_idx').execute();
  await db.schema
    .alterTable('email_accounts')
    .dropColumn('gmail_watch_expiry')
    .execute();
}
