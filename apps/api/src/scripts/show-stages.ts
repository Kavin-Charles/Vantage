import 'dotenv/config';
import { createDb } from '@vencore/db';
async function main() {
  const db = createDb(process.env['DATABASE_URL']!);
  const rts = await db.selectFrom('record_types').select(['id', 'name']).execute();
  for (const rt of rts) {
    const pips = await db.selectFrom('pipelines').select(['id', 'name']).where('record_type_id', '=', rt.id).execute();
    for (const pip of pips) {
      const stages = await db.selectFrom('pipeline_stages').select(['id', 'name', 'position', 'is_won', 'is_lost', 'color'])
        .where('pipeline_id', '=', pip.id).orderBy('position', 'asc').execute();
      console.log(`\n[${rt.name}] ${pip.name} (${pip.id.slice(0,8)})`);
      stages.forEach(s => console.log(`  ${s.position}: "${s.name}" won=${s.is_won} lost=${s.is_lost} color=${s.color} id=${s.id.slice(0,8)}`));
    }
  }
  await (db as unknown as { destroy: () => Promise<void> }).destroy();
}
main().catch(e => { console.error(e); process.exit(1); });
