import type { ModuleDefinition, SubModule } from '../types';

export const CRM_MODULE: ModuleDefinition = {
  id: 'crm',
  name: 'CRM',
  description: 'Contacts, companies, deals pipeline, and tasks.',
  icon: 'Kanban',
  defaultEnabled: true,
  permissions: [
    { key: 'contacts:view',   label: 'View contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:create', label: 'Create contacts', defaultRoles: ['admin', 'member'] },
    { key: 'contacts:edit',   label: 'Edit contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:delete', label: 'Delete contacts', defaultRoles: ['admin'] },
    { key: 'companies:view',   label: 'View companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:create', label: 'Create companies', defaultRoles: ['admin', 'member'] },
    { key: 'companies:edit',   label: 'Edit companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:delete', label: 'Delete companies', defaultRoles: ['admin'] },
    { key: 'pipelines:view',         label: 'View pipelines & deals',                       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:create',       label: 'Create deals & records',                       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:edit',         label: 'Edit deals & records',                         defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:delete',       label: 'Delete deals & records',                       defaultRoles: ['admin'] },
    { key: 'pipelines:config',       label: 'Change pipeline settings (name, description, default)', defaultRoles: ['admin'] },
    { key: 'pipelines:stage.edit',   label: 'Edit stages (rename, reorder, recolor)',       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:stage.delete', label: 'Delete stages',                                defaultRoles: ['admin'] },
    { key: 'pipelines:field.edit',   label: 'Edit fields (rename, reorder, toggle required, edit options)', defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:field.delete', label: 'Delete fields',                                defaultRoles: ['admin'] },
    { key: 'tasks:view',   label: 'View tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:create', label: 'Create tasks', defaultRoles: ['admin', 'member'] },
    { key: 'tasks:edit',   label: 'Edit tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:delete', label: 'Delete tasks', defaultRoles: ['admin'] },
  ],
  nav: [
    { label: 'Pipeline',  path: '/crm/pipeline',  icon: 'Kanban' },
    { label: 'Contacts',  path: '/crm/contacts',  icon: 'Users' },
    { label: 'Companies', path: '/crm/companies', icon: 'Building2' },
    { label: 'Tasks',     path: '/crm/tasks',     icon: 'CheckSquare' },
  ],
  apiPrefixes: ['/contacts', '/companies', '/deals', '/pipelines', '/stages', '/items', '/item-groups', '/conversions', '/record-types', '/records', '/tasks'],
  workers: ['task-due-notifier'],
  emitsActivity: true,
};

export const CRM_SUBMODULES: readonly SubModule[] = [
  { id: 'crm:pipeline',  label: 'Pipeline',  path: '/crm/pipeline',  permission: 'pipelines:view', legacyModuleId: 'pipelines' },
  { id: 'crm:contacts',  label: 'Contacts',  path: '/crm/contacts',  permission: 'contacts:view',  legacyModuleId: 'contacts'  },
  { id: 'crm:companies', label: 'Companies', path: '/crm/companies', permission: 'companies:view', legacyModuleId: 'companies' },
  { id: 'crm:tasks',     label: 'Tasks',     path: '/crm/tasks',     permission: 'tasks:view',     legacyModuleId: 'tasks'     },
];

export const CRM_SUBMODULE_IDS: readonly string[] = CRM_SUBMODULES.map(s => s.id);
