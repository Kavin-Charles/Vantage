import type { ModuleDefinition } from '../types';

export const DASHBOARD_MODULE: ModuleDefinition = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Admin-configurable drag-and-drop dashboards assigned to user groups.',
  icon: 'LayoutDashboard',
  defaultEnabled: true,
  permissions: [],
  nav: [{ label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' }],
  apiPrefixes: ['/dashboards'],
  workers: [],
};
