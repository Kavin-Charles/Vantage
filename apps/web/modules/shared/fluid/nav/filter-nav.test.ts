import { describe, it, expect } from 'vitest';
import { buildNav, type NavContext } from './filter-nav';
import type { NavItem, PluginNavItem } from './filter-nav';

const items: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard', group: 'general' },
  { id: 'contacts', label: 'Contacts', icon: 'person', href: '/crm/contacts', group: 'sales', module: 'crm' },
  { id: 'infra', label: 'Servers', icon: 'dns', href: '/infra', group: 'infra', module: 'infra' },
  { id: 'roles', label: 'Roles', icon: 'shield', href: '/settings/roles', group: 'general', adminOnly: true, permission: 'settings.roles.read' },
];

const ctx = (over: Partial<NavContext>): NavContext => ({
  hasPermission: () => true, isModuleEnabled: () => true, isAdmin: true, ...over,
});

describe('buildNav', () => {
  it('groups enabled items in group order', () => {
    const groups = buildNav(items, [], ctx({}));
    expect(groups.map(g => g.group)).toEqual(['general', 'sales', 'infra']);
    expect(groups[1]!.items.map(i => i.id)).toEqual(['contacts']);
  });

  it('drops items whose module is disabled', () => {
    const groups = buildNav(items, [], ctx({ isModuleEnabled: id => id !== 'infra' }));
    expect(groups.find(g => g.group === 'infra')).toBeUndefined();
  });

  it('drops adminOnly items for non-admins', () => {
    const groups = buildNav(items, [], ctx({ isAdmin: false }));
    expect(groups.flatMap(g => g.items).some(i => i.id === 'roles')).toBe(false);
  });

  it('drops items when permission is missing', () => {
    const groups = buildNav(items, [], ctx({ hasPermission: k => k !== 'settings.roles.read' }));
    expect(groups.flatMap(g => g.items).some(i => i.id === 'roles')).toBe(false);
  });

  it('merges plugin nav items into mapped groups', () => {
    const plugins: PluginNavItem[] = [{ label: 'Calendar', path: '/calendar', icon: 'event', group: 'general' }];
    const groups = buildNav(items, plugins, ctx({}));
    const general = groups.find(g => g.group === 'general')!;
    expect(general.items.some(i => i.id === 'plugin:/calendar' && i.label === 'Calendar')).toBe(true);
  });

  it('omits empty groups', () => {
    const groups = buildNav(items, [], ctx({ isModuleEnabled: () => false }));
    // only items without a module remain (dashboard, roles) → general only
    expect(groups.map(g => g.group)).toEqual(['general']);
  });
});
