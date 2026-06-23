'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useAuth } from '@/modules/shared/lib/AuthContext';

interface SettingsLink {
  href: string;
  label: string;
}

interface SettingsGroup {
  label: string | null;
  adminOnly?: boolean;
  links: SettingsLink[];
}

const GROUPS: SettingsGroup[] = [
  {
    label: 'Personal',
    links: [
      { href: '/settings/profile', label: 'Profile' },
      { href: '/settings/appearance', label: 'Appearance' },
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
    adminOnly: true,
    links: [
      { href: '/settings/workspace', label: 'Workspace' },
      { href: '/settings/users', label: 'Users & Groups' },
      { href: '/settings/notifications', label: 'Notifications' },
      { href: '/settings/modules', label: 'Modules' },
      { href: '/settings/plugins', label: 'Plugins' },
      { href: '/settings/api-keys', label: 'API Keys' },
      { href: '/settings/ssh', label: 'SSH Keys' },
    ],
  },
  {
    label: null,
    links: [{ href: '/settings/about', label: 'About' }],
  },
];

// Admin-only pages reached by deep link only (e.g. from the Modules page),
// not surfaced as a top-level nav entry — still must be gated here.
const ADMIN_ONLY_DEEP_LINKS = [
  '/settings/pipelines',
  '/settings/tasks',
  '/settings/activity',
  '/settings/messaging',
];

function isActive(pathname: string, href: string): boolean {
  if (pathname.startsWith(href)) return true;
  if (href === '/settings/users' && pathname.startsWith('/settings/groups')) return true;
  return false;
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const isAdmin = user?.role === 'admin';

  const visibleGroups = GROUPS.filter(g => !g.adminOnly || isAdmin);
  const adminOnlyHrefs = [
    ...GROUPS.filter(g => g.adminOnly).flatMap(g => g.links.map(l => l.href)),
    ...ADMIN_ONLY_DEEP_LINKS,
  ];

  useEffect(() => {
    if (
      !isLoading &&
      !isAdmin &&
      (adminOnlyHrefs.some(href => isActive(pathname, href)) || pathname.startsWith('/settings/groups'))
    ) {
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
                {group.links.map(link => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
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
                      {link.label}
                    </Link>
                  );
                })}
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
