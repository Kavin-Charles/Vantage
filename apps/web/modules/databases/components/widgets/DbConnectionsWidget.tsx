'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listInfraDatabases } from '@/modules/databases/lib/infra-databases';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function DbConnectionsWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'db-connections'],
    queryFn: async () => listInfraDatabases(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const dbs = [...(data?.data ?? [])].filter(d => d.connection_count != null).sort((a, b) => (b.connection_count ?? 0) - (a.connection_count ?? 0));
  if (dbs.length === 0) return <EmptyState href="/infra/databases" label="No connection data yet" icon="database" />;

  const max = Math.max(...dbs.map(d => d.connection_count ?? 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="DB Connections" href="/infra/databases" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {dbs.map(db => (
          <div key={db.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{db.name}</span>
            <MiniBar value={db.connection_count ?? 0} max={max} color="var(--green)" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', width: 24, textAlign: 'right', flexShrink: 0 }}>{db.connection_count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:db-connections', label: 'DB Connections', description: 'Active connection count per database', icon: 'database', category: 'infra', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: ['refreshInterval'], defaultConfig: { refreshInterval: 60_000 }, component: DbConnectionsWidget });
