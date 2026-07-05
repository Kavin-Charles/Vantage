import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('recurring_task_rules')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('title', 'varchar(500)', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('status_id', 'uuid', c => c.references('project_task_statuses.id').onDelete('set null'))
    .addColumn('priority', 'varchar(20)', c => c.notNull().defaultTo('NONE'))
    .addColumn('assignee_ids', 'jsonb')
    .addColumn('frequency', 'varchar(20)', c => c.notNull())
    .addColumn('interval', 'integer', c => c.notNull().defaultTo(1))
    .addColumn('next_run_at', 'timestamptz', c => c.notNull())
    .addColumn('is_active', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_recurring_rules_project')
    .on('recurring_task_rules')
    .column('project_id')
    .execute();

  await db.schema
    .createIndex('idx_recurring_rules_next_run')
    .on('recurring_task_rules')
    .column('next_run_at')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('recurring_task_rules').ifExists().execute();
}
