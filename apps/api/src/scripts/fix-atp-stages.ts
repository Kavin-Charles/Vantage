/**
 * Fix ATP CRM pipeline stages to exactly match the ATP CRM status enums.
 *
 * Enquiry: New → In Review → Quote Sent → Won (is_won) → Lost (is_lost)
 * Quote:   Draft → Sent → Accepted (is_won) → Declined (is_lost)
 * Job:     Scheduled → In Progress → Completed (is_won) → Cancelled (is_lost)
 *
 * The original "seed" added default Won/Lost stages at positions 0/1 before
 * the ATP stages were added. This script removes those duplicates, fixes
 * is_won/is_lost on the correct ATP stages, and reorders positions.
 */
import 'dotenv/config';
import { createDb } from '@vencore/db';

// Map: pipeline name → desired stage config (order = final position)
const DESIRED: Record<string, { name: string; is_won: boolean; is_lost: boolean; color: string }[]> = {
  Enquiries: [
    { name: 'New',        is_won: false, is_lost: false, color: '#6366f1' },
    { name: 'In Review',  is_won: false, is_lost: false, color: '#8b5cf6' },
    { name: 'Quote Sent', is_won: false, is_lost: false, color: '#a855f7' },
    { name: 'Won',        is_won: true,  is_lost: false, color: '#22c55e' },
    { name: 'Lost',       is_won: false, is_lost: true,  color: '#ef4444' },
  ],
  Quotes: [
    { name: 'Draft',    is_won: false, is_lost: false, color: '#6366f1' },
    { name: 'Sent',     is_won: false, is_lost: false, color: '#8b5cf6' },
    { name: 'Accepted', is_won: true,  is_lost: false, color: '#22c55e' },
    { name: 'Declined', is_won: false, is_lost: true,  color: '#ef4444' },
  ],
  Jobs: [
    { name: 'Scheduled',   is_won: false, is_lost: false, color: '#6366f1' },
    { name: 'In Progress', is_won: false, is_lost: false, color: '#8b5cf6' },
    { name: 'Completed',   is_won: true,  is_lost: false, color: '#22c55e' },
    { name: 'Cancelled',   is_won: false, is_lost: true,  color: '#ef4444' },
  ],
};

async function main() {
  const db = createDb(process.env['DATABASE_URL']!);

  const pipelines = await db
    .selectFrom('pipelines')
    .select(['id', 'name'])
    .where('name', 'in', ['Enquiries', 'Quotes', 'Jobs'])
    .execute();

  for (const pip of pipelines) {
    const desired = DESIRED[pip.name];
    if (!desired) continue;

    const stages = await db
      .selectFrom('pipeline_stages')
      .selectAll()
      .where('pipeline_id', '=', pip.id)
      .orderBy('position', 'asc')
      .execute();

    console.log(`\n${pip.name}:`);

    // Build a map of name → first matching stage (prefer is_won/is_lost match)
    const kept = new Map<string, string>(); // name → id to keep
    const toDelete: string[] = [];

    for (const s of stages) {
      if (!kept.has(s.name)) {
        kept.set(s.name, s.id);
      } else {
        // Duplicate — keep the one that matches the desired is_won/is_lost
        const des = desired.find(d => d.name === s.name);
        if (des) {
          const existing = stages.find(x => x.id === kept.get(s.name)!);
          const existingMatchesDesired = existing &&
            existing.is_won === des.is_won && existing.is_lost === des.is_lost;
          const thisMatchesDesired = s.is_won === des.is_won && s.is_lost === des.is_lost;
          if (!existingMatchesDesired && thisMatchesDesired) {
            // Current one is better — swap
            toDelete.push(kept.get(s.name)!);
            kept.set(s.name, s.id);
          } else {
            toDelete.push(s.id);
          }
        } else {
          // Stage not in desired list at all
          toDelete.push(s.id);
        }
      }
    }

    // Also delete stages whose names don't appear in desired
    for (const s of stages) {
      if (!desired.find(d => d.name === s.name) && !toDelete.includes(s.id)) {
        toDelete.push(s.id);
      }
    }

    // Delete unwanted stages (migrate records first)
    for (const id of toDelete) {
      const stage = stages.find(s => s.id === id);
      console.log(`  delete: "${stage?.name}" (${id.slice(0, 8)}) is_won=${stage?.is_won} is_lost=${stage?.is_lost}`);

      // Migrate any records on this stage to the kept stage of same name
      const keptId = kept.get(stage?.name ?? '');
      if (keptId) {
        const migrated = await db.updateTable('pipeline_records')
          .set({ stage_id: keptId } as never)
          .where('stage_id', '=', id)
          .executeTakeFirst();
        if (migrated.numUpdatedRows > 0n) {
          console.log(`    migrated ${migrated.numUpdatedRows} records → ${keptId.slice(0, 8)}`);
        }
      }

      await db.deleteFrom('pipeline_stages').where('id', '=', id).execute();
    }

    // Update + reposition kept stages
    for (let i = 0; i < desired.length; i++) {
      const des = desired[i]!;
      const stageId = kept.get(des.name);
      if (!stageId) {
        // Stage doesn't exist — insert it
        console.log(`  insert: "${des.name}" at position ${i}`);
        await db.insertInto('pipeline_stages').values({
          pipeline_id: pip.id,
          name: des.name,
          color: des.color,
          is_won: des.is_won,
          is_lost: des.is_lost,
          position: i,
        } as never).execute();
      } else {
        console.log(`  update: "${des.name}" → position ${i}, is_won=${des.is_won}, is_lost=${des.is_lost}`);
        await db.updateTable('pipeline_stages').set({
          name: des.name,
          color: des.color,
          is_won: des.is_won,
          is_lost: des.is_lost,
          position: i,
          updated_at: new Date().toISOString(),
        } as never).where('id', '=', stageId).execute();
      }
    }
  }

  console.log('\nDone.');
  await (db as unknown as { destroy: () => Promise<void> }).destroy();
}

main().catch(e => { console.error(e); process.exit(1); });
