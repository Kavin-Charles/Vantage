'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useModules } from '@/modules/shared/contexts/modules';
import { useInstalledPlugins, type InstalledPlugin } from '@/modules/shared/hooks/useInstalledPlugins';
import { buildNav, type PluginNavItem } from '@/modules/shared/fluid/nav/filter-nav';
import { BASE_NAV, GROUP_LABEL } from '@/modules/shared/fluid/nav/nav-model';
import { MSIcon, Avatar } from '@/modules/shared/fluid/ui';

type PluginGroup = NonNullable<PluginNavItem['group']>;
const PLUGIN_NAV_GROUPS = new Set<PluginGroup>(['crm', 'infra', 'general']);

function toPluginGroup(g: string | undefined): PluginNavItem['group'] {
  if (g !== undefined && PLUGIN_NAV_GROUPS.has(g as PluginGroup)) return g as PluginGroup;
  return undefined;
}

export function FluidSidebar() {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const { data: plugins } = useInstalledPlugins();

  // Map installed-plugin manifest nav surfaces to PluginNavItem[]. Disabled
  // plugins and manifests without nav surfaces contribute nothing.
  const pluginNav: PluginNavItem[] = ((plugins ?? []) as InstalledPlugin[])
    .filter((p: InstalledPlugin) => p.enabled)
    .flatMap((p: InstalledPlugin) =>
      (p.manifest.surfaces?.nav ?? []).map(n => ({
        label: n.label,
        path: n.path,
        icon: n.icon,
        group: toPluginGroup(n.group),
      })),
    );

  const groups = buildNav(BASE_NAV, pluginNav, {
    hasPermission,
    isModuleEnabled: isEnabled,
    isAdmin: !!user?.isAdmin,
  });

  return (
    <nav
      className="glass-panel group"
      style={{
        position: 'fixed', top: 16, left: 16, bottom: 16, zIndex: 40,
        width: 72, borderRadius: 28, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'width .3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden',
      }}
      onMouseEnter={e => (e.currentTarget.style.width = '232px')}
      onMouseLeave={e => (e.currentTarget.style.width = '72px')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 16px' }}>
        <MSIcon name="cloud_done" size={26} style={{ color: 'var(--fl-primary)' }} />
        <span style={{ fontFamily: 'var(--fl-font-display)', fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap' }}>Vencore</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(g => (
          <div key={g.group}>
            <p style={{ margin: '0 0 4px', padding: '0 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fl-outline)', whiteSpace: 'nowrap' }}>
              {GROUP_LABEL[g.group]}
            </p>
            {g.items.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '10px', borderRadius: 'var(--fl-radius-pill)',
                    textDecoration: 'none', whiteSpace: 'nowrap', transition: 'background .2s',
                    color: active ? 'var(--fl-on-primary)' : 'var(--fl-on-surface-variant)',
                    background: active ? 'var(--fl-primary)' : 'transparent',
                    boxShadow: active ? 'var(--fl-shadow-primary)' : 'none',
                  }}
                >
                  <MSIcon name={item.icon} size={22} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--fl-glass-border)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px 4px' }}>
        <Avatar name={user?.name ?? '?'} size={32} />
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{user?.name ?? ''}</p>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--fl-outline)', whiteSpace: 'nowrap' }}>{user?.isAdmin ? 'Admin' : 'Member'}</p>
        </div>
      </div>
    </nav>
  );
}
