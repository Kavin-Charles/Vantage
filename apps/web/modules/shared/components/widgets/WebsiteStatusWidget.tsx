'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listWebsites } from '@/modules/shared/lib/websites';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, StatusDot } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function WebsiteStatusWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'websites-status'],
    queryFn: async () => listWebsites(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const sites = data?.data ?? [];
  if (sites.length === 0) return <EmptyState href="/infra/websites" label="Add your first website" icon="globe" />;

  const STATUS_COLOR: Record<string, string> = { online: 'var(--green)', degraded: 'var(--amber)', offline: 'var(--red)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Website Status" href="/infra/websites" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sites.map(site => (
          <div key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>
            <StatusDot color={STATUS_COLOR[site.status] ?? 'var(--text3)'} />
            <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.label ?? site.url}</span>
            {site.response_ms != null && <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{site.response_ms}ms</span>}
            <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[site.status] ?? 'var(--text3)', textTransform: 'capitalize', flexShrink: 0 }}>{site.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:websites-status', label: 'Website Status', description: 'Live status for all monitored websites', icon: 'globe', category: 'infra', module: 'websites', sizeOptions: ['small', 'medium'], defaultSize: 'medium', defaultW: 4, defaultH: 3, minW: 3, minH: 2, supportedFilters: ['refreshInterval'], defaultConfig: { refreshInterval: 60_000 }, component: WebsiteStatusWidget });
