import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_ssh_keypairs')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().unique().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('public_key', 'text', col => col.notNull())
    .addColumn('encrypted_private_key', 'text', col => col.notNull())
    .addColumn('iv', 'varchar(32)', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('ssh_command_log')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('server_id', 'uuid', col =>
      col.notNull().references('servers.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('command', 'text', col => col.notNull())
    .addColumn('exit_code', 'integer')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('ssh_command_log_server_id_idx')
    .on('ssh_command_log')
    .columns(['server_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ssh_command_log').execute();
  await db.schema.dropTable('workspace_ssh_keypairs').execute();
}
