import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('approval_requests')
    .addColumn('recipient_email', 'varchar(255)')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('approval_requests').dropColumn('recipient_email').execute()
}
