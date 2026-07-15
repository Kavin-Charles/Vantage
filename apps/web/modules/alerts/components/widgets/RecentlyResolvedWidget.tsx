'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { WidgetSkeleton, WidgetError, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

type AlertRow = {
  id: string;
  severity: string;
  message: string;
  resource_type: string;
  acknowledged: boolean;
  resolved: boolean;
  created_at: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--red)',
  warning: 'var(--amber)',
  info: 'var(--blue)',
};

function RecentlyResolvedWidget({ config }: { config: WidgetConfig }) {
  const getToken = useApiToken();
  const limit = config.limit ?? 8;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'alerts-resolved', limit],
    queryFn: async () =>
      apiFetch<{ data: AlertRow[]; error: null }>(
        `/api/alerts?resolved=true&limit=${limit}`,
        { token: await getToken() },
      ),
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const alerts = data?.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Recently Resolved" href="/alerts" />
      {alerts.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>No resolved alerts</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {alerts.map(a => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderRadius: 7,
                background: 'var(--surface2)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: SEV_COLOR[a.severity] ?? 'var(--text3)',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {a.severity}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.message}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                {relativeTime(a.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

registerDashboardWidget({
  id: 'insights:alerts-resolved',
  label: 'Recently Resolved',
  description: 'Recently resolved alerts across all resource types',
  icon: 'check',
  category: 'insights',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 8 },
  component: RecentlyResolvedWidget,
});
