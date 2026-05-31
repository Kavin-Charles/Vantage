export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  nav: { label: string; path: string; icon: string }[];
  apiPrefixes: string[];
  workers: string[];
}

export const CONTACTS_MODULE: ModuleManifest = {
  id: 'contacts',
  name: 'Contacts',
  description: 'Contact management, profiles, and history.',
  icon: 'Users',
  defaultEnabled: true,
  nav: [{ label: 'Contacts', path: '/contacts', icon: 'Users' }],
  apiPrefixes: ['/contacts'],
  workers: [],
};

export const COMPANIES_MODULE: ModuleManifest = {
  id: 'companies',
  name: 'Companies',
  description: 'Company records and relationships.',
  icon: 'Building2',
  defaultEnabled: true,
  nav: [{ label: 'Companies', path: '/companies', icon: 'Building2' }],
  apiPrefixes: ['/companies'],
  workers: [],
};

export const PIPELINES_MODULE: ModuleManifest = {
  id: 'pipelines',
  name: 'Pipelines',
  description: 'Deals pipeline, pipeline views, items, and conversions.',
  icon: 'Kanban',
  defaultEnabled: true,
  nav: [
    { label: 'Pipeline', path: '/pipeline', icon: 'Kanban' },
    { label: 'Items', path: '/items', icon: 'Package' },
  ],
  apiPrefixes: [
    '/deals',
    '/pipelines',
    '/stages',
    '/items',
    '/item-groups',
    '/conversions',
    '/record-types',
    '/records',
  ],
  workers: [],
};

export const TASKS_MODULE: ModuleManifest = {
  id: 'tasks',
  name: 'Tasks',
  description: 'Task management and due date tracking.',
  icon: 'CheckSquare',
  defaultEnabled: true,
  nav: [{ label: 'Tasks', path: '/tasks', icon: 'CheckSquare' }],
  apiPrefixes: ['/tasks'],
  workers: ['task-due-notifier'],
};

export const WEBSITES_MODULE: ModuleManifest = {
  id: 'websites',
  name: 'Websites',
  description: 'Website uptime monitoring, response times, and SSL expiry.',
  icon: 'Globe',
  defaultEnabled: true,
  nav: [{ label: 'Websites', path: '/websites', icon: 'Globe' }],
  apiPrefixes: ['/websites'],
  workers: ['website-checker'],
};

export const SERVERS_MODULE: ModuleManifest = {
  id: 'servers',
  name: 'Servers',
  description: 'Server monitoring and agent heartbeats.',
  icon: 'Server',
  defaultEnabled: true,
  nav: [{ label: 'Servers', path: '/servers', icon: 'Server' }],
  apiPrefixes: ['/servers', '/deployments', '/agent', '/ssh'],
  workers: [],
};

export const ANALYTICS_MODULE: ModuleManifest = {
  id: 'analytics',
  name: 'Analytics',
  description: 'Revenue, pipeline stats, and team leaderboard.',
  icon: 'BarChart2',
  defaultEnabled: true,
  nav: [{ label: 'Analytics', path: '/analytics', icon: 'BarChart2' }],
  apiPrefixes: ['/analytics'],
  workers: [],
};

export const ACTIVITY_MODULE: ModuleManifest = {
  id: 'activity',
  name: 'Activity',
  description: 'Unified activity feed across all workspace records.',
  icon: 'Activity',
  defaultEnabled: true,
  nav: [{ label: 'Activity', path: '/activity', icon: 'Activity' }],
  apiPrefixes: ['/activity'],
  workers: [],
};
