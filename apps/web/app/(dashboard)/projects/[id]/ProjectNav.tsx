'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

const PRIMARY_NAV = [
  { href: 'tasks',      label: 'Tasks'      },
  { href: 'roadmap',    label: 'Roadmap'    },
  { href: 'milestones', label: 'Milestones' },
  { href: 'members',    label: 'Members'    },
  { href: 'docs',       label: 'Docs'       },
];

const MORE_NAV = [
  { href: 'sprints',    label: 'Sprints'    },
  { href: 'analytics',  label: 'Analytics'  },
  { href: 'portal',     label: 'Portal'     },
  { href: 'automation', label: 'Automation' },
  { href: 'settings',   label: 'Settings'   },
];

export function ProjectNav({ id }: { id: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeInMore = MORE_NAV.some(n => pathname.includes(`/projects/${id}/${n.href}`));

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
    padding: '8px 14px', textDecoration: 'none', display: 'inline-block',
    color: active ? 'var(--text)' : 'var(--text2)',
    borderBottom: `2px solid ${active ? 'var(--text)' : 'transparent'}`,
    transition: 'color 0.15s ease, border-color 0.15s ease',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center', overflowX: 'auto' }}>
      {PRIMARY_NAV.map(n => {
        const active = pathname.includes(`/projects/${id}/${n.href}`);
        return (
          <Link key={n.href} href={`/projects/${id}/${n.href}`} style={tabStyle(active)}>
            {n.label}
          </Link>
        );
      })}

      {/* More dropdown */}
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            ...tabStyle(activeInMore),
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${activeInMore ? 'var(--text)' : 'transparent'}`,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          More
          <span style={{
            fontSize: 10, display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}>▾</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            minWidth: 140, overflow: 'hidden',
            animation: 'pmDropdownIn 0.12s ease forwards',
          }}>
            <style>{`
              @keyframes pmDropdownIn {
                from { opacity: 0; transform: translateY(-4px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            {MORE_NAV.map(n => {
              const active = pathname.includes(`/projects/${id}/${n.href}`);
              return (
                <Link
                  key={n.href}
                  href={`/projects/${id}/${n.href}`}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'block', padding: '10px 16px',
                    fontFamily: 'DM Sans', fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? 'var(--text)' : 'var(--text2)',
                    textDecoration: 'none',
                    background: active ? 'var(--surface2)' : 'transparent',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                  onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
