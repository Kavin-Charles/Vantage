import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from './logger';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertResourceType = 'server' | 'database' | 'website' | 'crm' | 'projects';

interface CreateAlertParams {
  workspaceId: string;
  severity: AlertSeverity;
  resourceType: AlertResourceType;
  resourceId?: string;
  message: string;
  messagePrefix?: string;
  sourceModuleId?: string;
}

async function isAlertsEnabled(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('module_event_settings')
    .select('alerts_on')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', moduleId)
    .executeTakeFirst();
  return row?.alerts_on ?? true;
}

async function hasOpenAlert(
  db: Kysely<Database>,
  workspaceId: string,
  resourceType: AlertResourceType,
  resourceId: string,
  messagePrefix: string,
): Promise<boolean> {
  const existing = await db
    .selectFrom('alerts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('resource_type', '=', resourceType as 'server' | 'database' | 'website' | 'crm')
    .where('resource_id', '=', resourceId)
    .where('message', 'like', `${messagePrefix}%`)
    .where('resolved', '=', false)
    .executeTakeFirst();
  return existing !== undefined;
}

export async function createAlert(
  db: Kysely<Database>,
  params: CreateAlertParams,
): Promise<void> {
  try {
    if (params.sourceModuleId) {
      const enabled = await isAlertsEnabled(db, params.workspaceId, params.sourceModuleId);
      if (!enabled) return;
    }

    if (params.resourceId) {
      const prefix = params.messagePrefix ?? params.message;
      const already = await hasOpenAlert(
        db,
        params.workspaceId,
        params.resourceType,
        params.resourceId,
        prefix,
      );
      if (already) return;
    }

    await db
      .insertInto('alerts')
      .values({
        workspace_id: params.workspaceId,
        resource_type: params.resourceType as 'server' | 'database' | 'website' | 'crm',
        resource_id: params.resourceId ?? null,
        severity: params.severity,
        message: params.message,
        acknowledged: false,
        resolved: false,
      })
      .execute();

    logger.info(
      { workspaceId: params.workspaceId, resourceType: params.resourceType, message: params.message },
      'alert created',
    );
  } catch (err) {
    logger.error({ err }, 'createAlert: failed to insert alert');
  }
}
