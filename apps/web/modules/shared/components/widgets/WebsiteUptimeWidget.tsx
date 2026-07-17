'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listWebsites } from '@/modules/shared/lib/websites';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function WebsiteUptimeWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'websites-uptime'],
    queryFn: async () => listWebsites(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const sites = [...(data?.data ?? [])].filter(s => s.uptime_pct_30d != null).sort((a, b) => (a.uptime_pct_30d ?? 100) - (b.uptime_pct_30d ?? 100));
  if (sites.length === 0) return <EmptyState href="/infra/websites" label="No uptime data yet" icon="globe" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="30d Uptime" href="/infra/websites" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sites.map(site => {
          const pct = site.uptime_pct_30d ?? 0;
          const color = pct < 95 ? 'var(--red)' : pct < 99 ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--text)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{site.label ?? site.url}</span>
              <MiniBar value={pct} max={100} color={color} />
              <span style={{ fontSize: 11, fontWeight: 600, color, width: 44, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(2)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:websites-uptime', label: '30d Uptime', description: 'Uptime percentage over 30 days per website, worst first', icon: 'globe', category: 'infra', module: 'websites', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: [], defaultConfig: {}, component: WebsiteUptimeWidget });
