import 'dotenv/config';
import { createDb } from '@vencore/db';
async function main() {
  const db = createDb(process.env['DATABASE_URL']!);
  const rts = await db.selectFrom('record_types').selectAll().execute();
  console.log(JSON.stringify(rts.map(r => ({ id: r.id.slice(0, 8), name: r.name })), null, 2));
  await (db as unknown as { destroy: () => Promise<void> }).destroy();
}
main().catch(e => { console.error(e); process.exit(1); });
