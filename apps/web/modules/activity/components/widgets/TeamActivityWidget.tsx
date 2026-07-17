'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { WidgetSkeleton, WidgetError, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

type ActivityRow = {
  id: string;
  type: string;
  body: string | null;
  user_id: string | null;
  created_at: string;
  meta: unknown;
};

const TYPE_EMOJI: Record<string, string> = {
  email: '✉',
  call: '📞',
  note: '📝',
  meeting: '📅',
  deal_change: '↕',
  infra_alert: '⚠',
};

function TeamActivityWidget({ config }: { config: WidgetConfig }) {
  const getToken = useApiToken();
  const limit = config.limit ?? 10;
  const userId = config.filters?.['user'] ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'team-activity', limit, userId],
    queryFn: async () => {
      const token = await getToken();
      const qs = new URLSearchParams({
        limit: String(limit),
        ...(userId ? { user_id: userId } : {}),
      });
      return apiFetch<{ data: ActivityRow[] }>(`/api/activity?${qs}`, { token });
    },
    staleTime: 60_000,
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const activities = data?.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Team Activity Feed" href="/activity" />
      {activities.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>No recent activity</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {activities.map(a => {
            const initial =
              (a.meta as { user_name?: string } | null)?.user_name?.charAt(0).toUpperCase() ?? '?';
            return (
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
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--surface2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text2)',
                    flexShrink: 0,
                  }}
                >
                  {initial}
                </div>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{TYPE_EMOJI[a.type] ?? '·'}</span>
                <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.body ?? a.type}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                  {relativeTime(a.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

registerDashboardWidget({
  id: 'insights:team-activity',
  label: 'Team Activity Feed',
  description: 'Unified activity feed with team member avatars',
  icon: 'activity',
  category: 'insights',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  module: 'activity',
  supportedFilters: ['limit', 'refreshInterval'],
  defaultConfig: { limit: 10, refreshInterval: 60_000 },
  filterDefs: [
    { key: 'user', label: 'Team Member', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All members' },
  ],
  component: TeamActivityWidget,
});
