'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/servers/lib/servers';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Server } from '@vencore/types';

function ServerCpuRow({ server, onOpen }: { server: Server; onOpen: () => void }) {
  const live = useServerMetrics(server.id);
  const cpu = live?.cpu_pct ?? server.cpu_pct ?? 0;
  const color = cpu > 85 ? 'var(--red)' : cpu > 60 ? 'var(--amber)' : 'var(--green)';
  return (
    <button
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</span>
      <MiniBar value={cpu} max={100} color={color} />
      <span style={{ fontSize: 11, fontWeight: 600, color, width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{Math.round(cpu)}%</span>
    </button>
  );
}

function CpuUsageWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 5;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'servers-cpu'],
    queryFn: async () => listServers(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const servers = [...(data?.data ?? [])].sort((a, b) => (b.cpu_pct ?? 0) - (a.cpu_pct ?? 0)).slice(0, limit);
  if (servers.length === 0) return <EmptyState href="/servers" label="Connect your first server" icon="server" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="CPU Usage" href="/servers" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {servers.map(s => <ServerCpuRow key={s.id} server={s} onOpen={() => router.push(`/servers/${s.id}`)} />)}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'infra:servers-cpu',
  label: 'CPU Usage',
  description: 'Servers ranked by CPU percentage — spot hotspots instantly',
  icon: 'cpu',
  category: 'infra',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit', 'refreshInterval'],
  defaultConfig: { limit: 5, refreshInterval: 60_000 },
  component: CpuUsageWidget,
});
