// apps/api/src/lib/seed-modules.ts
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { MODULE_REGISTRY } from '../modules/registry';
import { CRM_SUBMODULE_IDS, INFRA_SUBMODULE_IDS } from '@vencore/modules';

// Maps installer feature flags → module IDs they control
const FEATURE_MODULE_MAP: Record<string, string[]> = {
  crm:       ['crm', 'activity', ...CRM_SUBMODULE_IDS],
  infra:     ['infra:servers', 'infra:databases', 'infra:websites'],
  analytics: ['analytics'],
  alerts:    ['infra:alerts'],
};

const ALL_SUBMODULE_IDS = [...CRM_SUBMODULE_IDS, ...INFRA_SUBMODULE_IDS];

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
      // The infra parent stays enabled unless every one of its children is
      // disabled by installer features (infra + alerts both deselected).
      enabled:
        m.id === 'infra'
          ? INFRA_SUBMODULE_IDS.some(id => !disabledModules.has(id))
          : disabledModules.has(m.id) ? false : m.defaultEnabled,
    })),
    // Parent-module children (crm:*/infra:*) — enabled by default, gated at
    // runtime by their parent.
    ...ALL_SUBMODULE_IDS.map(id => ({
      workspace_id: workspaceId,
      module_id: id,
      enabled: !disabledModules.has(id),
    })),
  ];

  // Insert one row per registry module + CRM/infra child, skip conflicts (idempotent)
  await db
    .insertInto('workspace_modules')
    .values(rows)
    .onConflict(oc => oc.columns(['workspace_id', 'module_id']).doNothing())
    .execute();
}
