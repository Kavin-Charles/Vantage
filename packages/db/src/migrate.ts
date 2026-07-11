import { Migrator, FileMigrationProvider } from 'kysely';
import * as path from 'path';
import { promises as fs } from 'fs';
import { createDb } from './client';

export async function migrate(db: any): Promise<{ error?: any; results?: any[] }> {
  const isTsNode = __filename.endsWith('.ts');
  const migrationFolder = isTsNode 
    ? path.join(__dirname, '../migrations') 
    : path.join(__dirname, 'migrations');

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder,
    }),
    allowUnorderedMigrations: true,
  });

  const { error, results } = await migrator.migrateToLatest();
  return { error, results };
}

async function runCli(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('DATABASE_URL env var is required');
    process.exit(1);
  }

  const db = createDb(connectionString);
  const { error, results } = await migrate(db);


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

if (require.main === module) {
  runCli();
}

