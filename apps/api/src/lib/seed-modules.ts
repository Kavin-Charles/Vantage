// apps/api/src/lib/seed-modules.ts
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vantage/db';
import { MODULE_REGISTRY } from '../modules/registry';

// Maps installer feature flags → module IDs they control
const FEATURE_MODULE_MAP: Record<string, string[]> = {
  crm:       ['contacts', 'companies', 'pipelines', 'tasks', 'activity'],
  infra:     ['websites', 'servers'],
  analytics: ['analytics'],
  alerts:    [],  // no module yet — handled by alerts system
  files:     [],  // no module yet
};

export async function seedWorkspaceModules(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
  featureOverrides?: Record<string, boolean>,
): Promise<void> {
  // Build disabled set from installer feature selections
  const disabledModules = new Set<string>();
  if (featureOverrides) {
    for (const [feature, enabled] of Object.entries(featureOverrides)) {
      if (!enabled) {
        (FEATURE_MODULE_MAP[feature] ?? []).forEach(id => disabledModules.add(id));
      }
    }
  }

  const rows = MODULE_REGISTRY.map(m => ({
    workspace_id: workspaceId,
    module_id: m.id,
    enabled: disabledModules.has(m.id) ? false : m.defaultEnabled,
  }));

  // Insert all 8, skip conflicts (idempotent)
  await db
    .insertInto('workspace_modules')
    .values(rows)
    .onConflict(oc => oc.columns(['workspace_id', 'module_id']).doNothing())
    .execute();
}
