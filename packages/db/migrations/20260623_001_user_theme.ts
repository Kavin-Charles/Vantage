import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('theme', 'varchar(10)', col => col.notNull().defaultTo('light'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('theme').execute();
}
