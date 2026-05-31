import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_modules')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('module_id', 'varchar(64)', col => col.notNull())
    .addColumn('enabled', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('updated_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_by', 'uuid', col =>
      col.references('users.id').onDelete('set null'),
    )
    .addUniqueConstraint('workspace_modules_workspace_module_unique', [
      'workspace_id',
      'module_id',
    ])
    .execute();

  await db.schema
    .createIndex('workspace_modules_workspace_idx')
    .on('workspace_modules')
    .columns(['workspace_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('workspace_modules_workspace_idx').execute();
  await db.schema.dropTable('workspace_modules').execute();
}
