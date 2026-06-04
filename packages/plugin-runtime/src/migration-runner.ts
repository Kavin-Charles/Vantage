import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { PluginMigration } from '@vencore/plugin-types';

type DB = Kysely<any>;

const MIGRATION_LOG_TABLE = 'plugin_migration_log';

/**
 * Creates plugin_migration_log if it doesn't exist.
 * Safe to call repeatedly — uses IF NOT EXISTS.
 */
export async function ensureMigrationLog(db: DB): Promise<void> {
  await (db as any).schema
    .createTable(MIGRATION_LOG_TABLE)
    .ifNotExists()
    .addColumn('id', 'uuid', (col: any) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('plugin_slug', 'varchar', (col: any) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col: any) => col.notNull())
    .addColumn('version', 'varchar', (col: any) => col.notNull())
    .addColumn('direction', 'varchar', (col: any) => col.notNull())
    .addColumn('applied_at', 'timestamptz', (col: any) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('plugin_migration_log_unique', ['plugin_slug', 'workspace_id', 'version', 'direction'])
    .execute();
}

/**
 * Runs all missing migrations for a plugin in a workspace, in ascending version order.
 * Idempotent — already-applied versions are skipped.
 *
 * @note Not safe for concurrent calls with identical (pluginSlug, workspaceId).
 * The unique constraint on plugin_migration_log prevents duplicate log entries,
 * but DDL in migration.up may still execute twice under concurrent load.
 * Install endpoints should serialize calls per plugin+workspace.
 */
export async function runMigrations(
  db: DB,
  pluginSlug: string,
  workspaceId: string,
  migrations: PluginMigration[],
): Promise<void> {
  if (migrations.length === 0) return;

  await ensureMigrationLog(db);

  const applied = await (db as any)
    .selectFrom(MIGRATION_LOG_TABLE)
    .select('version')
    .where('plugin_slug', '=', pluginSlug)
    .where('workspace_id', '=', workspaceId)
    .where('direction', '=', 'up')
    .execute() as Array<{ version: string }>;

  const appliedVersions = new Set(applied.map((r: { version: string }) => r.version));

  const sorted = [...migrations].sort((a, b) => a.version.localeCompare(b.version));

  for (const migration of sorted) {
    if (appliedVersions.has(migration.version)) continue;

    // Execute plugin-supplied DDL
    await (sql.raw(migration.up) as any).execute(db);

    await (db as any)
      .insertInto(MIGRATION_LOG_TABLE)
      .values({
        plugin_slug: pluginSlug,
        workspace_id: workspaceId,
        version: migration.version,
        direction: 'up',
      })
      .execute();
  }
}

/**
 * Rolls back migrations in reverse order.
 * No-op for migrations without a `down` SQL.
 *
 * @param toVersion Roll back all migrations at or below this version.
 */
export async function rollbackMigrations(
  db: DB,
  pluginSlug: string,
  workspaceId: string,
  migrations: PluginMigration[],
  toVersion: string,
): Promise<void> {
  await ensureMigrationLog(db);

  const sorted = [...migrations]
    .sort((a, b) => b.version.localeCompare(a.version))
    .filter((m) => m.version.localeCompare(toVersion) <= 0 && m.down);

  for (const migration of sorted) {
    if (!migration.down) continue;
    await (sql.raw(migration.down) as any).execute(db);
    await (db as any)
      .insertInto(MIGRATION_LOG_TABLE)
      .values({
        plugin_slug: pluginSlug,
        workspace_id: workspaceId,
        version: migration.version,
        direction: 'down',
      })
      .execute();
  }
}
