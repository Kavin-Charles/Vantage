import type { HookFeature } from '../hook-types';

export const PROJECT_MANAGEMENT_HOOKS: HookFeature[] = [
  {
    id: 'auto_project_from_deal',
    name: 'Automatic Project Creation',
    description: 'Create projects automatically when a deal is won in your CRM.',
    compatible_providers: [
      { id: 'vencore-crm',       name: 'Vencore CRM' },
      { id: 'salesforce-plugin', name: 'Salesforce Plugin' },
      { id: 'zoho-crm-plugin',   name: 'Zoho CRM Plugin' },
      { id: 'hubspot-plugin',    name: 'HubSpot Plugin' },
    ],
  },
  {
    id: 'customer_sync',
    name: 'Customer Synchronisation',
    description: 'Display customer information directly within projects.',
    compatible_providers: [
      { id: 'vencore-crm',       name: 'Vencore CRM' },
      { id: 'salesforce-plugin', name: 'Salesforce Plugin' },
      { id: 'zoho-crm-plugin',   name: 'Zoho CRM Plugin' },
      { id: 'hubspot-plugin',    name: 'HubSpot Plugin' },
    ],
  },
  {
    id: 'revenue_attribution',
    name: 'Revenue Attribution',
    description: 'Track project revenue using opportunities from your CRM.',
    compatible_providers: [
      { id: 'vencore-crm',       name: 'Vencore CRM' },
      { id: 'salesforce-plugin', name: 'Salesforce Plugin' },
      { id: 'zoho-crm-plugin',   name: 'Zoho CRM Plugin' },
    ],
  },
  {
    id: 'client_activity_timeline',
    name: 'Client Activity Timeline',
    description: 'Show CRM contact activity directly inside project timelines.',
    compatible_providers: [
      { id: 'vencore-crm',       name: 'Vencore CRM' },
      { id: 'salesforce-plugin', name: 'Salesforce Plugin' },
    ],
  },
];
