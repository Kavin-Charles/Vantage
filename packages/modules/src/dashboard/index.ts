import type { ModuleDefinition } from '../types';

export const DASHBOARD_MODULE: ModuleDefinition = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Admin-configurable drag-and-drop dashboards assigned to user groups.',
  icon: 'LayoutDashboard',
  defaultEnabled: true,
  permissions: [
    { key: 'dashboard:view',   label: 'View dashboards',        defaultRoles: ['admin', 'member'] },
    { key: 'dashboard:manage', label: 'Manage dashboards',      defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' }],
  apiPrefixes: ['/dashboards'],
  workers: [],
};
