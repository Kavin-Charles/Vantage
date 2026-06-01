import { createDb } from './src/client';

async function main() {
  const db = createDb(process.env['DATABASE_URL']!);
  const rows = await db.selectFrom('kysely_migration').select('name').orderBy('name').execute();
  rows.forEach(r => console.log(r.name));
  await db.destroy();
}

main();
