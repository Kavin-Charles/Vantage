import type { ModuleDefinition } from '../types';

export const SERVERS_MODULE: ModuleDefinition = {
  id: 'servers',
  name: 'Servers',
  description: 'Server monitoring and agent heartbeats.',
  icon: 'Server',
  defaultEnabled: true,
  permissions: [
    { key: 'servers:view',   label: 'View servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:create', label: 'Add servers',    defaultRoles: ['admin', 'member'] },
    { key: 'servers:edit',   label: 'Edit servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:delete', label: 'Delete servers', defaultRoles: ['admin'] },
    { key: 'servers:ssh',    label: 'SSH access (terminal, files, services)', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Servers', path: '/servers', icon: 'Server' }],
  apiPrefixes: ['/servers', '/deployments', '/agent', '/ssh'],
  workers: [],
  emitsActivity: true,
  emitsAlerts: true,
};
