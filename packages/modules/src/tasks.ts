import type { ModuleDefinition } from './types';

export const TASKS_MODULE: ModuleDefinition = {
  id: 'tasks',
  name: 'Tasks',
  description: 'Task management and due date tracking.',
  icon: 'CheckSquare',
  defaultEnabled: true,
  permissions: [
    { key: 'tasks:view',   label: 'View tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:create', label: 'Create tasks', defaultRoles: ['admin', 'member'] },
    { key: 'tasks:edit',   label: 'Edit tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:delete', label: 'Delete tasks', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Tasks', path: '/tasks', icon: 'CheckSquare' }],
  apiPrefixes: ['/tasks'],
  workers: ['task-due-notifier'],
};
