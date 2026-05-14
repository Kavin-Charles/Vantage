import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('servers')
    .addColumn('ssh_port', 'integer', col => col.notNull().defaultTo(22))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('servers')
    .dropColumn('ssh_port')
    .execute();
}
