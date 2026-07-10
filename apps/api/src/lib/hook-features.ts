/**
 * Plugin-declared hook feature registry + host-side dispatcher.
 *
 * A plugin declares hook_features in its manifest. Each is an admin-toggleable
 * behavior that runs inside the plugin sandbox when a contract event fires.
 * The dispatcher listens on contract events across all workspaces; when a
 * matching feature is enabled (and its required contract has an active
 * provider), it forwards `hook:<feature_id>` to the plugin's sandbox with the
 * event payload and the admin-saved config.
 *
 * Core module hook features (e.g. the projects CRM features) are unaffected —
 * they run inline in their own routes / hub-hook-listeners.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginHookFeatureDef, PluginManifest } from '@vencore/plugin-types';
import {
  pluginEventBus, CONTRACT_GROUPS, getActiveProviderForContract,
} from '@vencore/plugin-runtime';
import { sendBusEventToSandbox } from './plugin-sandbox/manager';
import { logger } from './logger';

export interface PluginHookFeatureEntry {
  plugin_id: string;
  plugin_name: string;
  feature: PluginHookFeatureDef;
}

/** All hook features declared by enabled plugins in a workspace. */
export async function listPluginHookFeatures(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<PluginHookFeatureEntry[]> {
  const plugins = await db.selectFrom('workspace_plugins')
    .select(['plugin_id', 'name', 'manifest'])
    .where('workspace_id', '=', workspaceId)
    .where('enabled', '=', true)
    .execute();

  const out: PluginHookFeatureEntry[] = [];
  for (const p of plugins) {
    const mf = p.manifest as unknown as PluginManifest;
    for (const feature of mf.hook_features ?? []) {
      out.push({ plugin_id: p.plugin_id, plugin_name: p.name, feature });
    }
  }
  return out;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const STANDARD_ACTIONS = ['created', 'updated', 'deleted'] as const;

/** All contract events any hook feature could trigger on. */
function triggerEventCatalog(): string[] {
  const events = new Set<string>();
  for (const g of CONTRACT_GROUPS) {
    for (const c of [...g.required, ...g.optional]) {
      for (const a of STANDARD_ACTIONS) events.add(`${c}:${a}`);
    }
  }
  events.add('crm.deal@v1:stage_changed');
  return [...events];
}

async function dispatch(
  db: Kysely<Database>,
  workspaceId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const features = await listPluginHookFeatures(db, workspaceId);
  const matching = features.filter((f) => f.feature.trigger === event);
  if (matching.length === 0) return;

  for (const { plugin_id, feature } of matching) {
    // Enabled for this workspace? (module_id = plugin_id for plugin features)
    const config = await db.selectFrom('workspace_hook_configs')
      .select(['enabled', 'config'])
      .where('workspace_id', '=', workspaceId)
      .where('module_id', '=', plugin_id)
      .where('feature_id', '=', feature.id)
      .executeTakeFirst();
    if (!config?.enabled) continue;

    // Required contract must have an active provider
    if (feature.requires_contract) {
      const active = await getActiveProviderForContract(db as Kysely<any>, workspaceId, feature.requires_contract);
      if (!active) continue;
    }

    const sent = sendBusEventToSandbox(plugin_id, workspaceId, `hook:${feature.id}`, {
      feature: feature.id,
      trigger: event,
      payload,
      config: config.config ?? {},
    });
    if (!sent) {
      logger.warn({ plugin_id, workspaceId, feature: feature.id }, 'Hook feature dispatch: sandbox not running');
    }
  }
}

export function initHookFeatureDispatcher(db: Kysely<Database>): void {
  for (const event of triggerEventCatalog()) {
    pluginEventBus.onGlobal(event, (workspaceId, payload) => {
      dispatch(db, workspaceId, event, payload)
        .catch((err) => logger.error({ err, event, workspaceId }, 'Hook feature dispatch failed'));
    });
  }
}
