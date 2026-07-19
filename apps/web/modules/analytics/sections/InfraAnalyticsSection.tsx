'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getInfraAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--text)';
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color }}>{value}</div>
    </div>
  );
}

export function InfraAnalyticsSection({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics-infra', period],
    queryFn: async () => getInfraAnalytics(await getToken(), period),
  });

  if (isError) {
    return (
      <div style={{ ...card, padding: '20px 24px', color: 'var(--text2)', fontSize: 13 }}>
        Failed to load infrastructure analytics.
      </div>
    );
  }

  const d = data?.data;
  const pct = (n: number | undefined) => (n === undefined ? '—' : `${n.toFixed(0)}%`);

  return (
    <div style={{ ...card, padding: '20px 24px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
        Infrastructure
      </div>
      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <Stat label="Online" value={String(d?.servers.online ?? 0)} tone="green" />
            <Stat label="Degraded" value={String(d?.servers.degraded ?? 0)} tone={d?.servers.degraded ? 'amber' : undefined} />
            <Stat label="Offline" value={String(d?.servers.offline ?? 0)} tone={d?.servers.offline ? 'red' : undefined} />
            <Stat label="Avg CPU" value={pct(d?.servers.avg_cpu)} />
            <Stat label="Avg memory" value={pct(d?.servers.avg_mem)} />
            <Stat label="Avg disk" value={pct(d?.servers.avg_disk)} />
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <Stat label="Websites" value={String(d?.websites.total ?? 0)} />
            <Stat label="Avg uptime (30d)" value={d?.websites.avg_uptime !== undefined ? `${d.websites.avg_uptime.toFixed(2)}%` : '—'} />
            <Stat label="SSL expiring <30d" value={String(d?.websites.ssl_expiring_soon ?? 0)} tone={d?.websites.ssl_expiring_soon ? 'amber' : undefined} />
            <Stat label="Critical alerts" value={String(d?.alerts.critical ?? 0)} tone={d?.alerts.critical ? 'red' : undefined} />
            <Stat label="Warnings" value={String(d?.alerts.warning ?? 0)} tone={d?.alerts.warning ? 'amber' : undefined} />
          </div>
        </div>
      )}
    </div>
  );
}
