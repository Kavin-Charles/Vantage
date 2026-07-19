/**
 * Host-side listeners that make hook features react to hub data changes from
 * plugin providers. The builtin CRM fires these features inline in its own
 * routes; plugin providers fire them here via the global event bus.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '@vencore/db';
import { pluginEventBus } from '@vencore/plugin-runtime';
import { resolveHook } from './hooks-runtime';
import { seedDefaultStatuses } from '../routes/projects';
import { logger } from './logger';

interface HubChangedPayload {
  provider?: string;
  contract?: string;
  external_ids?: string[];
}

async function autoProjectFromHubDeals(
  db: Kysely<Database>,
  workspaceId: string,
  payload: HubChangedPayload,
): Promise<void> {
  const provider = payload.provider;
  const externalIds = payload.external_ids ?? [];
  if (!provider || externalIds.length === 0) return;

  const hook = await resolveHook(db, workspaceId, 'projects', 'auto_project_from_deal');
  // Only react when the admin selected exactly this plugin as the provider
  if (!hook || hook.providerStringId !== provider) return;

  const wonDeals = await db.selectFrom('plugin_hub_records')
    .select(['id', 'data'])
    .where('workspace_id', '=', workspaceId)
    .where('contract', '=', 'crm.deal@v1')
    .where('provider_plugin_id', '=', provider)
    .where('deleted_at', 'is', null)
    .where('external_id', 'in', externalIds)
    .where(sql<string>`data->>'is_won'`, '=', 'true')
    .execute();

  if (wonDeals.length === 0) return;

  // Creator for auto-created projects: first workspace admin
  const admin = await db.selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .innerJoin('users as u', 'u.id', 'ur.user_id')
    .select('u.id')
    .where('ur.workspace_id', '=', workspaceId)
    .where('r.grants_all', '=', true)
    .orderBy('u.created_at', 'asc')
    .executeTakeFirst();
  if (!admin) return;

  for (const deal of wonDeals) {
    // Idempotent — hub row id is the source_item link
    const existing = await db.selectFrom('projects')
      .select('id')
      .where('source_item_id', '=', deal.id)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (existing) continue;

    const data = (deal.data ?? {}) as Record<string, unknown>;
    const project = await db.insertInto('projects')
      .values({
        workspace_id: workspaceId,
        created_by: admin.id,
        name: String(data['name'] ?? 'New Project'),
        source_item_id: deal.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await seedDefaultStatuses(db, project.id);
    logger.info(
      { workspaceId, provider, dealId: deal.id, projectId: project.id },
      'auto_project_from_deal: created project from hub deal',
    );
  }
}

export function initHubHookListeners(db: Kysely<Database>): void {
  pluginEventBus.onGlobal('hub:crm.deal@v1:changed', (workspaceId, payload) => {
    autoProjectFromHubDeals(db, workspaceId, (payload ?? {}) as HubChangedPayload)
      .catch((err) => logger.error({ err, workspaceId }, 'auto_project_from_deal hub listener failed'));
  });
}
