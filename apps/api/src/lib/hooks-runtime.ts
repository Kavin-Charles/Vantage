import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { getActiveProviderForContract } from '@vencore/plugin-runtime';
import { HOOK_REGISTRY } from '../modules/registry';

export interface ResolvedHook {
  hookProviderId: string;
  providerStringId: string;
}

/**
 * Returns the provider powering a hook feature, or null when the feature is
 * disabled. Callers must silently skip hook-dependent logic on null.
 *
 * Switch model: the provider is no longer chosen per feature. A feature with
 * `requires_contract` is powered by the workspace's active provider for that
 * contract's group (admin picks once in Settings → Data providers). The
 * per-feature enable/disable toggle in workspace_hook_configs still gates it.
 */
export async function resolveHook(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
  featureId: string,
): Promise<ResolvedHook | null> {
  const feature = HOOK_REGISTRY[moduleId]?.find((f) => f.id === featureId);
  if (!feature) return null;

  const config = await db
    .selectFrom('workspace_hook_configs')
    .select(['enabled'])
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', moduleId)
    .where('feature_id', '=', featureId)
    .executeTakeFirst();

  if (!config?.enabled) return null;

  if (feature.requires_contract) {
    const active = await getActiveProviderForContract(db as Kysely<any>, workspaceId, feature.requires_contract);
    if (active) {
      return { hookProviderId: '', providerStringId: active.provider };
    }
    // Contract exists but belongs to no group — standalone contracts have no
    // switch; fall through to legacy provider row resolution below.
  }

  // Legacy path: feature without requires_contract keeps the explicit
  // provider row selection from PR #48.
  const row = await db
    .selectFrom('workspace_hook_configs')
    .innerJoin('hook_providers', 'hook_providers.id', 'workspace_hook_configs.provider_id')
    .where('workspace_hook_configs.workspace_id', '=', workspaceId)
    .where('workspace_hook_configs.module_id', '=', moduleId)
    .where('workspace_hook_configs.feature_id', '=', featureId)
    .where('workspace_hook_configs.enabled', '=', true)
    .where('hook_providers.enabled', '=', true)
    .select([
      'hook_providers.id as hookProviderId',
      'hook_providers.provider_id as providerStringId',
    ])
    .executeTakeFirst();

  return row ?? null;
}
