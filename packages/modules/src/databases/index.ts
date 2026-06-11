import type { ModuleDefinition } from '../types';

export const DATABASES_MODULE: ModuleDefinition = {
  id: 'databases',
  name: 'Databases',
  description: 'Database health monitoring and connection management.',
  icon: 'Database',
  defaultEnabled: true,
  permissions: [
    { key: 'databases:view',   label: 'View databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:create', label: 'Add databases',    defaultRoles: ['admin', 'member'] },
    { key: 'databases:edit',   label: 'Edit databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:delete', label: 'Delete databases', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Databases', path: '/databases', icon: 'Database' }],
  apiPrefixes: ['/databases'],
  workers: [],
};
