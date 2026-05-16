'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/useConfig';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: { label: string; color: 'green' | 'red' | 'amber' };
  dot?: boolean;
}

const crmNav: NavItem[] = [
  {
    href: '/pipeline',
    label: 'Pipeline',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1h4v4H1V1zm0 5h4v4H1V6zm5-5h4v4H6V1zm0 5h4v4H6V6zm5-5h3v4h-3V1zm0 5h3v4h-3V6zM1 11h4v3H1v-3zm5 0h4v3H6v-3zm5 0h3v3h-3v-3z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/contacts',
    label: 'Contacts',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 0a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM0 13.5C0 10.46 3.36 8 7.5 8s7.5 2.46 7.5 5.5V15H0v-1.5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/companies',
    label: 'Companies',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1h13v13H1V1zm1 1v11h11V2H2zm2 2h3v3H4V4zm4 0h3v3H8V4zM4 9h3v3H4V9zm4 0h3v3H8V9z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1h13v2H1V1zm0 4h13v2H1V5zm0 4h13v2H1V9zm0 4h13v2H1v-2z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/activity',
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 7.5L3 4l2.5 3L8.5 1 12 7.5l1.5-2H15" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
  {
    href: '/mail',
    label: 'Mail',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    ),
  },
];

const infraNav: NavItem[] = [
  {
    href: '/servers',
    label: 'Servers',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 2h13v4H1V2zm0 6h13v4H1V8zm2 1.5a.5.5 0 100 1 .5.5 0 000-1zm0-6a.5.5 0 100 1 .5.5 0 000-1z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/databases',
    label: 'Databases',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 1C4.46 1 2 2.12 2 3.5v8C2 12.88 4.46 14 7.5 14S13 12.88 13 11.5v-8C13 2.12 10.54 1 7.5 1zm4.5 2.5c0 .55-1.79 1.5-4.5 1.5S3 4.05 3 3.5 4.79 2 7.5 2 12 2.95 12 3.5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/websites',
    label: 'Websites',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 1a6.5 6.5 0 100 13A6.5 6.5 0 007.5 1zm0 1c.8 0 1.8.9 2.5 2.5H5C5.7 2.9 6.7 2 7.5 2zm-3.4 1a8 8 0 00-.7 2H2a5.5 5.5 0 012.1-2zM2 6h1.3c-.1.5-.1 1-.1 1.5S3.2 8.5 3.3 9H2a5.5 5.5 0 010-3zm.6 4h1.3c.2.7.4 1.4.7 2A5.5 5.5 0 012.6 10zm4.9 3c-.8 0-1.8-.9-2.5-2.5h5C9.3 12.1 8.3 13 7.5 13zm3.4-1a8 8 0 00.7-2H13a5.5 5.5 0 01-2.1 2zM13 9h-1.3c.1-.5.1-1 .1-1.5S11.8 6.5 11.7 6H13a5.5 5.5 0 010 3zm-.6-4h-1.3a8 8 0 00-.7-2A5.5 5.5 0 0112.4 5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/files',
    label: 'Files',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 1h6l4 4v9H3V1zm6 0v4h4M6 8h4M6 11h4M6 5h2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
];

const analyticsNav: NavItem[] = [
  {
    href: '/analytics',
    label: 'Analytics',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 14V8h3v6H1zm4 0V5h3v9H5zm4 0V2h3v12H9z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/alerts',
    label: 'Alerts',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 1L1 13h13L7.5 1zm0 3L12 13H3l4.5-9zM7 9V7h1v2H7zm0 1h1v1H7v-1z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/settings/profile',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 1h3l.5 2a5 5 0 011.2.7l2-.7 1.5 2.6-1.5 1.4a5 5 0 010 1.4l1.5 1.4-1.5 2.6-2-.7a5 5 0 01-1.2.7L9 14H6l-.5-2a5 5 0 01-1.2-.7l-2 .7-1.5-2.6 1.5-1.4a5 5 0 010-1.4L.8 5.6l1.5-2.6 2 .7A5 5 0 015.5 3L6 1zm1.5 4a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" fill="currentColor" />
      </svg>
    ),
  },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

  return (
    <Link href={item.href} style={{
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '7px 10px',
      borderRadius: 8,
      cursor: 'pointer',
      color: active ? '#fff' : 'var(--text2)',
      background: active ? 'var(--text)' : 'transparent',
      fontWeight: active ? 500 : 400,
      fontSize: 13.5,
      marginBottom: 1,
      textDecoration: 'none',
      transition: 'all .15s',
      userSelect: 'none',
    }}>
      <span style={{ width: 15, height: 15, flexShrink: 0, opacity: active ? 1 : 0.7 }}>
        {item.icon}
      </span>
      {item.label}
      {item.dot && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', marginLeft: 'auto', flexShrink: 0 }} />
      )}
    </Link>
  );
}

export function Sidebar() {
  const getToken = useApiToken();
  const { user, logout } = useAuth();
  const { data: config } = useConfig();
  const { data: alertData } = useQuery({
    queryKey: ['alerts-badge'],
    queryFn: async () => apiFetch<{ data: unknown[]; total: number; error: null }>('/api/alerts?resolved=false&severity=critical&limit=1', { token: await getToken() }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const hasCritical = (alertData?.total ?? 0) > 0;

  const analyticsNavWithBadge = analyticsNav.map(item =>
    item.href === '/alerts' ? { ...item, dot: hasCritical } : item
  );

  return (
    <div style={{
      width: 'var(--sidebar-w)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100vh',
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, background: 'var(--text)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {config?.app.logoUrl && config.app.logoUrl !== '/logo.png' ? (
            <img src={config.app.logoUrl} alt="logo" style={{ width: 28, height: 28, objectFit: 'cover' }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L2 14h12L8 2z" fill="white" />
            </svg>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-instrument-serif), Instrument Serif, serif', fontSize: 18, color: 'var(--text)', letterSpacing: -0.3 }}>
          {config?.app.name ?? 'Vantage'}
        </span>
      </div>

      {/* CRM */}
      {(config?.features.crm ?? true) && (
        <div style={{ padding: '14px 12px 6px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, padding: '0 8px', marginBottom: 4 }}>
            CRM
          </div>
          {crmNav.map(item => <NavLink key={item.href} item={item} />)}
        </div>
      )}

      {/* Infrastructure */}
      {(config?.features.infra ?? true) && (
        <div style={{ padding: '14px 12px 6px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, padding: '0 8px', marginBottom: 4 }}>
            Infrastructure
          </div>
          {infraNav
            .filter(item => item.href !== '/files' || (config?.features.files ?? true))
            .map(item => <NavLink key={item.href} item={item} />)}
        </div>
      )}

      {/* General */}
      <div style={{ padding: '14px 12px 6px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, padding: '0 8px', marginBottom: 4 }}>
          General
        </div>
        {analyticsNavWithBadge
          .filter(item => item.href !== '/analytics' || (config?.features.analytics ?? true))
          .filter(item => item.href !== '/alerts' || (config?.features.alerts ?? true))
          .map(item => <NavLink key={item.href} item={item} />)}
      </div>

      {/* User */}
      <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text2)', flexShrink: 0 }}>
            {user ? (user.name ?? user.email)[0].toUpperCase() : '?'}
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
              <path d="M13 7.5H6M10 4.5l3 3-3 3M8 2H2v11h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
