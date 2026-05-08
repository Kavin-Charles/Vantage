'use client';

import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/pipeline': 'Pipeline',
  '/contacts': 'Contacts',
  '/companies': 'Companies',
  '/tasks': 'Tasks',
  '/activity': 'Activity',
  '/servers': 'Servers',
  '/databases': 'Databases',
  '/websites': 'Websites',
  '/files': 'Files',
  '/analytics': 'Analytics',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
};

export function Topbar({ action }: { action?: React.ReactNode }) {
  const pathname = usePathname();
  const segment = '/' + (pathname.split('/')[1] ?? '');
  const title = pageTitles[segment] ?? 'Vantage';

  return (
    <div style={{
      height: 'var(--header-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 16,
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: 'var(--font-instrument-serif), Instrument Serif, serif',
        fontSize: 20,
        color: 'var(--text)',
        flex: 1,
      }}>
        {title}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 12px',
          width: 220,
        }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" style={{ color: 'var(--text3)', flexShrink: 0 }}>
            <path d="M10 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zm-.7 3.1l3.6 3.6-.7.7-3.6-3.6a4.5 4.5 0 11.7-.7z" fill="currentColor" />
          </svg>
          <input
            placeholder="Search..."
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', width: '100%' }}
          />
        </div>

        {action}
      </div>
    </div>
  );
}
