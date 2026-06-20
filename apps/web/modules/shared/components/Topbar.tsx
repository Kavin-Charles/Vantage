'use client';

import { usePathname } from 'next/navigation';
import { NotificationBell } from './NotificationBell';

const PAGE_TITLES: Record<string, string> = {
  '/pipeline': 'Pipeline',
  '/contacts': 'Contacts',
  '/companies': 'Companies',
  '/tasks': 'Tasks',
  '/activity': 'Activity',
  '/servers': 'Servers',
  '/databases': 'Databases',
  '/websites': 'Websites',
  '/analytics': 'Analytics',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
};

export function Topbar({ action, left }: { action?: React.ReactNode; left?: React.ReactNode }) {
  const pathname = usePathname();
  const segment = '/' + (pathname.split('/')[1] ?? '');
  const title = PAGE_TITLES[segment] ?? 'Vencore';

  return (
    <div style={{
      height: 'var(--header-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16, flexShrink: 0,
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        {left ?? (
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20, fontWeight: 500,
            letterSpacing: '-0.4px', color: 'var(--text)',
          }}>{title}</span>
        )}
      </div>

      <div suppressHydrationWarning style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NotificationBell />
        {action}
      </div>
    </div>
  );
}
