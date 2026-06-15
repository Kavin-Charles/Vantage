'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

interface ProjectInfo {
  id: string;
  name: string;
  health: string;
  progress: number;
  color: string | null;
}

const NAV_TABS = [
  { href: '', label: 'Overview' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/files', label: 'Files' },
  { href: '/approvals', label: 'Approvals' },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { token } = useParams<{ token: string }>();
  const pathname = usePathname();
  const [project, setProject] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portal/${token}/project`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setProject(json.data); })
      .catch(() => {});
  }, [token]);

  const base = `/portal/${token}`;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #f7f6f2)',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface, #fff)',
        borderBottom: '1px solid var(--border, #e4e0d8)',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56 }}>
          <span style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: 20,
            color: 'var(--text, #1a1814)',
          }}>
            {project?.name ?? 'Client Portal'}
          </span>

          {project && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                height: 4, width: 120,
                background: 'var(--surface2, #f0ede6)',
                borderRadius: 2,
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: project.color ?? 'var(--green, #2d6a4f)',
                  width: `${project.progress}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text3, #9e998f)' }}>
                {project.progress}% complete
              </span>
            </div>
          )}
        </div>

        {/* Sub-nav */}
        <div style={{ display: 'flex', gap: 2 }}>
          {NAV_TABS.map(tab => {
            const href = `${base}${tab.href}`;
            const active = tab.href === ''
              ? pathname === base
              : pathname.startsWith(href);
            return (
              <Link
                key={tab.href}
                href={href}
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 14px',
                  textDecoration: 'none',
                  color: active ? 'var(--text, #1a1814)' : 'var(--text2, #6b665c)',
                  borderBottom: active ? '2px solid var(--text, #1a1814)' : '2px solid transparent',
                  display: 'inline-block',
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px' }}>
        {children}
      </div>
    </div>
  );
}
