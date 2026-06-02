import type { ModuleDefinition } from './types';

export const COMPANIES_MODULE: ModuleDefinition = {
  id: 'companies',
  name: 'Companies',
  description: 'Company records and relationships.',
  icon: 'Building2',
  defaultEnabled: true,
  permissions: [
    { key: 'companies:view',   label: 'View companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:create', label: 'Create companies', defaultRoles: ['admin', 'member'] },
    { key: 'companies:edit',   label: 'Edit companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:delete', label: 'Delete companies', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Companies', path: '/companies', icon: 'Building2' }],
  apiPrefixes: ['/companies'],
  workers: [],
};
