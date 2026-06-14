import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from './logger';

const DEFAULT_STAGES = [
  { name: 'Lead',       color: '#6366f1', position: 1, is_won: false, is_lost: false },
  { name: 'Qualifying', color: '#8b5cf6', position: 2, is_won: false, is_lost: false },
  { name: 'Proposal',   color: '#a855f7', position: 3, is_won: false, is_lost: false },
  { name: 'Closing',    color: '#ec4899', position: 4, is_won: false, is_lost: false },
  { name: 'Won',        color: '#22c55e', position: 5, is_won: true,  is_lost: false },
  { name: 'Lost',       color: '#ef4444', position: 6, is_won: false, is_lost: true  },
] as const;

const DEAL_FIELDS = [
  { label: 'value',       field_type: 'number' as const, is_required: false, position: 0 },
  { label: 'probability', field_type: 'number' as const, is_required: false, position: 1 },
  { label: 'close_date',  field_type: 'date'   as const, is_required: false, position: 2 },
] as const;

export async function seedDefaultPipeline(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<void> {
  const existing = await db
    .selectFrom('pipelines')
    .where('workspace_id', '=', workspaceId)
    .select(['id'])
    .executeTakeFirst();

  if (existing) return;

  // Create the "Deal" record type first so the pipeline can reference it
  const recordType = await db
    .insertInto('record_types')
    .values({
      workspace_id: workspaceId,
      name: 'Deal',
      icon: '💰',
      auto_number_enabled: true,
      auto_number_prefix: 'DEAL',
      auto_number_format: 'PREFIX-YY-NNN',
      auto_number_sequence: 0,
      position: 0,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  // Default permissions: both roles can view/create/edit; only admin can delete
  await db
    .insertInto('record_type_permissions')
    .values([
      { record_type_id: recordType.id, role: 'admin',  can_view: true, can_create: true, can_edit: true, can_delete: true  },
      { record_type_id: recordType.id, role: 'member', can_view: true, can_create: true, can_edit: true, can_delete: false },
    ])
    .execute();

  // Standard deal fields
  await db
    .insertInto('record_type_fields')
    .values(DEAL_FIELDS.map(f => ({ ...f, record_type_id: recordType.id })))
    .execute();

  // Create the pipeline linked to the record type
  const pipeline = await db
    .insertInto('pipelines')
    .values({
      workspace_id: workspaceId,
      name: 'Sales',
      record_type_id: recordType.id,
      is_default: true,
      position: 0,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  await db
    .insertInto('pipeline_stages')
    .values(DEFAULT_STAGES.map(s => ({ ...s, pipeline_id: pipeline.id })))
    .execute();

  logger.info({ pipelineId: pipeline.id, recordTypeId: recordType.id }, '[Vencore] Default pipeline seeded');
}
