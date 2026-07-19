'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listWebsites } from '@/modules/shared/lib/websites';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function SslExpiryWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'websites-ssl'],
    queryFn: async () => listWebsites(await getToken()),
    staleTime: 3_600_000,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const now = new Date();
  const sites = [...(data?.data ?? [])]
    .filter(s => s.ssl_expiry_date != null)
    .map(s => ({ ...s, daysLeft: Math.floor((new Date(s.ssl_expiry_date!).getTime() - now.getTime()) / 86_400_000) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (sites.length === 0) return <EmptyState href="/infra/websites" label="No SSL expiry data" icon="lock" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="SSL Expiry" href="/infra/websites" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sites.map(site => {
          const color = site.daysLeft < 7 ? 'var(--red)' : site.daysLeft < 30 ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.label ?? site.url}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {site.daysLeft < 0 ? 'EXPIRED' : `${site.daysLeft}d`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'infra:websites-ssl', label: 'SSL Expiry', description: 'Days until SSL cert expiry per website — red < 7 days', icon: 'lock', category: 'infra', module: 'websites', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: [], defaultConfig: {}, component: SslExpiryWidget });
