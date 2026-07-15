'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { WidgetSkeleton, WidgetError, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

type ActivityRow = {
  id: string;
  type: string;
  body: string | null;
  user_id: string | null;
  created_at: string;
  meta: unknown;
};

function RecentChangesWidget({ config }: { config: WidgetConfig }) {
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'recent-changes'],
    queryFn: async () =>
      apiFetch<{ data: ActivityRow[] }>(
        '/api/activity?limit=20',
        { token: await getToken() },
      ),
    staleTime: 30_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const changes = (data?.data ?? []).filter(a => a.type === 'deal_change');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Recent Changes" href="/activity" />
      {changes.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>No recent deal changes</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {changes.map(a => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 4px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>↕</span>
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.body ?? 'Deal stage changed'}
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
  id: 'insights:recent-changes',
  label: 'Recent Changes',
  description: 'Recent deal stage changes from the activity feed',
  icon: 'activity',
  category: 'insights',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: ['refreshInterval'],
  defaultConfig: { refreshInterval: 60_000 },
  component: RecentChangesWidget,
});
