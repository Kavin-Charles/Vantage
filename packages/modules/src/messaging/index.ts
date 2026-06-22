import type { ModuleDefinition } from '../types';

export const MESSAGING_MODULE: ModuleDefinition = {
  id: 'messaging',
  name: 'Messaging',
  description: 'Team messaging — channels, DMs, threads, and file sharing.',
  icon: 'MessageSquare',
  defaultEnabled: true,
  permissions: [
    { key: 'messaging:view',   label: 'View channels and messages',          defaultRoles: ['admin', 'member'] },
    { key: 'messaging:send',   label: 'Send messages and upload files',       defaultRoles: ['admin', 'member'] },
    { key: 'messaging:manage', label: 'Manage channels and delete messages',  defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Messaging', path: '/messaging', icon: 'MessageSquare' }],
  apiPrefixes: ['/messaging'],
  workers: [],
};
