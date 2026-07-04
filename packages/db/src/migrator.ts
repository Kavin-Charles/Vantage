import { Kysely, Migrator, FileMigrationProvider, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import * as path from 'path';
import { promises as fs } from 'fs';

const MIGRATION_LOCK_ID = 74123001;

/**
 * Runs all pending migrations from the compiled migrations folder
 * (dist/migrations). Safe to call concurrently from multiple processes:
 * a Postgres advisory lock serialises runners. Uses its own single-connection
 * pool so lock and unlock happen on the same session.
 *
 * Only usable from compiled output (dist/) — the compiled migrations folder
 * sits next to this file after build.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });

  try {
    await sql`SELECT pg_advisory_lock(${sql.lit(MIGRATION_LOCK_ID)})`.execute(db);

    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, 'migrations'),
      }),
    });

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach(r => {
      if (r.status === 'Success') console.log(`migration ✓ ${r.migrationName}`);
      else if (r.status === 'Error') console.error(`migration ✗ ${r.migrationName}`);
    });

    if (error) throw error instanceof Error ? error : new Error(String(error));
  } finally {
    await sql`SELECT pg_advisory_unlock(${sql.lit(MIGRATION_LOCK_ID)})`.execute(db).catch(() => {});
    await db.destroy();
  }
}
