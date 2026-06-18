import type { ModuleDefinition } from '../types';

export const PROJECTS_MODULE: ModuleDefinition = {
  id: 'projects',
  name: 'Project Management',
  description: 'Projects, tasks, sprints, automations, and client portals.',
  icon: 'FolderKanban',
  defaultEnabled: true,
  permissions: [
    { key: 'projects:view',   label: 'View projects',       defaultRoles: ['admin', 'member'] },
    { key: 'projects:manage', label: 'Manage projects',     defaultRoles: ['admin'] },
    { key: 'projects:admin',  label: 'Admin project settings', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Projects', path: '/projects', icon: 'FolderKanban' }],
  apiPrefixes: ['/projects', '/pm'],
  workers: ['due-date-alerts', 'overdue-scan', 'health-recalc', 'sprint-rollover'],
  emitsActivity: true,
};
