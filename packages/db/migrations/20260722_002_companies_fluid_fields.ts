import type { Kysely } from 'kysely';
import { sql } from 'kysely';
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('companies').addColumn('status', sql`varchar(16)`, c => c.defaultTo('active').notNull()).execute();
  await db.schema.alterTable('companies').addColumn('annual_revenue', sql`numeric(14,2)`, c => c).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('companies').dropColumn('annual_revenue').execute();
  await db.schema.alterTable('companies').dropColumn('status').execute();
}
