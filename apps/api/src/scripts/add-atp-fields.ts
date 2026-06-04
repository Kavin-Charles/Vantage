/**
 * Adds ATP CRM custom fields to Enquiry, Quote, and Job record types.
 * Fields go into record_type_fields (record-type-scoped, shown everywhere).
 * Run: npx tsx src/scripts/add-atp-fields.ts
 */
import 'dotenv/config';
import { createDb } from '@vencore/db';

type FieldDef = { label: string; field_type: string; options?: string[]; is_required?: boolean };

const FIELDS: Record<string, FieldDef[]> = {
  Enquiry: [
    { label: 'Service',     field_type: 'select', options: ['PCB Layout', 'Schematics', 'Full Turn Key', 'Debugging', 'Reengineering', 'Other'] },
    { label: 'Source',      field_type: 'select', options: ['Referral', 'Website', 'Cold Call', 'Email', 'Walk-in', 'Other'] },
    { label: 'Address',     field_type: 'text' },
    { label: 'Notes',       field_type: 'text' },
    { label: 'Referred By', field_type: 'text' },
  ],
  Quote: [
    { label: 'Job Name',      field_type: 'text' },
    { label: 'Quote Details', field_type: 'text' },
    { label: 'Quoted Hours',  field_type: 'number' },
    { label: 'Valid Until',   field_type: 'date' },
  ],
  Job: [
    { label: 'Job Owner',          field_type: 'text' },
    { label: 'Designer',           field_type: 'text' },
    { label: 'Quoted Hours',       field_type: 'number' },
    { label: 'Worked Hours',       field_type: 'number' },
    { label: 'Raj Feedback',       field_type: 'text' },
    { label: 'Started Date',       field_type: 'date' },
    { label: 'Expected Completion',field_type: 'date' },
    { label: 'Release Date',       field_type: 'date' },
    { label: 'Backup Date',        field_type: 'date' },
    { label: 'Payment Status',     field_type: 'select', options: ['Pending', 'Partial', 'Received'] },
    { label: 'Payment Mode',       field_type: 'select', options: ['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Other'] },
    { label: 'Payment Notes',      field_type: 'text' },
    { label: 'Additional Info',    field_type: 'text' },
  ],
};

async function main() {
  const connStr = process.env['DATABASE_URL'];
  if (!connStr) throw new Error('DATABASE_URL not set');
  const db = createDb(connStr);

  const recordTypes = await db
    .selectFrom('record_types')
    .select(['id', 'name'])
    .where('name', 'in', ['Enquiry', 'Quote', 'Job'])
    .execute();

  if (recordTypes.length === 0) {
    console.log('No Enquiry/Quote/Job record types found. Run the ATP seed first.');
    await (db as unknown as { destroy: () => Promise<void> }).destroy();
    return;
  }

  for (const rt of recordTypes) {
    const fieldDefs = FIELDS[rt.name];
    if (!fieldDefs) continue;

    // Get existing fields
    const existing = await db
      .selectFrom('record_type_fields')
      .select(['label'])
      .where('record_type_id', '=', rt.id)
      .execute();
    const existingLabels = new Set(existing.map(f => f.label));

    console.log(`\n${rt.name} (${rt.id.slice(0, 8)}) — ${existing.length} existing fields`);
    let pos = existing.length;

    for (const f of fieldDefs) {
      if (existingLabels.has(f.label)) { console.log(`  skip: ${f.label}`); continue; }
      await db.insertInto('record_type_fields').values({
        record_type_id: rt.id,
        label: f.label,
        field_type: f.field_type as never,
        options: f.options ? JSON.stringify(f.options) : null,
        is_required: f.is_required ?? false,
        position: pos++,
      } as never).execute();
      console.log(`  added: ${f.label}`);
    }
  }

  console.log('\nDone.');
  await (db as unknown as { destroy: () => Promise<void> }).destroy();
}

main().catch(e => { console.error(e); process.exit(1); });
