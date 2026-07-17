'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getServerMetrics } from '@/modules/infra/servers/lib/servers';
import { MetricChart, type ChartPoint } from './MetricChart';
import type { MetricsRange, MetricsPoint } from '@vencore/types';

const RANGES: { value: MetricsRange; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

export function MetricsPanel({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [range, setRange] = useState<MetricsRange>('24h');

  const { data, isLoading } = useQuery({
    queryKey: ['server-metrics', serverId, range],
    queryFn: async () => getServerMetrics(await getToken(), serverId, range),
    refetchInterval: range === '1h' || range === '24h' ? 30_000 : 300_000,
  });

  const points: MetricsPoint[] = data?.data.points ?? [];
  const series = (key: 'cpu' | 'mem' | 'disk'): ChartPoint[] =>
    points.map(p => ({
      t: p.t,
      value: p[`${key}_pct`] as number,
      ...(p[`${key}_max`] != null ? { max: p[`${key}_max`] as number } : {}),
    }));
  const loadSeries: ChartPoint[] = points.map(p => ({ t: p.t, value: p.load_avg_1m }));
  const netSeries: ChartPoint[] = points.map(p => ({ t: p.t, value: p.net_in_bytes + p.net_out_bytes }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              style={{
                padding: '4px 12px', fontSize: 12, fontWeight: range === r.value ? 600 : 400,
                border: 'none', cursor: 'pointer',
                background: range === r.value ? 'var(--text)' : 'var(--surface)',
                color: range === r.value ? 'var(--bg)' : 'var(--text2)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && points.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading metrics…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {([
            { key: 'cpu' as const, label: 'CPU', color: 'var(--blue)' },
            { key: 'mem' as const, label: 'Memory', color: 'var(--purple)' },
            { key: 'disk' as const, label: 'Disk', color: 'var(--amber)' },
          ]).map(m => (
            <div key={m.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
              <MetricChart points={series(m.key)} label={m.label} color={m.color} unit="%" percent />
            </div>
          ))}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
            <MetricChart points={loadSeries} label="Load avg (1m)" color="var(--green)" format={n => n.toFixed(2)} />
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
            <MetricChart points={netSeries} label="Network (in+out)" color="var(--text2)" format={fmtBytes} />
          </div>
        </div>
      )}
    </div>
  );
}
