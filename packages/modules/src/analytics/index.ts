import type { ModuleDefinition } from '../types';

export const ANALYTICS_MODULE: ModuleDefinition = {
  id: 'analytics',
  name: 'Analytics',
  description: 'Revenue, pipeline stats, and team leaderboard.',
  icon: 'BarChart2',
  defaultEnabled: true,
  permissions: [
    { key: 'analytics:view', label: 'View analytics', defaultRoles: ['admin', 'member'] },
  ],
  nav: [{ label: 'Analytics', path: '/analytics', icon: 'BarChart2' }],
  apiPrefixes: ['/analytics'],
  workers: [],
};
