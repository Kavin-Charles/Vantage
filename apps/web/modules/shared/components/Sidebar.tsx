'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useConfig } from '@/modules/shared/lib/useConfig';
import { useModules } from '@/modules/shared/contexts/modules';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useToast } from '@/modules/shared/components/ui/Toast';
import {
  type SidebarGroup,
  collapseKey,
  useSidebarLayoutQuery,
  useSaveSidebarLayout,
  useSidebarPrefsQuery,
  useSaveSidebarPrefs,
  moveItemToGroup,
  moveItemWithinGroup,
  moveGroup,
  renameGroup,
  addGroupBelow,
  deleteGroup,
} from '@/modules/shared/hooks/useSidebarLayout';

interface NavItemDef {
  label: string;
  icon: string;
  moduleId?: string;
  feature?: 'crm' | 'infra';
  featureKey?: 'analytics';
  dot?: boolean;
}

const NAV_ITEMS: Record<string, NavItemDef> = {
  '/pipeline':  { label: 'Pipeline',  icon: 'pipeline',  moduleId: 'pipelines', feature: 'crm' },
  '/contacts':  { label: 'Contacts',  icon: 'contacts',  moduleId: 'contacts',  feature: 'crm' },
  '/companies': { label: 'Companies', icon: 'companies', moduleId: 'companies', feature: 'crm' },
  '/tasks':     { label: 'Tasks',     icon: 'tasks',     moduleId: 'tasks',     feature: 'crm' },
  '/activity':  { label: 'Activity',  icon: 'activity',  moduleId: 'activity',  feature: 'crm' },
  '/servers':   { label: 'Servers',   icon: 'servers',   moduleId: 'servers',   feature: 'infra' },
  '/databases': { label: 'Databases', icon: 'databases', moduleId: 'databases', feature: 'infra' },
  '/websites':  { label: 'Websites',  icon: 'websites',  moduleId: 'websites',  feature: 'infra' },
  '/messaging': { label: 'Messaging', icon: 'message-square', moduleId: 'messaging' },
  '/projects':  { label: 'Projects',  icon: 'tasks',     moduleId: 'projects' },
  '/analytics': { label: 'Analytics', icon: 'analytics', moduleId: 'analytics', featureKey: 'analytics' },
  '/alerts':    { label: 'Alerts',    icon: 'alerts',    moduleId: 'alerts', dot: true },
  '/dashboard': { label: 'Dashboard', icon: 'dashboard', moduleId: 'dashboard' },
};

function PulseDot() {
  return (
    <span style={{
      position: 'relative', width: 7, height: 7, borderRadius: 999,
      background: 'var(--red)', marginLeft: 'auto', flexShrink: 0,
      display: 'inline-block',
    }}>
      <style>{`@keyframes vt-pulse{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.9);opacity:0}}`}</style>
      <span style={{
        position: 'absolute', inset: -3, borderRadius: 999,
        background: 'var(--red)', opacity: 0.35,
        animation: 'vt-pulse 1.6s ease-out infinite',
        display: 'block',
      }} />
    </span>
  );
}

function NavLink({
  href, label, icon, dot, badge, isPinned, onTogglePin, adminMenu,
}: {
  href: string;
  label: string;
  icon: string;
  dot?: boolean;
  badge?: number;
  isPinned: boolean;
  onTogglePin: () => void;
  adminMenu?: ContextMenuItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const active = pathname === href || (href !== '/' && pathname.startsWith(href));
  const bg = active ? 'var(--text)' : hover ? 'var(--surface2)' : 'transparent';
  const fg = active ? 'var(--bg)' : hover ? 'var(--text)' : 'var(--text2)';
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  return (
    <>
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={e => {
        const url = `${window.location.origin}${href}`;
        const items: ContextMenuItem[] = [
          { icon: 'open', label: 'Open', onClick: () => router.push(href) },
          { icon: 'open', label: 'Open in new tab', onClick: () => window.open(href, '_blank') },
          { icon: 'link', label: 'Copy URL', onClick: () => navigator.clipboard.writeText(url) },
          { type: 'separator' },
          { icon: 'pin', label: isPinned ? 'Unpin' : 'Pin', onClick: onTogglePin },
        ];
        if (adminMenu && adminMenu.length > 0) items.push(...adminMenu);
        openMenu(e, items);
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 12, cursor: 'pointer',
        color: fg, background: bg,
        fontWeight: active ? 500 : 400, fontSize: 13.5,
        marginBottom: 2, userSelect: 'none',
        transition: 'all .15s',
        textDecoration: 'none',
      }}
    >
      <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: active ? 1 : hover ? 1 : 0.75, flexShrink: 0 }}>
        <Icon name={icon} size={16} />
      </span>
      {label}
      {dot && <PulseDot />}
      {!dot && badge != null && badge > 0 && !active && (
        <span style={{
          marginLeft: 'auto', background: 'var(--text)', color: '#fff',
          borderRadius: 10, fontSize: 10, fontWeight: 700,
          padding: '1px 6px', flexShrink: 0,
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
    <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}

function GroupHeader({
  group, groupIdx, groups, collapsed, isAdmin, editing, onStartEdit, onCommitEdit, onCancelEdit, onToggleCollapse, applyLayout,
}: {
  group: SidebarGroup;
  groupIdx: number;
  groups: SidebarGroup[];
  collapsed: boolean;
  isAdmin: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCommitEdit: (value: string) => void;
  onCancelEdit: () => void;
  onToggleCollapse: () => void;
  applyLayout: (next: SidebarGroup[]) => void;
}) {
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const [value, setValue] = useState(group.label);

  const headerStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 1.4,
    padding: '10px 10px 4px', display: 'flex', alignItems: 'center', gap: 6,
    cursor: 'pointer', userSelect: 'none',
  };

  return (
    <>
    <div
      style={headerStyle}
      onClick={() => { if (!editing) onToggleCollapse(); }}
      onContextMenu={e => {
        if (!isAdmin) return;
        const items: ContextMenuItem[] = [
          { icon: 'edit', label: 'Rename', onClick: onStartEdit },
          { icon: 'plus', label: 'New group below', onClick: () => applyLayout(addGroupBelow(groups, groupIdx)) },
          { icon: 'chevron-up', label: 'Move up', disabled: groupIdx === 0, onClick: () => applyLayout(moveGroup(groups, groupIdx, -1)) },
          { icon: 'chevron', label: 'Move down', disabled: groupIdx === groups.length - 1, onClick: () => applyLayout(moveGroup(groups, groupIdx, 1)) },
          { type: 'separator' },
          { icon: 'trash', label: 'Delete group', danger: true, disabled: group.is_default, onClick: () => applyLayout(deleteGroup(groups, groupIdx)) },
        ];
        openMenu(e, items);
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.currentTarget.blur(); onCommitEdit(value); }
            else if (e.key === 'Escape') { onCancelEdit(); }
          }}
          onBlur={() => onCommitEdit(value)}
          style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 1.4,
            background: 'transparent', border: 'none',
            borderBottom: '1px solid var(--border)',
            outline: 'none', width: '100%', fontFamily: 'inherit',
            padding: 0,
          }}
        />
      ) : (
        <>
          <Icon name={collapsed ? 'chevron-right' : 'chevron'} size={12} />
          <span>{group.label}</span>
        </>
      )}
    </div>
    <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}

interface WorkspacePlugin {
  id: string;
  plugin_id: string;
  name: string;
  enabled: boolean;
  manifest: {
    nav?: { label: string; href: string; icon?: string; group?: 'crm' | 'infra' | 'general' };
  };
}

export function Sidebar() {
  const getToken = useApiToken();
  const { user, logout } = useAuth();
  const { data: config } = useConfig();
  const { isEnabled } = useModules();
  const pathname = usePathname();
  const { showToast } = useToast();
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';
  const { data: pluginNavItems = [] } = useQuery({
    queryKey: ['sidebar-plugins'],
    queryFn: async (): Promise<WorkspacePlugin[]> => {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/plugins`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`plugins fetch failed: ${res.status}`);
      const json = await res.json() as { data: WorkspacePlugin[] };
      return (json.data ?? []).filter(p => p.enabled && p.manifest?.nav);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: 3,
  });
  const { data: installedPlugins = [] } = useInstalledPlugins();

  const surfaceNavItems = installedPlugins
    .filter((p) => p.enabled && (p.manifest?.surfaces?.nav?.length ?? 0) > 0)
    .flatMap((p) =>
      (p.manifest?.surfaces?.nav ?? []).map((item) => ({
        href: `/plugins/${p.plugin_id}${item.path}`,
        label: item.label,
        icon: item.icon ?? 'puzzle',
        pluginId: p.plugin_id,
      })),
    );

  const itemDefs = new Map<string, NavItemDef>(Object.entries(NAV_ITEMS));
  for (const p of pluginNavItems) itemDefs.set(p.manifest.nav!.href, { label: p.manifest.nav!.label, icon: p.manifest.nav!.icon ?? 'plugin' });
  for (const s of surfaceNavItems) itemDefs.set(s.href, { label: s.label, icon: s.icon });

  function isVisible(key: string): boolean {
    const def = itemDefs.get(key);
    if (!def) return false; // stale key from a removed module/plugin
    if (def.feature === 'crm' && !(config?.features.crm ?? true)) return false;
    if (def.feature === 'infra' && !(config?.features.infra ?? true)) return false;
    if (def.featureKey && config?.features && def.featureKey in config.features && !config.features[def.featureKey]) return false;
    if (def.moduleId && !isEnabled(def.moduleId)) return false;
    return true;
  }

  const { data: alertData } = useQuery({
    queryKey: ['alerts-badge'],
    queryFn: async () => apiFetch<{ data: unknown[]; total: number; error: null }>('/api/alerts?resolved=false&severity=critical&limit=1', { token: await getToken() }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const hasCritical = (alertData?.total ?? 0) > 0;

  const { data: messagingUnread = 0 } = useQuery({
    queryKey: ['messaging-unread-badge'],
    queryFn: async () => {
      const token = await getToken();
      if (!isEnabled('messaging')) return 0;
      const res = await apiFetch<{ data: { unread_count: number }[]; error: null }>('/api/messaging/channels', { token });
      return (res.data ?? []).reduce((sum, ch) => sum + (ch.unread_count ?? 0), 0);
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const isAdmin = user?.role === 'admin';
  const { data: updateAvailable = false } = useQuery({
    queryKey: ['update-badge'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await apiFetch<{ data: { updateAvailable: boolean; latestVersion: string | null } }>(
        '/api/system/update-info',
        { token: await getToken() },
      );
      if (!res.data.updateAvailable || !res.data.latestVersion) return false;
      return localStorage.getItem('vencore-update-dismissed') !== res.data.latestVersion;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  function dotFor(href: string): boolean | undefined {
    return href === '/alerts' && hasCritical ? true : undefined;
  }
  function badgeFor(href: string): number | undefined {
    return href === '/messaging' ? messagingUnread : undefined;
  }

  const { groups } = useSidebarLayoutQuery();
  const prefs = useSidebarPrefsQuery();
  const saveLayout = useSaveSidebarLayout();
  const { save: savePrefs } = useSaveSidebarPrefs();
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);

  function applyLayout(next: SidebarGroup[]) {
    saveLayout.mutate(next, {
      onError: () => showToast('error', 'Failed to save sidebar layout'),
    });
  }

  function togglePin(key: string) {
    const pinned = prefs.pinned_keys.includes(key)
      ? prefs.pinned_keys.filter((k) => k !== key)
      : [...prefs.pinned_keys, key];
    savePrefs({ ...prefs, pinned_keys: pinned });
  }

  function toggleCollapse(group: SidebarGroup) {
    const key = collapseKey(group);
    const collapsedKeys = prefs.collapsed_group_keys.includes(key)
      ? prefs.collapsed_group_keys.filter((k) => k !== key)
      : [...prefs.collapsed_group_keys, key];
    savePrefs({ ...prefs, collapsed_group_keys: collapsedKeys });
  }

  function movePinned(key: string, dir: 1 | -1) {
    const visiblePinned = prefs.pinned_keys.filter(isVisible);
    const from = visiblePinned.indexOf(key);
    const to = from + dir;
    if (from === -1 || to < 0 || to >= visiblePinned.length) return;
    const a = visiblePinned[from]!;
    const b = visiblePinned[to]!;
    const fullFrom = prefs.pinned_keys.indexOf(a);
    const fullTo = prefs.pinned_keys.indexOf(b);
    const next = [...prefs.pinned_keys];
    [next[fullFrom], next[fullTo]] = [next[fullTo]!, next[fullFrom]!];
    savePrefs({ ...prefs, pinned_keys: next });
  }

  function buildAdminMenu(href: string, groupIdx: number, visibleKeys: string[]): ContextMenuItem[] {
    if (!isAdmin) return [];
    const itemIdx = visibleKeys.indexOf(href);
    return [
      { type: 'separator' },
      { type: 'header', label: 'Manage' },
      {
        type: 'submenu', icon: 'folder', label: 'Move to group',
        items: [
          ...groups.map((g, i) => ({
            label: g.label,
            disabled: i === groupIdx,
            onClick: () => applyLayout(moveItemToGroup(groups, href, i)),
          })),
          {
            label: 'New group…',
            onClick: () => {
              const withNew = addGroupBelow(groups, groups.length - 1);
              applyLayout(moveItemToGroup(withNew, href, withNew.length - 1));
              setEditingGroupKey('seed:New group');
            },
          },
        ],
      },
      { icon: 'chevron-up', label: 'Move up', disabled: itemIdx === 0, onClick: () => applyLayout(moveItemWithinGroup(groups, groupIdx, href, -1)) },
      { icon: 'chevron', label: 'Move down', disabled: itemIdx === visibleKeys.length - 1, onClick: () => applyLayout(moveItemWithinGroup(groups, groupIdx, href, 1)) },
    ];
  }

  const visiblePinnedKeys = prefs.pinned_keys.filter(isVisible);

  return (
    <div style={{
      width: 'var(--sidebar-w)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      height: '100vh', overflowY: 'auto',
    }}>
      {/* Logo lockup */}
      <div style={{
        padding: '16px 18px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
        }}>
          {config?.app?.logoUrl && config.app.logoUrl !== '/logo.png' ? (
            <img src={config.app.logoUrl} alt="logo" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          ) : (
            <Image src="/logo.png" alt="Vantage" width={30} height={30} style={{ objectFit: 'contain' }} />
          )}
        </div>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 19,
          fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.4px',
        }}>
          {config?.app?.name ?? ''}
        </span>
      </div>

      {/* Nav items */}
      <div style={{ padding: '12px 12px 4px' }}>
        {visiblePinnedKeys.length > 0 && (
          <>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 1.4,
              padding: '10px 10px 4px',
            }}>
              Pinned
            </div>
            {visiblePinnedKeys.map((key) => {
              const def = itemDefs.get(key)!;
              return (
                <NavLink
                  key={`pinned:${key}`}
                  href={key}
                  label={def.label}
                  icon={def.icon}
                  dot={dotFor(key)}
                  badge={badgeFor(key)}
                  isPinned
                  onTogglePin={() => togglePin(key)}
                  adminMenu={[
                    { type: 'separator' },
                    { icon: 'chevron-up', label: 'Move up', disabled: visiblePinnedKeys.indexOf(key) === 0, onClick: () => movePinned(key, -1) },
                    { icon: 'chevron', label: 'Move down', disabled: visiblePinnedKeys.indexOf(key) === visiblePinnedKeys.length - 1, onClick: () => movePinned(key, 1) },
                  ]}
                />
              );
            })}
          </>
        )}

        {groups.map((group, groupIdx) => {
          const visibleKeys = group.item_keys.filter(isVisible);
          const key = collapseKey(group);
          const collapsed = prefs.collapsed_group_keys.includes(key);
          const editing = editingGroupKey === key;

          if (visibleKeys.length === 0 && !isAdmin) return null;

          return (
            <div key={key} style={visibleKeys.length === 0 ? { opacity: 0.5 } : undefined}>
              <GroupHeader
                group={group}
                groupIdx={groupIdx}
                groups={groups}
                collapsed={collapsed}
                isAdmin={isAdmin}
                editing={editing}
                onStartEdit={() => setEditingGroupKey(key)}
                onCommitEdit={(value) => {
                  applyLayout(renameGroup(groups, groupIdx, value.trim() || group.label));
                  setEditingGroupKey(null);
                }}
                onCancelEdit={() => setEditingGroupKey(null)}
                onToggleCollapse={() => toggleCollapse(group)}
                applyLayout={applyLayout}
              />
              {!collapsed && visibleKeys.map((href) => {
                const def = itemDefs.get(href)!;
                return (
                  <NavLink
                    key={href}
                    href={href}
                    label={def.label}
                    icon={def.icon}
                    dot={dotFor(href)}
                    badge={badgeFor(href)}
                    isPinned={prefs.pinned_keys.includes(href)}
                    onTogglePin={() => togglePin(href)}
                    adminMenu={buildAdminMenu(href, groupIdx, visibleKeys)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* User */}
      <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
          }}>
            {user ? ((user.name ?? user.email ?? '?')[0] ?? '?').toUpperCase() : '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name ?? user?.email ?? ''}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>
              {user?.role ?? ''}
            </div>
          </div>
          <Link
            href="/settings"
            title="Settings"
            style={{
              position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
              color: pathname.startsWith('/settings') ? 'var(--text)' : 'var(--text3)',
              padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center',
            }}
          >
            <Icon name="settings" size={15} />
            {updateAvailable && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 999, background: 'var(--red)' }} />
            )}
          </Link>
          <button
            onClick={() => void logout()}
            title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
          >
            <Icon name="logout" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
