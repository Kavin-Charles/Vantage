import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Make activities.user_id nullable (system/worker events have no user)
  await sql`ALTER TABLE activities ALTER COLUMN user_id DROP NOT NULL`.execute(db);

  // Per-workspace, per-module event settings
  await db.schema
    .createTable('module_event_settings')
    .ifNotExists()
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('module_id', 'text', c => c.notNull())
    .addColumn('activity_on', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('alerts_on', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('module_event_settings_pkey', ['workspace_id', 'module_id'])
    .execute();

  // Alert notification channel/severity preferences
  await db.schema
    .createTable('notification_preferences')
    .ifNotExists()
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('channel', 'text', c => c.notNull().check(sql`channel IN ('email', 'push')`))
    .addColumn('severity', 'text', c => c.notNull().check(sql`severity IN ('critical', 'warning', 'info')`))
    .addColumn('enabled', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('notification_preferences_pkey', ['workspace_id', 'channel', 'severity'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notification_preferences').ifExists().execute();
  await db.schema.dropTable('module_event_settings').ifExists().execute();
  await sql`ALTER TABLE activities ALTER COLUMN user_id SET NOT NULL`.execute(db);
}
