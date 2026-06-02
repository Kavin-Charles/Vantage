import type { ModuleDefinition } from '../types';

export const ACTIVITY_MODULE: ModuleDefinition = {
  id: 'activity',
  name: 'Activity',
  description: 'Unified activity feed across all workspace records.',
  icon: 'Activity',
  defaultEnabled: true,
  permissions: [
    { key: 'activity:view',   label: 'View activity feed', defaultRoles: ['admin', 'member'] },
    { key: 'activity:create', label: 'Log activity',       defaultRoles: ['admin', 'member'] },
  ],
  nav: [{ label: 'Activity', path: '/activity', icon: 'Activity' }],
  apiPrefixes: ['/activity'],
  workers: [],
};
