export type NavGroup = 'general' | 'sales' | 'infra' | 'projects' | 'insights';

export interface NavItem {
  id: string;
  label: string;
  icon: string;        // Material Symbols name
  href: string;
  group: NavGroup;
  module?: string;     // gates on useModules().isEnabled(module)
  permission?: string; // gates on hasPermission(permission)
  adminOnly?: boolean;
}

export const GROUP_ORDER: NavGroup[] = ['general', 'sales', 'infra', 'projects', 'insights'];

export const GROUP_LABEL: Record<NavGroup, string> = {
  general: 'General', sales: 'Sales', infra: 'Infra', projects: 'Projects', insights: 'Insights',
};

// Base destinations. CRM + Settings resolve to (fluid) routes; others link to existing
// (dashboard) routes (same app, URLs unchanged) so the shell presents one unified nav.
export const BASE_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard',    href: '/dashboard', group: 'general' },
  { id: 'pipeline',  label: 'Pipeline',  icon: 'account_tree', href: '/crm/pipeline',  group: 'sales', module: 'crm' },
  { id: 'contacts',  label: 'Contacts',  icon: 'person',       href: '/crm/contacts',  group: 'sales', module: 'crm' },
  { id: 'companies', label: 'Companies', icon: 'domain',       href: '/crm/companies', group: 'sales', module: 'crm' },
  { id: 'tasks',     label: 'Tasks',     icon: 'checklist',    href: '/crm/tasks',     group: 'sales', module: 'crm' },
  { id: 'activity',  label: 'Activity',  icon: 'timeline',     href: '/activity',      group: 'sales', module: 'activity' },
  { id: 'servers',   label: 'Servers',   icon: 'dns',          href: '/infra',         group: 'infra', module: 'infra' },
  { id: 'databases', label: 'Databases', icon: 'database',     href: '/infra/databases', group: 'infra', module: 'infra' },
  { id: 'websites',  label: 'Websites',  icon: 'language',     href: '/infra/websites',  group: 'infra', module: 'infra' },
  { id: 'alerts',    label: 'Alerts',    icon: 'warning',      href: '/infra/alerts',    group: 'infra', module: 'infra' },
  { id: 'messaging', label: 'Messaging', icon: 'chat',         href: '/messaging',  group: 'projects', module: 'messaging' },
  { id: 'projects',  label: 'Projects',  icon: 'folder',       href: '/projects',   group: 'projects', module: 'projects' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics',    href: '/analytics',  group: 'insights', module: 'analytics' },
];
