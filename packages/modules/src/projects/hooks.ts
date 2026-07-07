import type { HookFeature } from '../hook-types';

/**
 * Compatibility is contract-driven: `vencore-crm` (builtin) is statically
 * compatible; any plugin whose manifest provides the feature's
 * requires_contract is discovered at runtime. Never hand-list plugin ids
 * here — that recreates the N-squared integration problem.
 */
export const PROJECT_MANAGEMENT_HOOKS: HookFeature[] = [
  {
    id: 'auto_project_from_deal',
    name: 'Automatic Project Creation',
    description: 'Create projects automatically when a deal is won in your CRM.',
    requires_contract: 'crm.deal@v1',
    compatible_providers: [
      { id: 'vencore-crm', name: 'Vencore CRM' },
    ],
  },
  {
    id: 'customer_sync',
    name: 'Customer Synchronisation',
    description: 'Display customer information directly within projects.',
    requires_contract: 'crm.contact@v1',
    compatible_providers: [
      { id: 'vencore-crm', name: 'Vencore CRM' },
    ],
  },
  {
    id: 'revenue_attribution',
    name: 'Revenue Attribution',
    description: 'Track project revenue using opportunities from your CRM.',
    requires_contract: 'crm.deal@v1',
    compatible_providers: [
      { id: 'vencore-crm', name: 'Vencore CRM' },
    ],
  },
  {
    id: 'client_activity_timeline',
    name: 'Client Activity Timeline',
    description: 'Show CRM contact activity directly inside project timelines.',
    requires_contract: 'crm.activity@v1',
    compatible_providers: [
      { id: 'vencore-crm', name: 'Vencore CRM' },
    ],
  },
];
