/**
 * Runtime teardown when a plugin is force-disabled outside the PATCH route
 * (e.g. by the license-check worker): kill the sandbox, mark the hook
 * provider inactive so hub consumers fall back to the builtin provider, and
 * notify workspace admins.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { deactivateProvider } from '@vencore/plugin-runtime';
import { invalidatePlugin } from './plugin-loader';

export async function disablePluginRuntime(
  db: Kysely<Database>,
  workspaceId: string,
  pluginId: string,
  pluginName: string,
  reason: string,
): Promise<void> {
  invalidatePlugin(pluginId, workspaceId);

  await db.updateTable('hook_providers')
    .set({ enabled: false, updated_at: new Date() })
    .where('workspace_id', '=', workspaceId)
    .where('provider_id', '=', pluginId)
    .execute();

  await deactivateProvider(db as Kysely<any>, workspaceId, pluginId);

  const admins = await db.selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .select('ur.user_id as id')
    .where('ur.workspace_id', '=', workspaceId)
    .where('r.grants_all', '=', true)
    .execute();
  await Promise.allSettled(admins.map((a) =>
    db.insertInto('plugin_notifications').values({
      workspace_id: workspaceId,
      user_id: a.id,
      plugin_id: pluginId,
      title: `${pluginName} was disabled`,
      body: reason,
      type: 'info',
    }).execute(),
  ));
}
