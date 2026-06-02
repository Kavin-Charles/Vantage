'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/Topbar';
import { useAuth } from '@/lib/AuthContext';

interface Tab {
  href: string;
  label: string;
  adminOnly?: boolean;
}

const ALL_TABS: Tab[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/users', label: 'Users & Groups', adminOnly: true },
  { href: '/settings/pipelines', label: 'Pipelines', adminOnly: true },
  { href: '/settings/tasks', label: 'Tasks', adminOnly: true },
  { href: '/settings/ssh', label: 'SSH Keys', adminOnly: true },
  { href: '/settings/api-keys', label: 'API Keys', adminOnly: true },
  { href: '/settings/modules', label: 'Modules', adminOnly: true },
  { href: '/settings/plugins', label: 'Plugins', adminOnly: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const isAdmin = user?.role === 'admin';

  // Filter tabs based on admin status
  const TABS = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  // Redirect non-admins away from admin-only settings pages
  useEffect(() => {
    if (!isLoading && !isAdmin && (
      pathname.startsWith('/settings/users') ||
      pathname.startsWith('/settings/groups') ||
      pathname.startsWith('/settings/pipelines') ||
      pathname.startsWith('/settings/tasks') ||
      pathname.startsWith('/settings/ssh') ||
      pathname.startsWith('/settings/api-keys') ||
      pathname.startsWith('/settings/modules') ||
      pathname.startsWith('/settings/plugins')
    )) {
      router.push('/settings/profile');
    }
  }, [isAdmin, isLoading, pathname, router]);

  return (
    <>
      <Topbar />
      <div style={{ padding: 24 }}>
        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href) || (tab.href === '/settings/users' && pathname.startsWith('/settings/groups'));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: active ? 'var(--text)' : 'var(--text3)',
                  textDecoration: 'none',
                  borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'all .15s',
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        {children}
      </div>
    </>
  );
}
