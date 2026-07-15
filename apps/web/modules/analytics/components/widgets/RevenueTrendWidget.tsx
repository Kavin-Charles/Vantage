'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { getRevenue } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { CHART_COLORS } from '@/modules/shared/lib/chart-colors';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Period } from '@/modules/analytics/lib/analytics';
import { ResponsiveContainer, AreaChart, XAxis, YAxis, Tooltip, Area } from 'recharts';

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function RevenueTrendWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const period = (config.filters?.period as Period) ?? '30d';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'revenue-trend', period],
    queryFn: async () => getRevenue(await getToken(), period),
    staleTime: 300_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const points = data?.data?.series ?? [];
  if (points.length === 0) return <EmptyState href="/analytics" label="No revenue data yet" icon="chart" />;

  const total = data?.data?.total_revenue ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Revenue Trend" href="/analytics" />
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>{fmt(total)}</span>
        <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>last {period}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.green} stopOpacity={0.2} />
                <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)' }} />
            <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.green} fill="url(#revGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'insights:revenue-trend', label: 'Revenue Trend', description: 'Total revenue with area chart, configurable period', icon: 'chart', category: 'insights', sizeOptions: ['medium', 'large', 'wide'], defaultSize: 'medium', defaultW: 4, defaultH: 4, minW: 3, minH: 3, supportedFilters: [], defaultConfig: { filters: { period: '30d' } }, component: RevenueTrendWidget });
