import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('dashboards')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('created_by', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('dashboards_workspace_id_idx')
    .on('dashboards')
    .columns(['workspace_id'])
    .execute();

  await db.schema
    .createTable('dashboard_layouts')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('dashboard_id', 'uuid', col =>
      col.notNull().references('dashboards.id').onDelete('cascade'),
    )
    .addColumn('widget_id', 'text', col => col.notNull())
    .addColumn('x', 'integer', col => col.notNull())
    .addColumn('y', 'integer', col => col.notNull())
    .addColumn('w', 'integer', col => col.notNull())
    .addColumn('h', 'integer', col => col.notNull())
    .addColumn('min_w', 'integer')
    .addColumn('min_h', 'integer')
    .addColumn('permission_key', 'text')
    .addColumn('created_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('dashboard_layouts_dashboard_id_idx')
    .on('dashboard_layouts')
    .columns(['dashboard_id'])
    .execute();

  await db.schema
    .createTable('dashboard_group_assignments')
    .addColumn('dashboard_id', 'uuid', col =>
      col.notNull().references('dashboards.id').onDelete('cascade'),
    )
    .addColumn('group_id', 'uuid', col =>
      col.notNull().references('groups.id').onDelete('cascade'),
    )
    .addPrimaryKeyConstraint('dashboard_group_assignments_pk', ['dashboard_id', 'group_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('dashboard_group_assignments').execute();
  await db.schema.dropTable('dashboard_layouts').execute();
  await db.schema.dropTable('dashboards').execute();
}
