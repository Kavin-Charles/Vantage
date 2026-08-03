import type { ModuleDefinition } from '../types';

export const MESSAGING_MODULE: ModuleDefinition = {
  id: 'messaging',
  name: 'Messaging',
  description: 'Team messaging — channels, DMs, threads, and file sharing.',
  icon: 'MessageSquare',
  defaultEnabled: true,
  permissions: [
    { key: 'messaging:view',           label: 'View channels and messages',          defaultRoles: ['admin', 'member'] },
    { key: 'messaging:send',           label: 'Send messages and upload files',       defaultRoles: ['admin', 'member'] },
    // Creating a channel is a normal member action; renaming/archiving someone
    // else's channel is not. Keeping them separate means members are not locked
    // out of creating channels by the admin-only 'manage' gate.
    { key: 'messaging:create_channel', label: 'Create channels',                      defaultRoles: ['admin', 'member'] },
    { key: 'messaging:manage',         label: 'Manage channels and delete messages',  defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Messaging', path: '/messaging', icon: 'MessageSquare' }],
  apiPrefixes: ['/messaging'],
  workers: [],
};
