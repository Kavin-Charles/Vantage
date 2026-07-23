import type { HookFeature } from '@vencore/modules';

/**
 * CRM-owned hook feature(s). Unlike the plugin-contract-driven features in
 * packages/modules/src/projects/hooks.ts, the provider here (`analytics`) is
 * a core builtin module rather than something plugins can supply — so
 * compatibility is a static compatible_providers entry, not requires_contract.
 * The provider becomes an installed hook_provider (`vencore-analytics`) only
 * once the Analytics module is enabled for the workspace (see
 * MODULE_PROVIDER_MAP in ../routes/workspace-modules.ts), which is what
 * flips this feature's state between `provider_required` and `available`.
 */
export const CRM_HOOK_FEATURES: HookFeature[] = [
  {
    id: 'crm-analytics',
    name: 'CRM Analytics',
    description: 'Pipeline-by-stage, win-rate, and revenue analytics for CRM records.',
    compatible_providers: [
      { id: 'vencore-analytics', name: 'Analytics' },
    ],
  },
];
