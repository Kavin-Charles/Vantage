import type { ModuleDefinition } from '../types';

export const ALERTS_MODULE: ModuleDefinition = {
  id: 'alerts',
  name: 'Alerts',
  description: 'Infrastructure and workspace alerting with threshold monitoring.',
  icon: 'Bell',
  defaultEnabled: true,
  permissions: [
    { key: 'alerts:view',        label: 'View alerts',           defaultRoles: ['admin', 'member'] },
    { key: 'alerts:acknowledge', label: 'Acknowledge alerts',    defaultRoles: ['admin', 'member'] },
    { key: 'alerts:resolve',     label: 'Resolve alerts',        defaultRoles: ['admin'] },
    { key: 'alerts:configure',   label: 'Configure thresholds',  defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Alerts', path: '/alerts', icon: 'Bell' }],
  apiPrefixes: ['/alerts', '/alert-thresholds'],
  workers: ['alert-eval'],
  emitsAlerts: true,
};
