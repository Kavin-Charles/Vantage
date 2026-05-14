import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_ssh_keypairs')
    .addColumn('ssh_user', 'varchar(64)', col => col.notNull().defaultTo('root'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_ssh_keypairs')
    .dropColumn('ssh_user')
    .execute();
}
