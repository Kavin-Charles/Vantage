'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: 'tasks',      label: 'Tasks'      },
  { href: 'roadmap',    label: 'Roadmap'    },
  { href: 'milestones', label: 'Milestones' },
  { href: 'members',    label: 'Members'    },
  { href: 'sprints',    label: 'Sprints'    },
  { href: 'analytics',  label: 'Analytics'  },
  { href: 'crm',        label: 'CRM'        },
  { href: 'portal',     label: 'Portal'     },
  { href: 'docs',       label: 'Docs'       },
  { href: 'automation', label: 'Automation' },
  { href: 'settings',   label: 'Settings'   },
];

export function ProjectNav({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center', overflowX: 'auto' }}>
      {NAV.map(n => {
        const active = pathname.includes(`/projects/${id}/${n.href}`);
        return (
          <Link
            key={n.href}
            href={`/projects/${id}/${n.href}`}
            style={{
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              padding: '8px 14px', textDecoration: 'none', display: 'inline-block',
              color: active ? 'var(--text)' : 'var(--text2)',
              borderBottom: `2px solid ${active ? 'var(--text)' : 'transparent'}`,
              transition: 'color 0.15s ease, border-color 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}
