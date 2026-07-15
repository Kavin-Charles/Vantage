import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logActivity } from './log-activity';

interface LogStageChangedParams {
  db: Kysely<Database>;
  itemId: string;
  pipelineId: string;
  workspaceId: string;
  userId: string | null;
  fromStageId: string;
  toStageId: string;
}

export async function logStageChanged(p: LogStageChangedParams) {
  await p.db.insertInto('pipeline_activity').values({
    item_id: p.itemId,
    pipeline_id: p.pipelineId,
    workspace_id: p.workspaceId,
    user_id: p.userId,
    event_type: 'stage_changed',
    payload: { from_stage_id: p.fromStageId, to_stage_id: p.toStageId } as any,
  }).execute();

  void logActivity(p.db, {
    workspace_id: p.workspaceId,
    user_id: p.userId ?? null,
    type: 'deal_change',
    source_module_id: 'crm',
    record_id: p.itemId,
    meta: { from_stage_id: p.fromStageId, to_stage_id: p.toStageId },
  });
}

interface LogFieldChangedParams {
  db: Kysely<Database>;
  itemId: string;
  pipelineId: string;
  workspaceId: string;
  userId: string | null;
  fieldKey: string;
  oldValue: unknown;
  newValue: unknown;
}

export async function logFieldChanged(p: LogFieldChangedParams) {
  await p.db.insertInto('pipeline_activity').values({
    item_id: p.itemId,
    pipeline_id: p.pipelineId,
    workspace_id: p.workspaceId,
    user_id: p.userId,
    event_type: 'field_changed',
    payload: { field_key: p.fieldKey, old_value: p.oldValue, new_value: p.newValue } as any,
  }).execute();
}

interface LogItemCreatedParams {
  db: Kysely<Database>;
  itemId: string;
  pipelineId: string;
  workspaceId: string;
  userId: string | null;
}

export async function logItemCreated(p: LogItemCreatedParams) {
  await p.db.insertInto('pipeline_activity').values({
    item_id: p.itemId,
    pipeline_id: p.pipelineId,
    workspace_id: p.workspaceId,
    user_id: p.userId,
    event_type: 'item_created',
    payload: {} as any,
  }).execute();
}
