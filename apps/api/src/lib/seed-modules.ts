// apps/api/src/lib/seed-modules.ts
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { MODULE_REGISTRY } from '../modules/registry';
import { CRM_SUBMODULE_IDS } from '@vencore/modules';

// Maps installer feature flags → module IDs they control
const FEATURE_MODULE_MAP: Record<string, string[]> = {
  crm:       ['crm', 'activity', ...CRM_SUBMODULE_IDS],
  infra:     ['websites', 'servers', 'databases'],
  analytics: ['analytics'],
  alerts:    [],  // no module yet — handled by alerts system
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

  const rows = [
    ...MODULE_REGISTRY.map(m => ({
      workspace_id: workspaceId,
      module_id: m.id,
      enabled: disabledModules.has(m.id) ? false : m.defaultEnabled,
    })),
    // CRM child modules (crm:pipeline/contacts/companies/tasks) — enabled by
    // default, gated at runtime by the crm parent.
    ...CRM_SUBMODULE_IDS.map(id => ({
      workspace_id: workspaceId,
      module_id: id,
      enabled: !disabledModules.has(id),
    })),
  ];

  // Insert one row per registry module + CRM child, skip conflicts (idempotent)
  await db
    .insertInto('workspace_modules')
    .values(rows)
    .onConflict(oc => oc.columns(['workspace_id', 'module_id']).doNothing())
    .execute();
}
