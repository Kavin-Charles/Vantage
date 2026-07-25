'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';

interface SettingsLink {
  href: string;
  label: string;
}

interface SettingsGroup {
  label: string | null;
  links: SettingsLink[];
}

const ADMIN_ONLY_DEEP_LINKS = [
  '/settings/tasks',
  '/settings/activity',
  '/settings/messaging',
  '/settings/dashboards',
  '/settings/project-management',
];

// Workspace-management links are gated per-link by permission rather than by a blanket
// admin flag on the group. isAdmin always satisfies hasPermission (see AuthContext).
const LINK_PERMISSION: Record<string, string> = {
  '/settings/workspace': 'workspace:manage',
  '/settings/users': 'users:manage',
  '/settings/notifications': 'workspace:manage',
  '/settings/modules': 'modules:manage',
  '/settings/plugins': 'plugins:manage',
  '/settings/api-keys': 'apikeys:manage',
  '/settings/ssh': 'workspace:manage',
  '/settings/integrations': 'integrations:manage',
  '/settings/updates': 'workspace:manage',
};

const GROUPS: SettingsGroup[] = [
  {
    label: 'Personal',
    links: [
      { href: '/settings/profile', label: 'Profile' },
      { href: '/settings/preferences', label: 'Preferences' },
    ],
  },
  {
    label: 'Account',
    links: [
      { href: '/settings/account', label: 'Account' },
      { href: '/settings/security', label: 'Security' },
    ],
  },
  {
    label: 'Workspace',
    links: [
      { href: '/settings/workspace', label: 'Workspace' },
      { href: '/settings/users', label: 'Users & Roles' },
      { href: '/settings/notifications', label: 'Notifications' },
      { href: '/settings/modules', label: 'Modules' },
      { href: '/settings/plugins', label: 'Plugins' },
      { href: '/settings/api-keys', label: 'API Keys' },
      { href: '/settings/ssh', label: 'SSH Keys' },
      { href: '/settings/integrations', label: 'Integrations' },
      { href: '/settings/updates', label: 'Updates' },
    ],
  },
  {
    label: null,
    links: [{ href: '/settings/about', label: 'About' }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname.startsWith(href)) return true;
  if (href === '/settings/users' && (pathname.startsWith('/settings/roles') || pathname.startsWith('/settings/groups'))) return true;
  return false;
}

function SettingsNavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  const router = useRouter();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  return (
    <>
      <Link
        href={href}
        onContextMenu={e => {
          const url = `${window.location.origin}${href}`;
          const items: ContextMenuItem[] = [
            { icon: 'open', label: 'Open', onClick: () => router.push(href) },
            { icon: 'open', label: 'Open in new tab', onClick: () => window.open(href, '_blank') },
            { icon: 'link', label: 'Copy URL', onClick: () => navigator.clipboard.writeText(url) },
            { type: 'separator' },
            { icon: 'refresh', label: 'Refresh', onClick: () => router.refresh() },
          ];
          openMenu(e, items);
        }}
        style={{
          display: 'block',
          padding: '8px 10px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? 'var(--text)' : 'var(--text2)',
          background: active ? 'var(--surface2)' : 'transparent',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          transition: 'all .15s',
        }}
      >
        {label}
      </Link>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, hasPermission } = useAuth();
  const isAdmin = !!user?.isAdmin;

  const canSee = (href: string): boolean => !(href in LINK_PERMISSION) || hasPermission(LINK_PERMISSION[href]);

  const visibleGroups = GROUPS.map(group => ({ ...group, links: group.links.filter(link => canSee(link.href)) })).filter(
    group => group.links.length > 0
  );

  useEffect(() => {
    if (isLoading) return;
    const deepLinkBlocked = !isAdmin && ADMIN_ONLY_DEEP_LINKS.some(href => isActive(pathname, href));
    const workspaceHref = Object.keys(LINK_PERMISSION).find(href => isActive(pathname, href));
    const workspaceLinkBlocked = workspaceHref ? !hasPermission(LINK_PERMISSION[workspaceHref]) : false;
    if (deepLinkBlocked || workspaceLinkBlocked) {
      router.push('/settings/profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isLoading, pathname]);

  return (
    <div className="settings-layout">
      <Topbar />
      <div style={{ padding: 24 }}>
        <div className="settings-shell">
          <nav className="settings-subnav">
            {visibleGroups.map(group => (
              <div key={group.label ?? '_top'} className="settings-subnav-group">
                {group.label && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text3)',
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                      padding: '0 10px 6px',
                    }}
                  >
                    {group.label}
                  </div>
                )}
                {group.links.map(link => (
                  <SettingsNavLink key={link.href} href={link.href} label={link.label} active={isActive(pathname, link.href)} />
                ))}
              </div>
            ))}
          </nav>
          <div key={pathname} className="settings-content fade-in">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
