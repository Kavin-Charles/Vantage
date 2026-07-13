import type { ModuleDefinition, SubModule } from '../types';

export const INFRA_MODULE: ModuleDefinition = {
  id: 'infra',
  name: 'Infrastructure',
  description: 'Servers, databases, website uptime, and alerting.',
  icon: 'Server',
  defaultEnabled: true,
  permissions: [
    { key: 'servers:view',   label: 'View servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:create', label: 'Add servers',    defaultRoles: ['admin', 'member'] },
    { key: 'servers:edit',   label: 'Edit servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:delete', label: 'Delete servers', defaultRoles: ['admin'] },
    { key: 'servers:ssh',    label: 'SSH access (terminal, files, services)', defaultRoles: ['admin'] },
    { key: 'databases:view',   label: 'View databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:create', label: 'Add databases',    defaultRoles: ['admin', 'member'] },
    { key: 'databases:edit',   label: 'Edit databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:delete', label: 'Delete databases', defaultRoles: ['admin'] },
    { key: 'websites:view',   label: 'View websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:create', label: 'Add websites',    defaultRoles: ['admin', 'member'] },
    { key: 'websites:edit',   label: 'Edit websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:delete', label: 'Delete websites', defaultRoles: ['admin'] },
    { key: 'alerts:view',        label: 'View alerts',          defaultRoles: ['admin', 'member'] },
    { key: 'alerts:acknowledge', label: 'Acknowledge alerts',   defaultRoles: ['admin', 'member'] },
    { key: 'alerts:resolve',     label: 'Resolve alerts',       defaultRoles: ['admin'] },
    { key: 'alerts:configure',   label: 'Configure thresholds', defaultRoles: ['admin'] },
  ],
  nav: [
    { label: 'Servers',   path: '/infra/servers',   icon: 'Server' },
    { label: 'Databases', path: '/infra/databases', icon: 'Database' },
    { label: 'Websites',  path: '/infra/websites',  icon: 'Globe' },
    { label: 'Alerts',    path: '/infra/alerts',    icon: 'Bell' },
  ],
  apiPrefixes: ['/servers', '/deployments', '/agent', '/ssh', '/databases', '/websites', '/alerts', '/alert-thresholds'],
  workers: ['website-checker', 'alert-eval'],
  emitsActivity: true,
  emitsAlerts: true,
};

export const INFRA_SUBMODULES: readonly SubModule[] = [
  { id: 'infra:servers',   label: 'Servers',   path: '/infra/servers',   permission: 'servers:view',   legacyModuleId: 'servers'   },
  { id: 'infra:databases', label: 'Databases', path: '/infra/databases', permission: 'databases:view', legacyModuleId: 'databases' },
  { id: 'infra:websites',  label: 'Websites',  path: '/infra/websites',  permission: 'websites:view',  legacyModuleId: 'websites'  },
  { id: 'infra:alerts',    label: 'Alerts',    path: '/infra/alerts',    permission: 'alerts:view',    legacyModuleId: 'alerts'    },
];

export const INFRA_SUBMODULE_IDS: readonly string[] = INFRA_SUBMODULES.map(s => s.id);
