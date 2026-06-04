import 'dotenv/config';
import { createDb } from '@vencore/db';
async function main() {
  const db = createDb(process.env['DATABASE_URL']!);
  const rts = await db.selectFrom('record_types').select(['id', 'name'])
    .where('name', 'in', ['Enquiry', 'Quote', 'Job']).execute();
  for (const rt of rts) {
    const del = await db.deleteFrom('record_type_fields').where('record_type_id', '=', rt.id).executeTakeFirst();
    console.log(`Deleted ${del.numDeletedRows} fields from ${rt.name}`);
  }
  await (db as unknown as { destroy: () => Promise<void> }).destroy();
}
main().catch(e => { console.error(e); process.exit(1); });
