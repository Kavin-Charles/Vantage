import type { ModuleDefinition } from './types';

export const CONTACTS_MODULE: ModuleDefinition = {
  id: 'contacts',
  name: 'Contacts',
  description: 'Contact management, profiles, and history.',
  icon: 'Users',
  defaultEnabled: true,
  permissions: [
    { key: 'contacts:view',   label: 'View contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:create', label: 'Create contacts', defaultRoles: ['admin', 'member'] },
    { key: 'contacts:edit',   label: 'Edit contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:delete', label: 'Delete contacts', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Contacts', path: '/contacts', icon: 'Users' }],
  apiPrefixes: ['/contacts'],
  workers: [],
};
