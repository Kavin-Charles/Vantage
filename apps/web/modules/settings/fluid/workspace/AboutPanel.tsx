'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/modules/shared/lib/api';
import { GlassCard, PageHeader } from '@/modules/shared/fluid/ui';

const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '14px 0',
  borderBottom: '1px solid var(--fl-outline-variant)',
};
const label: React.CSSProperties = { fontSize: 13, color: 'var(--fl-on-surface-variant)', fontWeight: 600 };
const value: React.CSSProperties = { fontSize: 14, color: 'var(--fl-on-surface)' };

const links = [
  { label: 'Documentation', href: 'https://github.com/Kavin-Charles/Vencore#readme' },
  { label: 'Report an issue', href: 'https://github.com/Kavin-Charles/Vencore/issues' },
];

/**
 * Fluid About settings panel — registered into the Foundation settings
 * registry (workspace scope, admin-only). Mounted directly by
 * apps/web/app/(fluid)/settings/about/page.tsx.
 *
 * Reuses the exact backend surface as the legacy
 * apps/web/app/(dashboard)/settings/about/page.tsx it replaces:
 *   - GET /api/system/version → currently running version
 */
export function AboutPanel() {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    apiFetch<{ data: { version: string } }>('/api/system/version')
      .then(r => setVersion(r.data.version))
      .catch(() => setVersion('unknown'));
  }, []);

  return (
    <>
      <PageHeader title="About" subtitle="Version and resources." />

      <GlassCard>
        <div style={row}>
          <span style={label}>Version</span>
          <span style={value}>{version}</span>
        </div>
        {links.map(link => (
          <div key={link.label} style={row}>
            <span style={label}>{link.label}</span>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              style={{ ...value, color: 'var(--fl-primary)', textDecoration: 'underline' }}
            >
              {link.href.replace('https://', '')}
            </a>
          </div>
        ))}
        <p style={{ fontSize: 12, color: 'var(--fl-outline)', marginTop: 20, marginBottom: 0 }}>
          Vencore — One Platform to Run Your Entire Business.
        </p>
      </GlassCard>
    </>
  );
}
