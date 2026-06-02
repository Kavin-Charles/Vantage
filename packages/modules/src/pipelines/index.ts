import type { ModuleDefinition } from './types';

export const PIPELINES_MODULE: ModuleDefinition = {
  id: 'pipelines',
  name: 'Pipelines',
  description: 'Deals pipeline, pipeline views, items, and conversions.',
  icon: 'Kanban',
  defaultEnabled: true,
  permissions: [
    { key: 'pipelines:view',   label: 'View pipelines & deals',   defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:create', label: 'Create deals & records',   defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:edit',   label: 'Edit deals & records',     defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:delete', label: 'Delete deals & records',   defaultRoles: ['admin'] },
  ],
  nav: [
    { label: 'Pipeline', path: '/pipeline', icon: 'Kanban' },
    { label: 'Items', path: '/items', icon: 'Package' },
  ],
  apiPrefixes: ['/deals', '/pipelines', '/stages', '/items', '/item-groups', '/conversions', '/record-types', '/records'],
  workers: [],
};
