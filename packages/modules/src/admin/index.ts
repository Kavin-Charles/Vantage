import type { ModuleDefinition } from '../types';

// Administration namespace: workspace-management permissions that were
// previously gated by the admin/member enum. `defaultEnabled` is true and
// this module is never workspace-toggleable in the modules UI (it has no nav).
export const ADMIN_MODULE: ModuleDefinition = {
  id: 'admin',
  name: 'Administration',
  description: 'Workspace administration and access control.',
  icon: 'ShieldCheck',
  defaultEnabled: true,
  permissionGroups: [
    { id: 'access', label: 'Access control' },
    { id: 'workspace', label: 'Workspace' },
  ],
  permissions: [
    { key: 'users:manage',        label: 'Manage users',        defaultRoles: ['admin'], group: 'access' },
    { key: 'roles:manage',        label: 'Manage roles',        defaultRoles: ['admin'], group: 'access' },
    { key: 'workspace:manage',    label: 'Manage workspace',    defaultRoles: ['admin'], group: 'workspace' },
    { key: 'modules:manage',      label: 'Manage modules',      defaultRoles: ['admin'], group: 'workspace' },
    { key: 'plugins:manage',      label: 'Manage plugins',      defaultRoles: ['admin'], group: 'workspace' },
    { key: 'apikeys:manage',      label: 'Manage API keys',     defaultRoles: ['admin'], group: 'workspace' },
    { key: 'integrations:manage', label: 'Manage integrations', defaultRoles: ['admin'], group: 'workspace' },
    { key: 'billing:manage',      label: 'Manage billing',      defaultRoles: ['admin'], group: 'workspace' },
  ],
  nav: [],
  apiPrefixes: [],
  workers: [],
};
