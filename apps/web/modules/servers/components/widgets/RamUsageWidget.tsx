'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/servers/lib/servers';
import { apiFetch } from '@/modules/shared/lib/api';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';
import type { Server } from '@vencore/types';

const fetchRegionOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { region: string | null }[] }>('/api/servers', { token });
  const regions = [...new Set(res.data.map(s => s.region).filter((r): r is string => r !== null))];
  return regions.map(r => ({ label: r, value: r }));
};

function ServerRamRow({ server, onOpen }: { server: Server; onOpen: () => void }) {
  const live = useServerMetrics(server.id);
  const mem = live?.mem_pct ?? server.mem_pct ?? 0;
  const color = mem > 85 ? 'var(--red)' : mem > 60 ? 'var(--amber)' : 'var(--blue)';
  return (
    <button
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</span>
      <MiniBar value={mem} max={100} color={color} />
      <span style={{ fontSize: 11, fontWeight: 600, color, width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{Math.round(mem)}%</span>
    </button>
  );
}

function RamUsageWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 5;
  const region = config.filters?.['region'] ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'servers-ram', region],
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
    .filter(s => !region || s.region === region)
    .sort((a, b) => (b.mem_pct ?? 0) - (a.mem_pct ?? 0))
    .slice(0, limit);
  if (servers.length === 0) return <EmptyState href="/servers" label="Connect your first server" icon="server" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="RAM Usage" href="/servers" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {servers.map(s => <ServerRamRow key={s.id} server={s} onOpen={() => router.push(`/servers/${s.id}`)} />)}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'infra:servers-ram',
  label: 'RAM Usage',
  description: 'Servers ranked by memory percentage',
  icon: 'memory',
  category: 'infra',
  module: 'servers',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit', 'refreshInterval'],
  defaultConfig: { limit: 5, refreshInterval: 60_000 },
  filterDefs: [
    { key: 'region', label: 'Region', type: 'select', fetchOptions: fetchRegionOptions, placeholder: 'All regions' },
  ],
  component: RamUsageWidget,
});
