import { GROUP_ORDER, type NavGroup, type NavItem } from './nav-model';

export type { NavItem, NavGroup } from './nav-model';

export interface PluginNavItem {
  label: string;
  path: string;
  icon?: string;
  group?: 'crm' | 'infra' | 'general';
}

export interface NavGroupItems {
  group: NavGroup;
  items: NavItem[];
}

export interface NavContext {
  hasPermission(key: string): boolean;
  isModuleEnabled(id: string): boolean;
  isAdmin: boolean;
}

// Plugin nav groups (crm/infra/general) → shell NavGroup.
const PLUGIN_GROUP_MAP: Record<NonNullable<PluginNavItem['group']>, NavGroup> = {
  crm: 'sales', infra: 'infra', general: 'general',
};

function isVisible(item: NavItem, ctx: NavContext): boolean {
  if (item.adminOnly && !ctx.isAdmin) return false;
  if (item.permission && !ctx.hasPermission(item.permission)) return false;
  if (item.module && !ctx.isModuleEnabled(item.module)) return false;
  return true;
}

export function buildNav(base: NavItem[], plugins: PluginNavItem[], ctx: NavContext): NavGroupItems[] {
  const visible = base.filter(item => isVisible(item, ctx));

  const pluginItems: NavItem[] = plugins.map(p => ({
    id: `plugin:${p.path}`,
    label: p.label,
    icon: p.icon ?? 'extension',
    href: p.path,
    group: PLUGIN_GROUP_MAP[p.group ?? 'general'],
  }));

  const all = [...visible, ...pluginItems];

  return GROUP_ORDER
    .map(group => ({ group, items: all.filter(i => i.group === group) }))
    .filter(g => g.items.length > 0);
}
