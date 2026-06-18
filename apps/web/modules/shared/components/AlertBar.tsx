'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useLastAlert } from '@/modules/shared/contexts/ServerMetricsContext';
import { useModules } from '@/modules/shared/contexts/modules';
import type { Alert } from '@vencore/types';

export function AlertBar() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const lastAlert = useLastAlert();
  const [dismissed, setDismissed] = useState(false);

  if (!isEnabled('alerts')) return null;

  const { data } = useQuery({
    queryKey: ['alerts', 'bar'],
    queryFn: async () =>
      apiFetch<{ data: Alert[]; total: number; error: null }>(
        '/api/alerts?resolved=false&limit=20',
        { token: await getToken() },
      ),
    refetchInterval: 120_000,
  });

  // On new alert SSE event, immediately refetch the alerts bar
  useEffect(() => {
    if (!lastAlert) return;
    void qc.invalidateQueries({ queryKey: ['alerts', 'bar'] });
  }, [lastAlert, qc]);

  const alerts: Alert[] = data?.data ?? [];
  const active = alerts.filter(a => !a.resolved);
  const critical = active.filter(a => a.severity === 'critical').length;
  const warning  = active.filter(a => a.severity === 'warning').length;
  const info     = active.filter(a => a.severity === 'info').length;
  const highest  = active.find(a => a.severity === 'critical') ?? active.find(a => a.severity === 'warning') ?? active[0];

  if (!active.length || dismissed) return null;

  return (
    <div style={{
      margin: '12px 24px 0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Top row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 16px',
        background: 'linear-gradient(180deg,#fff7ed 0%,#fef3c7 100%)',
      }}>
        <span style={{ position: 'relative', width: 8, height: 8, borderRadius: 999, background: 'var(--amber)', flexShrink: 0 }}>
          <span style={{
            position: 'absolute', inset: -4, borderRadius: 999,
            background: 'var(--amber)', opacity: 0.3,
            animation: 'vt-pulse 1.6s ease-out infinite',
          }} />
        </span>
        <span style={{ font: '600 13px var(--font-sans)', color: 'var(--amber)' }}>
          {active.length} active alert{active.length > 1 ? 's' : ''}
        </span>
        {highest && (
          <span style={{ font: '13px var(--font-sans)', color: 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Highest severity · <strong style={{ fontWeight: 600 }}>{highest.message}</strong>
          </span>
        )}
        <button
          onClick={() => router.push('/alerts')}
          style={{
            font: '500 12px var(--font-sans)', color: 'var(--amber)',
            background: 'rgba(146,64,14,0.08)', border: 'none', cursor: 'pointer',
            padding: '5px 10px', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
          }}>
          Open <Icon name="arrow" size={12} />
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', display: 'flex', padding: 2 }}>
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Severity counts */}
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '10px 12px', gap: 6, borderTop: '1px solid var(--border)' }}>
        {([
          ['critical', 'var(--red)',   'var(--red-bg)',   critical],
          ['warning',  'var(--amber)', 'var(--amber-bg)', warning],
          ['info',     'var(--blue)',  'var(--blue-bg)',  info],
        ] as const).map(([sev, fg, bg, n]) => (
          <div key={sev} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: bg, borderRadius: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: fg, flexShrink: 0 }} />
            <span style={{ font: '600 11px var(--font-sans)', color: fg, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sev}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: fg, letterSpacing: '-0.3px' }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
