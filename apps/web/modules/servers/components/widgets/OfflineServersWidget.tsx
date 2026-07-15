'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/servers/lib/servers';
import { WidgetSkeleton, WidgetError, Stat } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function OfflineServersWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'servers-offline'],
    queryFn: async () => listServers(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const servers = data?.data ?? [];
  const offline = servers.filter(s => s.status === 'offline' || s.status === 'stopped');
  const degraded = servers.filter(s => s.status === 'degraded');

  if (offline.length === 0 && degraded.length === 0) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        All servers online
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', gap: 16 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Offline" value={offline.length} color="var(--red)" />
        <Stat label="Degraded" value={degraded.length} color="var(--amber)" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...offline, ...degraded].slice(0, 5).map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.status === 'degraded' ? 'var(--amber)' : 'var(--red)', flexShrink: 0 }} />
            <span style={{ color: 'var(--text)', flex: 1 }}>{s.name}</span>
            <span style={{ color: 'var(--text3)', textTransform: 'capitalize' }}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'infra:servers-offline',
  label: 'Offline Servers',
  description: 'Count and list of offline or degraded servers',
  icon: 'server',
  category: 'infra',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: ['refreshInterval'],
  defaultConfig: { refreshInterval: 60_000 },
  component: OfflineServersWidget,
});
