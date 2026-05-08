import { Migrator, FileMigrationProvider } from 'kysely';
import * as path from 'path';
import { promises as fs } from 'fs';
import { createDb } from './client';

async function migrate(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('DATABASE_URL env var is required');
    process.exit(1);
  }

  const db = createDb(connectionString);

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, '../../migrations'),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach(r => {
    if (r.status === 'Success') {
      console.log(`✓ ${r.migrationName}`);
    } else if (r.status === 'Error') {
      console.error(`✗ ${r.migrationName}`);
    }
  });

  if (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }

  if (!results?.length) {
    console.log('No pending migrations.');
  }

  await db.destroy();
}

migrate();
