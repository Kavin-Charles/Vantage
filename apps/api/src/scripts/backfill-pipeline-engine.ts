// apps/api/src/scripts/backfill-pipeline-engine.ts
/**
 * One-time backfill: creates "Deal" record type per workspace,
 * migrates stage_fields → record_type_fields, deals → pipeline_records,
 * deal_field_values → record_field_values.
 *
 * Run ONCE after schema migration. Safe to re-run (uses INSERT ... ON CONFLICT DO NOTHING).
 * Usage: DATABASE_URL=postgres://... npx tsx apps/api/src/scripts/backfill-pipeline-engine.ts
 */
import { createDb } from '@vencore/db';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL env var required');
const db = createDb(DATABASE_URL);

async function backfill() {
  const workspaces = await db.selectFrom('workspaces').select(['id']).execute();
  console.log(`Backfilling ${workspaces.length} workspaces...`);

  for (const ws of workspaces) {
    console.log(`  Workspace ${ws.id}`);

    // 1. Create "Deal" record type (skip if already exists)
    let dealType = await db
      .selectFrom('record_types')
      .select(['id'])
      .where('workspace_id', '=', ws.id)
      .where('name', '=', 'Deal')
      .executeTakeFirst();

    if (!dealType) {
      dealType = await db
        .insertInto('record_types')
        .values({
          workspace_id: ws.id,
          name: 'Deal',
          icon: '💰',
          color: '#2d6a4f',
          auto_number_enabled: false,
        } as never)
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // 2. Default permissions — granted to this workspace's system roles.
      // record_type_permissions.role_id is a roles FK (the legacy `role` enum
      // column was dropped by the rbac3 migration), so resolve the workspace's
      // grants_all (Administrator) and is_default (Member) roles instead.
      const adminRole = await db
        .selectFrom('roles')
        .select(['id'])
        .where('workspace_id', '=', ws.id)
        .where('grants_all', '=', true)
        .executeTakeFirst();
      const memberRole = await db
        .selectFrom('roles')
        .select(['id'])
        .where('workspace_id', '=', ws.id)
        .where('is_default', '=', true)
        .executeTakeFirst();

      const permissionRows = [
        ...(adminRole ? [{ record_type_id: dealType.id, role_id: adminRole.id, can_view: true, can_create: true, can_edit: true, can_delete: true }] : []),
        ...(memberRole ? [{ record_type_id: dealType.id, role_id: memberRole.id, can_view: true, can_create: true, can_edit: true, can_delete: false }] : []),
      ];
      if (permissionRows.length > 0) {
        await db.insertInto('record_type_permissions').values(permissionRows as never).execute();
      }
    }

    // 3. Migrate stage_fields → record_type_fields
    // Find all stages belonging to this workspace's pipelines
    const workspacePipelines = await db
      .selectFrom('pipelines')
      .select(['id'])
      .where('workspace_id', '=', ws.id)
      .execute();

    const workspacePipelineIds = workspacePipelines.map(p => p.id);
    if (workspacePipelineIds.length === 0) {
      console.log(`  Skipping workspace ${ws.id} — no pipelines`);
      continue;
    }

    const stages = await db
      .selectFrom('pipeline_stages')
      .select(['id'])
      .where('pipeline_id', 'in', workspacePipelineIds)
      .execute();

    const stageIds = stages.map(s => s.id);
    if (stageIds.length === 0) {
      console.log(`  Skipping workspace ${ws.id} — no stages`);
      continue;
    }

    const stageFields = await db
      .selectFrom('stage_fields')
      .selectAll()
      .where('stage_id', 'in', stageIds)
      .execute();

    // Deduplicate by name, create record_type_fields
    // StageFieldTable uses `name`; RecordTypeFieldTable uses `label`
    const fieldMap = new Map<string, string>(); // old stage_field.id → new record_type_field.id
    const seenNames = new Map<string, string>(); // name → new field id

    for (const sf of stageFields) {
      if (seenNames.has(sf.name)) {
        fieldMap.set(sf.id, seenNames.get(sf.name)!);
        continue;
      }

      const existing = await db
        .selectFrom('record_type_fields')
        .select(['id'])
        .where('record_type_id', '=', dealType.id)
        .where('label', '=', sf.name)
        .executeTakeFirst();

      if (existing) {
        fieldMap.set(sf.id, existing.id);
        seenNames.set(sf.name, existing.id);
        continue;
      }

      const newField = await db
        .insertInto('record_type_fields')
        .values({
          record_type_id: dealType.id,
          label: sf.name,
          field_type: sf.field_type,
          options: sf.options ?? null,
          is_required: sf.is_required,
          position: sf.position,
        } as never)
        .returning(['id'])
        .executeTakeFirstOrThrow();

      fieldMap.set(sf.id, newField.id);
      seenNames.set(sf.name, newField.id);
    }

    // 5. Stage required fields (only for fields flagged is_required)
    const requiredStageFields = stageFields.filter(sf => sf.is_required);
    for (const sf of requiredStageFields) {
      const newFieldId = fieldMap.get(sf.id);
      if (!newFieldId) continue;
      await db
        .insertInto('stage_required_fields')
        .values({ stage_id: sf.stage_id, field_id: newFieldId } as never)
        .onConflict(oc => oc.columns(['stage_id', 'field_id'] as never).doNothing())
        .execute();
    }

    // 6. Migrate deals → pipeline_records
    const deals = await db
      .selectFrom('deals')
      .selectAll()
      .where('workspace_id', '=', ws.id)
      .execute();

    for (const deal of deals) {
      // Use deal's own pipeline_id if set, else find first pipeline for workspace
      const pipelineId = deal.pipeline_id ?? (await db
        .selectFrom('pipelines')
        .select(['id'])
        .where('workspace_id', '=', ws.id)
        .executeTakeFirst()
      )?.id;

      if (!pipelineId) continue;

      // Use deal's own stage_id if set, else find first stage for that pipeline
      const stageId = deal.stage_id ?? (await db
        .selectFrom('pipeline_stages')
        .select(['id'])
        .where('pipeline_id', '=', pipelineId)
        .executeTakeFirst()
      )?.id;

      if (!stageId) continue;

      await db
        .insertInto('pipeline_records')
        .values({
          id: deal.id,
          workspace_id: deal.workspace_id,
          record_type_id: dealType.id,
          pipeline_id: pipelineId,
          stage_id: stageId,
          record_number: null,
          name: deal.name,
          contact_id: deal.contact_id ?? null,
          company_id: deal.company_id ?? null,
          owner_id: deal.owner_id,
          deleted_at: deal.deleted_at ? deal.deleted_at.toISOString() : null,
          created_at: deal.created_at.toISOString(),
          updated_at: deal.updated_at.toISOString(),
        } as never)
        .onConflict(oc => oc.column('id').doNothing())
        .execute();
    }

    // 7. Migrate deal_field_values → record_field_values
    if (deals.length > 0) {
      const dealFieldValues = await db
        .selectFrom('deal_field_values')
        .selectAll()
        .where('deal_id', 'in', deals.map(d => d.id))
        .execute();

      for (const dfv of dealFieldValues) {
        const newFieldId = fieldMap.get(dfv.field_id);
        if (!newFieldId) continue;
        await db
          .insertInto('record_field_values')
          .values({
            record_id: dfv.deal_id,
            field_id: newFieldId,
            value: dfv.value,
          } as never)
          .onConflict(oc => oc.columns(['record_id', 'field_id'] as never).doNothing())
          .execute();
      }
    }

    console.log(`  Done workspace ${ws.id}: ${deals.length} deals migrated, ${stageFields.length} fields processed`);
  }

  console.log('Backfill complete.');
  await db.destroy();
}

backfill().catch(err => { console.error(err); process.exit(1); });
