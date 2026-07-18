'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listInfraDatabases } from '@/modules/infra/databases/lib/infra-databases';
import type { InfraDatabase } from '@vencore/types';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const ENGINE_OPTIONS: FilterOption[] = [
  { label: 'Postgres', value: 'postgres' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'Redis', value: 'redis' },
  { label: 'ClickHouse', value: 'clickhouse' },
  { label: 'Mongo', value: 'mongo' },
  { label: 'Other', value: 'other' },
];

function DbStorageWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const engine = config.filters?.['engine'] ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'db-storage', engine],
    queryFn: async () => listInfraDatabases(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const dbs = (data?.data ?? []).filter((db: InfraDatabase) => !engine || db.engine === engine).filter((d: InfraDatabase) => d.storage_gb != null).sort((a: InfraDatabase, b: InfraDatabase) => (b.storage_gb ?? 0) - (a.storage_gb ?? 0));
  if (dbs.length === 0) return <EmptyState href="/infra/databases" label="Add your first database" icon="database" />;

  const max = dbs[0]?.storage_gb ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="DB Storage" href="/infra/databases" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {dbs.map((db: InfraDatabase) => (
          <div key={db.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{db.name}</span>
            <MiniBar value={db.storage_gb ?? 0} max={max} color="var(--blue)" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', width: 44, textAlign: 'right', flexShrink: 0 }}>{db.storage_gb?.toFixed(1)} GB</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:db-storage', label: 'DB Storage', description: 'Storage usage per database, sorted descending', icon: 'database', category: 'infra', module: 'databases', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: [], filterDefs: [{ key: 'engine', label: 'Engine', type: 'pills', options: ENGINE_OPTIONS }], defaultConfig: {}, component: DbStorageWidget });
