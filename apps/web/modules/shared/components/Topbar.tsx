'use client';

import { usePathname } from 'next/navigation';
import { Icon } from '@/modules/shared/components/ui/Icon';
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '6px 12px', width: 240,
        }}>
          <span style={{ color: 'var(--text3)', display: 'inline-flex', flexShrink: 0 }}>
            <Icon name="search" size={15} />
          </span>
          <input
            placeholder="Search..."
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', width: '100%' }}
          />
        </div>

        <NotificationBell />
        {action}
      </div>
    </div>
  );
}
