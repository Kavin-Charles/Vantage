import type { Kysely } from 'kysely';
import { sql } from 'kysely';
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').addColumn('default_landing_page', 'text', c => c).execute();
  await db.schema.alterTable('users').addColumn('totp_secret', 'text', c => c).execute();
  await db.schema.alterTable('users').addColumn('totp_enabled', 'boolean', c => c.defaultTo(false).notNull()).execute();
  await db.schema.createTable('user_recovery_codes')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', c => c.notNull())
    .addColumn('code_hash', 'text', c => c.notNull())
    .addColumn('used_at', 'timestamptz', c => c)
    .addColumn('created_at', 'timestamptz', c => c.defaultTo(sql`now()`).notNull())
    .execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_recovery_codes').execute();
  await db.schema.alterTable('users').dropColumn('totp_enabled').execute();
  await db.schema.alterTable('users').dropColumn('totp_secret').execute();
  await db.schema.alterTable('users').dropColumn('default_landing_page').execute();
}
