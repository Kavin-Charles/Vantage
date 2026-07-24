'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useModules } from '@/modules/shared/contexts/modules';
import { useInstalledPlugins, type InstalledPlugin } from '@/modules/shared/hooks/useInstalledPlugins';
import { useTheme } from '@/modules/shared/contexts/ThemeContext';
import { buildNav, type PluginNavItem } from '@/modules/shared/fluid/nav/filter-nav';
import { BASE_NAV, GROUP_LABEL } from '@/modules/shared/fluid/nav/nav-model';
import { MSIcon, Avatar } from '@/modules/shared/fluid/ui';

type PluginGroup = NonNullable<PluginNavItem['group']>;
const PLUGIN_NAV_GROUPS = new Set<PluginGroup>(['crm', 'infra', 'general']);

function toPluginGroup(g: string | undefined): PluginNavItem['group'] {
  if (g !== undefined && PLUGIN_NAV_GROUPS.has(g as PluginGroup)) return g as PluginGroup;
  return undefined;
}

function itemRowStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 14, padding: '10px', borderRadius: 'var(--fl-radius-pill)',
    textDecoration: 'none', whiteSpace: 'nowrap', transition: 'background .2s',
    color: active ? 'var(--fl-on-primary)' : 'var(--fl-on-surface-variant)',
    background: active ? 'var(--fl-primary)' : 'transparent',
    boxShadow: active ? 'var(--fl-shadow-primary)' : 'none',
  };
}

export function FluidDock() {
  const pathname = usePathname();
  const { user, hasPermission, logout } = useAuth();
  const { isEnabled } = useModules();
  const { data: plugins } = useInstalledPlugins();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/');

  return (
    <nav
      className="glass-panel group fl-dock"
      style={{
        position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)',
        maxHeight: 'calc(100vh - 32px)', zIndex: 40, borderRadius: 28, padding: '16px 12px',
        display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 16px' }}>
        <MSIcon name="cloud_done" size={26} style={{ color: 'var(--fl-primary)' }} />
        <span className="fl-dock-label" style={{ fontFamily: 'var(--fl-font-display)', fontWeight: 700, fontSize: 18 }}>Vencore</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="fl-dock-scroll">
        {groups.map(g => (
          <div key={g.group}>
            <p className="fl-dock-group-label">{GROUP_LABEL[g.group]}</p>
            {g.items.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link key={item.id} href={item.href} style={itemRowStyle(active)}>
                  <MSIcon name={item.icon} size={22} />
                  <span className="fl-dock-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--fl-glass-border)', paddingTop: 8 }}>
        <Link href="/settings" style={itemRowStyle(settingsActive)}>
          <MSIcon name="settings" size={22} />
          <span className="fl-dock-label">Settings</span>
        </Link>

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '10px', width: '100%',
              borderRadius: 'var(--fl-radius-pill)', background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <Avatar name={user?.name ?? '?'} size={32} />
            <span className="fl-dock-label" style={{ color: 'var(--fl-on-surface-variant)' }}>{user?.name ?? ''}</span>
          </button>

          {menuOpen && (
            <div
              className="glass-panel"
              style={{
                position: 'absolute', left: '100%', bottom: 0, marginLeft: 8, minWidth: 180,
                borderRadius: 16, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 50,
              }}
            >
              <Link
                href="/settings/profile"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                  textDecoration: 'none', color: 'var(--fl-on-surface-variant)', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600,
                }}
              >
                <MSIcon name="person" size={18} />
                Profile
              </Link>
              <button
                type="button"
                onClick={() => { void setTheme(theme === 'dark' ? 'light' : 'dark'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--fl-on-surface-variant)', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600,
                }}
              >
                <MSIcon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={18} />
                Theme
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--fl-on-surface-variant)', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600,
                }}
              >
                <MSIcon name="logout" size={18} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
