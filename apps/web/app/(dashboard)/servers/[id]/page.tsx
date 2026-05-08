'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { Badge, statusColor } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useApiToken } from '@/lib/useApiToken';
import { getServer } from '@/lib/servers';
import type { MetricsSnapshot } from '@vantage/types';

function Sparkline({ data, color = '#2d6a4f' }: { data: number[]; color?: string }) {
  if (data.length < 2) return <span style={{ color: 'var(--text3)', fontSize: 11 }}>no data</span>;
  const max = Math.max(...data, 1);
  const w = 120, h = 32, pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - v / max) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({ label, value, unit, snapshots, color }: {
  label: string; value: number | null; unit: string; snapshots: number[]; color?: string;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{value !== null ? `${value}${unit}` : '—'}</div>
      <Sparkline data={snapshots} color={color} />
    </div>
  );
}

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['server', id],
    queryFn: async () => getServer(await getToken(), id),
    refetchInterval: 30_000,
  });

  const server = data?.data;
  const snapshots = server?.snapshots ?? [];

  type NumericMetric = 'cpu_pct' | 'mem_pct' | 'disk_pct' | 'load_avg_1m' | 'net_in_bytes' | 'net_out_bytes';

  function snap(key: NumericMetric): number[] {
    return snapshots.map(s => Number(s[key]) || 0);
  }

  if (isLoading) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div></>;
  if (!server) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Server not found.</div></>;

  return (
    <>
      <Topbar action={<Button onClick={() => router.push('/servers')}>← Servers</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{server.name}</h2>
          <Badge label={server.status} color={statusColor[server.status] ?? 'gray'} />
          {server.region && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{server.region}</span>}
        </div>

        {/* Metric sparklines */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
          <MetricCard label="CPU" value={server.cpu_pct} unit="%" snapshots={snap('cpu_pct')} color="var(--blue)" />
          <MetricCard label="Memory" value={server.mem_pct} unit="%" snapshots={snap('mem_pct')} color="var(--purple)" />
          <MetricCard label="Disk" value={server.disk_pct} unit="%" snapshots={snap('disk_pct')} color="var(--amber)" />
          <MetricCard label="Load avg (1m)" value={server.load_avg_1m} unit="" snapshots={snap('load_avg_1m')} color="var(--green)" />
        </div>

        {/* Meta */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Details</div>
          {[
            ['Uptime', server.uptime_seconds !== null ? `${Math.floor(server.uptime_seconds / 86400)}d ${Math.floor((server.uptime_seconds % 86400) / 3600)}h` : '—'],
            ['IP', server.ip_address ?? '—'],
            ['Last ping', server.last_ping_at ? new Date(server.last_ping_at).toLocaleString() : 'never'],
            ['Net in (interval)', server.net_in_bytes !== null ? `${(server.net_in_bytes / 1024).toFixed(1)} KB` : '—'],
            ['Net out (interval)', server.net_out_bytes !== null ? `${(server.net_out_bytes / 1024).toFixed(1)} KB` : '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
