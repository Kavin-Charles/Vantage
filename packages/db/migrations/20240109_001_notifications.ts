import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('type', 'varchar(50)', col => col.notNull())
    .addColumn('title', 'varchar(255)', col => col.notNull())
    .addColumn('body', 'text')
    .addColumn('resource_type', 'varchar(50)')
    .addColumn('resource_id', 'uuid')
    .addColumn('read', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('notifications_user_id_idx')
    .on('notifications')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('notifications_workspace_read_idx')
    .on('notifications')
    .columns(['workspace_id', 'read'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notifications').ifExists().execute();
}
