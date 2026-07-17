'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { apiFetch } from '@/modules/shared/lib/api';
import type { Period, RevenueData } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

function WinRateWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const period: Period = config.timeRange === '30d' ? '30d' : config.timeRange === '1d' ? '30d' : '90d';
  const owner = config.filters?.['owner'] ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'win-rate', period, owner],
    queryFn: async () => {
      const token = await getToken();
      const qs = owner ? `&owner_id=${owner}` : '';
      return apiFetch<{ data: RevenueData; error: null }>(
        `/api/analytics/revenue?period=${period}${qs}`,
        { token },
      );
    },
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const winRate = data?.data?.win_rate;
  if (winRate == null) return <EmptyState href="/analytics" label="No win rate data yet" icon="chart" />;

  const rev = data?.data;
  const pct = Math.round(winRate * 100);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
      <svg width={96} height={96} viewBox="0 0 96 96">
        <circle cx={48} cy={48} r={36} fill="none" strokeWidth={8} style={{ stroke: 'var(--surface2)' }} />
        <circle cx={48} cy={48} r={36} fill="none" strokeWidth={8}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 48 48)" style={{ stroke: pct >= 50 ? 'var(--green)' : 'var(--amber)', transition: 'stroke-dashoffset 0.5s' }} />
        <text x={48} y={53} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--text)" fontFamily="var(--font-display)">{pct}%</text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Win Rate</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{rev?.deals_won ?? 0} deals won</div>
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:pipeline-win-rate',
  label: 'Win Rate',
  description: 'Percentage of deals won vs lost with a visual ring chart',
  icon: 'trophy',
  category: 'sales',
  module: 'pipeline',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  filterDefs: [
    { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
  ],
  supportedFilters: ['timeRange'],
  defaultConfig: { timeRange: '30d' },
  component: WinRateWidget,
});
