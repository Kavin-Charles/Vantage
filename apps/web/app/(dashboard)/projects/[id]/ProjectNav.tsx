'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: 'tasks',     label: 'Tasks'     },
  { href: 'roadmap',   label: 'Roadmap'   },
  { href: 'analytics', label: 'Analytics' },
  { href: 'docs',      label: 'Docs'      },
];

export function ProjectNav({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {NAV.map(n => {
        const active = pathname.includes(`/projects/${id}/${n.href}`);
        return (
          <Link
            key={n.href}
            href={`/projects/${id}/${n.href}`}
            style={{
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              padding: '8px 14px', textDecoration: 'none',
              color: active ? 'var(--text)' : 'var(--text2)',
              borderBottom: `2px solid ${active ? 'var(--text)' : 'transparent'}`,
              display: 'inline-block',
            }}
          >
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}
