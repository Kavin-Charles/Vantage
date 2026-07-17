'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/infra/servers/lib/servers';
import { Badge } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, Stat, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import type { Server } from '@vencore/types';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function WidgetRow({ server: s, last, onOpen }: { server: Server; last: boolean; onOpen: () => void }) {
  const live = useServerMetrics(s.id);
  const cpu = live?.cpu_pct ?? s.cpu_pct;
  const mem = live?.mem_pct ?? s.mem_pct;
  const status = live?.status ?? s.status;
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px',
        border: 'none', borderBottom: last ? 'none' : '1px solid var(--border)',
        cursor: 'pointer', borderRadius: 4, background: 'transparent', width: '100%', textAlign: 'left',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: status === 'online' ? 'var(--green)' : status === 'degraded' ? 'var(--amber)' : 'var(--red)',
      }} />
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {s.name}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {cpu != null ? `CPU ${Math.round(cpu)}%` : '—'}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {mem != null ? `MEM ${Math.round(mem)}%` : '—'}
      </span>
      <Badge
        label={status}
        color={status === 'online' ? 'green' : status === 'degraded' ? 'amber' : status === 'stopped' ? 'gray' : 'red'}
      />
    </button>
  );
}

export function ServersWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'servers'],
    queryFn: async () => listServers(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('infra:servers'),
  });

  if (!isEnabled('infra:servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const servers: Server[] = data?.data ?? [];

  if (servers.length === 0) {
    return <EmptyState href="/infra/servers" label="Connect your first server" />;
  }

  const online = servers.filter(s => s.status === 'online').length;
  const degraded = servers.filter(s => s.status === 'degraded').length;
  const offline = servers.filter(s => s.status === 'offline' || s.status === 'stopped').length;

  const top5 = servers.slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Online" value={online} color="var(--green)" />
        <Stat label="Degraded" value={degraded} color="var(--amber)" />
        <Stat label="Offline" value={offline} color="var(--red)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {top5.map((s: Server, i: number) => (
          <WidgetRow key={s.id} server={s} last={i === top5.length - 1} onOpen={() => router.push(`/infra/servers/${s.id}`)} />
        ))}
      </div>
    </div>
  );
}
