'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useConfig } from '@/modules/shared/lib/useConfig';
import { useModules } from '@/modules/shared/contexts/modules';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';

const NAV_GROUPS = [
  {
    label: 'CRM',
    feature: 'crm' as const,
    items: [
      { href: '/pipeline',  label: 'Pipeline',  icon: 'pipeline',  moduleId: 'pipelines' },
      { href: '/contacts',  label: 'Contacts',  icon: 'contacts',  moduleId: 'contacts'  },
      { href: '/companies', label: 'Companies', icon: 'companies', moduleId: 'companies' },
      { href: '/tasks',     label: 'Tasks',     icon: 'tasks',     moduleId: 'tasks'     },
      { href: '/activity',  label: 'Activity',  icon: 'activity',  moduleId: 'activity'  },
    ],
  },
  {
    label: 'Infrastructure',
    feature: 'infra' as const,
    items: [
      { href: '/servers',     label: 'Servers',     icon: 'servers',   moduleId: 'servers'  },
      { href: '/databases',   label: 'Databases',   icon: 'databases'  },
      { href: '/websites',    label: 'Websites',    icon: 'websites',  moduleId: 'websites' },
      { href: '/files',       label: 'Files',       icon: 'files',     featureKey: 'files' as const },
    ],
  },
  {
    label: 'General',
    feature: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', moduleId: 'dashboard' },
      { href: '/analytics', label: 'Analytics', icon: 'analytics', moduleId: 'analytics', featureKey: 'analytics' as const },
      { href: '/alerts',    label: 'Alerts',    icon: 'alerts',    featureKey: 'alerts' as const, dot: true },
      { href: '/settings',  label: 'Settings',  icon: 'settings'  },
    ],
  },
] as const;

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

function NavLink({ href, label, icon, dot }: { href: string; label: string; icon: string; dot?: boolean }) {
  const pathname = usePathname();
  const [hover, setHover] = useState(false);
  const active = pathname === href || (href !== '/' && pathname.startsWith(href));
  const bg = active ? 'var(--text)' : hover ? 'var(--surface2)' : 'transparent';
  const fg = active ? '#fff' : hover ? 'var(--text)' : 'var(--text2)';

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
    </Link>
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
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
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
      console.log('[sidebar-plugins]', json.data);
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

  const { data: alertData } = useQuery({
    queryKey: ['alerts-badge'],
    queryFn: async () => apiFetch<{ data: unknown[]; total: number; error: null }>('/api/alerts?resolved=false&severity=critical&limit=1', { token: await getToken() }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const hasCritical = (alertData?.total ?? 0) > 0;

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

      {/* Nav groups */}
      {NAV_GROUPS.map(group => {
        if (group.feature === 'crm' && !(config?.features.crm ?? true)) return null;
        if (group.feature === 'infra' && !(config?.features.infra ?? true)) return null;
        const groupKey = group.label.toLowerCase() as 'crm' | 'infrastructure' | 'general';
        const pluginGroup = groupKey === 'infrastructure' ? 'infra' : groupKey === 'crm' ? 'crm' : 'general';
        const groupPlugins = pluginNavItems.filter(p => (p.manifest.nav?.group ?? 'general') === pluginGroup);
        return (
          <div key={group.label} style={{ padding: '12px 12px 4px' }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 1.4,
              padding: '0 10px', marginBottom: 6,
            }}>{group.label}</div>
            {group.items.map(item => {
              if ('moduleId' in item && item.moduleId && !isEnabled(item.moduleId)) return null;
              if ('featureKey' in item && item.featureKey) {
                const key = item.featureKey as keyof NonNullable<typeof config>['features'];
                if (config?.features && key in config.features && !config.features[key]) return null;
              }
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  dot={'dot' in item && item.dot && hasCritical ? true : undefined}
                />
              );
            })}
            {groupPlugins.map(p => (
              <NavLink
                key={p.plugin_id}
                href={p.manifest.nav!.href}
                label={p.manifest.nav!.label}
                icon={p.manifest.nav!.icon ?? 'plugin'}
              />
            ))}
          </div>
        );
      })}

      {/* Plugin nav items from surfaces.nav */}
      {surfaceNavItems.length > 0 && (
        <div style={{ padding: '12px 12px 4px' }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 1.4,
            padding: '0 10px', marginBottom: 6,
          }}>
            Plugins
          </div>
          {surfaceNavItems.map((item) => (
            <NavLink
              key={`${item.pluginId}:${item.href}`}
              href={item.href}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </div>
      )}

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
