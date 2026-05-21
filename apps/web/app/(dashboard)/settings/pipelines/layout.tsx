'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  { href: '/settings/pipelines', label: 'Pipelines', exact: true },
  { href: '/settings/pipelines/record-types', label: 'Record Types' },
  { href: '/settings/pipelines/conversions', label: 'Conversions' },
];

export default function PipelinesSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* Left sidebar */}
      <div style={{
        width: 176,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        paddingRight: 0,
        marginRight: 32,
        paddingTop: 4,
      }}>
        {SECTIONS.map(s => {
          const active = s.exact ? pathname === s.href : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              style={{
                display: 'block',
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--text3)',
                background: active ? 'var(--surface2, #f0ede6)' : 'transparent',
                textDecoration: 'none',
                marginBottom: 2,
                fontFamily: 'DM Sans, sans-serif',
                transition: 'all .12s',
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
