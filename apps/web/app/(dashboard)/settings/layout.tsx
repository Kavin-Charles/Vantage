'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Topbar } from '@/components/Topbar';

const TABS = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/team', label: 'Team' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <Topbar />
      <div style={{ padding: 24 }}>
        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href);
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
