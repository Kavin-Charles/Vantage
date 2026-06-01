import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_permissions')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('permission', sql`varchar(255)`, col => col.notNull())
    .addColumn('granted', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('user_permissions_unique_idx')
    .on('user_permissions')
    .columns(['workspace_id', 'user_id', 'permission'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_permissions').execute();
}
