import type { ModuleDefinition } from '../types';

export const WEBSITES_MODULE: ModuleDefinition = {
  id: 'websites',
  name: 'Websites',
  description: 'Website uptime monitoring, response times, and SSL expiry.',
  icon: 'Globe',
  defaultEnabled: true,
  permissions: [
    { key: 'websites:view',   label: 'View websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:create', label: 'Add websites',    defaultRoles: ['admin', 'member'] },
    { key: 'websites:edit',   label: 'Edit websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:delete', label: 'Delete websites', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Websites', path: '/websites', icon: 'Globe' }],
  apiPrefixes: ['/websites'],
  workers: ['website-checker'],
};
