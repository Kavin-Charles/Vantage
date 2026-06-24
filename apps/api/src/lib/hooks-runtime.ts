import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export interface ResolvedHook {
  hookProviderId: string;
  providerStringId: string;
}

/**
 * Returns the active provider for a hook feature, or null if the feature
 * is not configured / disabled / provider removed.
 * Callers must silently skip hook-dependent logic when null is returned.
 */
export async function resolveHook(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
  featureId: string,
): Promise<ResolvedHook | null> {
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
