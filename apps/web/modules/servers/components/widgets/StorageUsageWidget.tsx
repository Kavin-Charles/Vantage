'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/servers/lib/servers';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function StorageUsageWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const limit = config.limit ?? 5;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'servers-storage'],
    queryFn: async () => listServers(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const servers = [...(data?.data ?? [])]
    .filter(s => s.disk_pct != null)
    .sort((a, b) => (b.disk_pct ?? 0) - (a.disk_pct ?? 0))
    .slice(0, limit);
  if (servers.length === 0) return <EmptyState href="/servers" label="Connect your first server" icon="server" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Storage Usage" href="/servers" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {servers.map(s => {
          const disk = s.disk_pct ?? 0;
          const color = disk > 85 ? 'var(--red)' : disk > 60 ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              <MiniBar value={disk} max={100} color={color} />
              <span style={{ fontSize: 11, fontWeight: 600, color, width: 36, textAlign: 'right', flexShrink: 0 }}>{Math.round(disk)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'infra:servers-storage',
  label: 'Storage Usage',
  description: 'Servers ranked by disk usage percentage',
  icon: 'database',
  category: 'infra',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 5 },
  component: StorageUsageWidget,
});
