import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add is_active to users
  await db.schema
    .alterTable('users')
    .addColumn('is_active', 'boolean', col => col.notNull().defaultTo(true))
    .execute();

  // Groups
  await db.schema
    .createTable('groups')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', sql`varchar(100)`, col => col.notNull())
    .addColumn('description', 'text')
    .addColumn('color', sql`varchar(7)`, col => col.notNull().defaultTo('#6b665c'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('groups_workspace_name_unique')
    .on('groups')
    .columns(['workspace_id', 'name'])
    .unique()
    .execute();

  // Group members
  await db.schema
    .createTable('group_members')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('group_id', 'uuid', col => col.notNull().references('groups.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('group_members_unique')
    .on('group_members')
    .columns(['group_id', 'user_id'])
    .unique()
    .execute();

  // Group permissions
  await db.schema
    .createTable('group_permissions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('group_id', 'uuid', col => col.notNull().references('groups.id').onDelete('cascade'))
    .addColumn('permission', sql`varchar(255)`, col => col.notNull())
    .addColumn('granted', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('group_permissions_unique')
    .on('group_permissions')
    .columns(['group_id', 'permission'])
    .unique()
    .execute();

  // Invites
  await db.schema
    .createTable('invites')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('email', sql`varchar(255)`, col => col.notNull())
    .addColumn('token', sql`varchar(64)`, col => col.notNull().unique())
    .addColumn('invited_by', 'uuid', col => col.notNull().references('users.id'))
    .addColumn('role', sql`varchar(20)`, col => col.notNull().defaultTo('member'))
    .addColumn('expires_at', 'timestamptz', col => col.notNull())
    .addColumn('accepted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('invites').execute();
  await db.schema.dropTable('group_permissions').execute();
  await db.schema.dropTable('group_members').execute();
  await db.schema.dropTable('groups').execute();
  await db.schema.alterTable('users').dropColumn('is_active').execute();
}
