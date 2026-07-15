'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listInfraDatabases } from '@/modules/databases/lib/infra-databases';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function ReplicationLagWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'db-replication-lag'],
    queryFn: async () => listInfraDatabases(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const dbs = [...(data?.data ?? [])].filter(d => d.replication_lag_s != null).sort((a, b) => (b.replication_lag_s ?? 0) - (a.replication_lag_s ?? 0));
  if (dbs.length === 0) return <EmptyState href="/infra/databases" label="No replication lag data" icon="database" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Replication Lag" href="/infra/databases" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {dbs.map(db => {
          const lag = db.replication_lag_s ?? 0;
          const color = lag > 10 ? 'var(--red)' : lag > 2 ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={db.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{db.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{lag.toFixed(2)}s</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:db-replication-lag', label: 'Replication Lag', description: 'Replication lag per database — red > 10s', icon: 'database', category: 'infra', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: ['refreshInterval'], defaultConfig: { refreshInterval: 60_000 }, component: ReplicationLagWidget });
