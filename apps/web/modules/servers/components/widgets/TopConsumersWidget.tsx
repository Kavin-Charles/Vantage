'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/servers/lib/servers';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Server } from '@vencore/types';

function TopConsumerRow({ server }: { server: Server }) {
  const live = useServerMetrics(server.id);
  const cpu = live?.cpu_pct ?? server.cpu_pct ?? 0;
  const mem = live?.mem_pct ?? server.mem_pct ?? 0;
  const score = (cpu + mem) / 2;
  const color = score > 85 ? 'var(--red)' : score > 60 ? 'var(--amber)' : 'var(--text2)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</span>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>CPU {Math.round(cpu)}%</span>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>MEM {Math.round(mem)}%</span>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>avg {Math.round(score)}%</span>
    </div>
  );
}

function TopConsumersWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const limit = config.limit ?? 5;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'top-consumers'],
    queryFn: async () => listServers(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const servers = [...(data?.data ?? [])]
    .sort((a, b) => (((b.cpu_pct ?? 0) + (b.mem_pct ?? 0)) / 2) - (((a.cpu_pct ?? 0) + (a.mem_pct ?? 0)) / 2))
    .slice(0, limit);
  if (servers.length === 0) return <EmptyState href="/servers" label="Connect your first server" icon="server" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Top Resource Consumers" href="/servers" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {servers.map(s => <TopConsumerRow key={s.id} server={s} />)}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'infra:servers-top-consumers',
  label: 'Top Resource Consumers',
  description: 'Servers ranked by average CPU + RAM usage',
  icon: 'cpu',
  category: 'infra',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit', 'refreshInterval'],
  defaultConfig: { limit: 5, refreshInterval: 60_000 },
  component: TopConsumersWidget,
});
