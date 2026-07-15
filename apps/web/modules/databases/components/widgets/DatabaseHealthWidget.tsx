'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listInfraDatabases } from '@/modules/databases/lib/infra-databases';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, StatusDot } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function DatabaseHealthWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'db-health'],
    queryFn: async () => listInfraDatabases(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 120_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const dbs = data?.data ?? [];
  if (dbs.length === 0) return <EmptyState href="/infra/databases" label="Add your first database" icon="database" />;

  const STATUS_COLOR: Record<string, string> = { healthy: 'var(--green)', degraded: 'var(--amber)', offline: 'var(--red)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Database Health" href="/infra/databases" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {dbs.map(db => (
          <div key={db.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>
            <StatusDot color={STATUS_COLOR[db.status] ?? 'var(--text3)'} />
            <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{db.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>{db.engine}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[db.status] ?? 'var(--text3)', textTransform: 'capitalize' }}>{db.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:db-health', label: 'Database Health', description: 'Status summary for all monitored databases', icon: 'database', category: 'infra', sizeOptions: ['small', 'medium'], defaultSize: 'medium', defaultW: 4, defaultH: 3, minW: 3, minH: 2, supportedFilters: ['refreshInterval'], defaultConfig: { refreshInterval: 120_000 }, component: DatabaseHealthWidget });
