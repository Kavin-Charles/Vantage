// apps/api/src/scripts/backfill-modules.ts
import { createDb } from '@vantage/db';
import { seedWorkspaceModules } from '../lib/seed-modules';

async function main() {
  const db = createDb(process.env['DATABASE_URL']!);

  try {
    const workspaces = await db
      .selectFrom('workspaces')
      .select('id')
      .execute();

    console.log(`Backfilling ${workspaces.length} workspaces...`);

    for (const ws of workspaces) {
      try {
        await seedWorkspaceModules(db, ws.id);
        console.log(`  ✓ ${ws.id}`);
      } catch (err) {
        console.error(`  ✗ ${ws.id}`, err);
      }
    }

    console.log('Done.');
  } finally {
    await db.destroy();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
