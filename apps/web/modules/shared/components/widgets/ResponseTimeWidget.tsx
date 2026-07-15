'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listWebsites } from '@/modules/shared/lib/websites';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function ResponseTimeWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'websites-response-time'],
    queryFn: async () => listWebsites(await getToken()),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const sites = [...(data?.data ?? [])].filter(s => s.response_ms != null).sort((a, b) => (b.response_ms ?? 0) - (a.response_ms ?? 0));
  if (sites.length === 0) return <EmptyState href="/infra/websites" label="No response data yet" icon="globe" />;

  const max = sites[0]?.response_ms ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Response Time" href="/infra/websites" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sites.map(site => {
          const ms = site.response_ms ?? 0;
          const color = ms > 1000 ? 'var(--red)' : ms > 500 ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--text)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{site.label ?? site.url}</span>
              <MiniBar value={ms} max={max} color={color} />
              <span style={{ fontSize: 11, fontWeight: 600, color, width: 48, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ms}ms</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:websites-response-time', label: 'Response Time', description: 'Response time per website, slowest first', icon: 'clock', category: 'infra', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: ['refreshInterval'], defaultConfig: { refreshInterval: 60_000 }, component: ResponseTimeWidget });
