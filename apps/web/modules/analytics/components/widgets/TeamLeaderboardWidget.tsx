'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { getTeam } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { CHART_COLORS } from '@/modules/shared/lib/chart-colors';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Period } from '@/modules/analytics/lib/analytics';

function fmt(v: number) { return v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`; }

function TeamLeaderboardWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const period = (config.filters?.period as Period) ?? '30d';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'team-leaderboard', period],
    queryFn: async () => getTeam(await getToken(), period),
    staleTime: 300_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const reps = [...(data?.data?.reps ?? [])].sort((a, b) => b.revenue - a.revenue);
  if (reps.length === 0) return <EmptyState href="/analytics" label="No rep data yet" icon="users" />;

  const max = reps[0]?.revenue ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Team Leaderboard" href="/analytics" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {reps.map((rep, i) => (
          <div key={rep.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', width: 16, textAlign: 'right', flexShrink: 0 }}>#{i + 1}</span>
            <span style={{ fontSize: 12, color: 'var(--text)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{rep.name}</span>
            <MiniBar value={rep.revenue} max={max} color={CHART_COLORS.green} />
            <span style={{ fontSize: 11, color: 'var(--text2)', width: 48, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(rep.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'insights:team-leaderboard', label: 'Team Leaderboard', description: 'Sales reps ranked by closed revenue', icon: 'users', category: 'insights', module: 'analytics', sizeOptions: ['medium', 'large'], defaultSize: 'medium', defaultW: 4, defaultH: 4, minW: 3, minH: 3, supportedFilters: [], defaultConfig: { filters: { period: '30d' } }, component: TeamLeaderboardWidget });
