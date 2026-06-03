import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('plugin_settings')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('plugin_id', 'text', (c) => c.notNull())
    .addColumn('key', 'text', (c) => c.notNull())
    .addColumn('value', 'jsonb', (c) => c.notNull())
    .addColumn('encrypted', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn('now', [])))
    .addUniqueConstraint('plugin_settings_workspace_plugin_key_unique', ['workspace_id', 'plugin_id', 'key'])
    .execute();

  await db.schema
    .createTable('plugin_cron_jobs')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('plugin_id', 'text', (c) => c.notNull())
    .addColumn('job_name', 'text', (c) => c.notNull())
    .addColumn('schedule', 'text', (c) => c.notNull())
    .addColumn('last_run_at', 'timestamptz')
    .addColumn('next_run_at', 'timestamptz', (c) => c.notNull())
    .addColumn('enabled', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn('now', [])))
    .addUniqueConstraint('plugin_cron_jobs_workspace_plugin_name_unique', ['workspace_id', 'plugin_id', 'job_name'])
    .execute();

  await db.schema
    .createTable('plugin_notifications')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('plugin_id', 'text', (c) => c.notNull())
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('body', 'text')
    .addColumn('type', 'text', (c) => c.notNull().defaultTo('info'))
    .addColumn('read', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn('now', [])))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('plugin_notifications').execute();
  await db.schema.dropTable('plugin_cron_jobs').execute();
  await db.schema.dropTable('plugin_settings').execute();
}
