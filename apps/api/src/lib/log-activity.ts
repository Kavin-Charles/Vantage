import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from './logger';

export type ActivityType =
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'deal_change'
  | 'infra_alert'
  | 'contact_created'
  | 'task_done'
  | 'database_added'
  | 'database_removed'
  | 'database_settings_changed'
  | 'database_connection_tested'
  | 'project_created'
  | 'project_updated'
  | 'project_archived'
  | 'pm_task_created'
  | 'pm_task_assigned'
  | 'pm_task_status_changed'
  | 'pm_comment_added'
  | 'milestone_created'
  | 'milestone_completed'
  | 'sprint_started'
  | 'sprint_ended'
  | 'pm_time_logged';

interface ActivityPayload {
  workspace_id: string;
  user_id: string | null;
  type: ActivityType;
  source_module_id?: string;
  body?: string;
  contact_id?: string;
  record_id?: string;
  meta?: Record<string, unknown>;
}

async function isActivityEnabled(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('module_event_settings')
    .select('activity_on')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', moduleId)
    .executeTakeFirst();
  return row?.activity_on ?? true;
}

export async function logActivity(
  db: Kysely<Database>,
  payload: ActivityPayload,
): Promise<void> {
  try {
    if (payload.source_module_id) {
      const enabled = await isActivityEnabled(db, payload.workspace_id, payload.source_module_id);
      if (!enabled) return;
    }

    await db
      .insertInto('activities')
      .values({
        workspace_id: payload.workspace_id,
        user_id: payload.user_id,
        type: payload.type,
        body: payload.body ?? null,
        contact_id: payload.contact_id ?? null,
        record_id: payload.record_id ?? null,
        meta: payload.meta ?? null,
      })
      .execute();
  } catch (err) {
    logger.error({ err }, 'logActivity: failed to insert activity');
  }
}
