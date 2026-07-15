'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { apiFetch } from '@/modules/shared/lib/api';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Alert } from '@vencore/types';

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--red)',
  warning: 'var(--amber)',
  info: 'var(--blue)',
};

function ServerAlertsWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'server-alerts'],
    queryFn: async () =>
      apiFetch<{ data: Alert[]; error: null }>(
        '/api/alerts?resolved=false&resource_type=server&limit=10',
        { token: await getToken() },
      ),
    staleTime: 30_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const alerts = data?.data ?? [];
  if (alerts.length === 0) return <EmptyState href="/alerts" label="No server alerts" icon="check" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Server Alerts" href="/alerts" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {alerts.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 7, background: 'var(--surface2)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[a.severity], textTransform: 'uppercase', flexShrink: 0 }}>{a.severity}</span>
            <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{relativeTime(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'infra:servers-alerts',
  label: 'Server Alerts',
  description: 'Unresolved alerts scoped to server resources',
  icon: 'warning',
  category: 'infra',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['refreshInterval'],
  defaultConfig: { refreshInterval: 60_000 },
  component: ServerAlertsWidget,
});
