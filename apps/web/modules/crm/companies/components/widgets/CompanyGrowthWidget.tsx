'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listCompanies } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { CHART_COLORS } from '@/modules/shared/lib/chart-colors';

function buildBuckets(items: { created_at: Date | string }[], days: number) {
  const buckets: Record<string, number> = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets[key] = 0;
  }
  const cutoff = new Date(now - days * 86_400_000);
  items.forEach(item => {
    const d = new Date(item.created_at);
    if (d < cutoff) return;
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (key in buckets) buckets[key]++;
  });
  return Object.entries(buckets).map(([label, count]) => ({ label, count }));
}

function CompanyGrowthWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const days = config.timeRange === '30d' ? 30 : 14;
  const chartType = config.chartType ?? 'area';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'company-growth', days],
    queryFn: async () => listCompanies(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  if (!(data?.data?.length)) return <EmptyState href="/crm/companies/new" label="Add your first company" icon="building" />;

  const chartData = buildBuckets(data.data, days);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Company Growth" href="/crm/companies" />
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
              <Bar dataKey="count" name="New companies" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
              <Area type="monotone" dataKey="count" name="New companies" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.15} strokeWidth={2} dot={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:companies-growth',
  label: 'Company Growth',
  description: 'New companies added over time',
  icon: 'trending-up',
  category: 'sales',
  sizeOptions: ['medium', 'large', 'wide'],
  defaultSize: 'wide',
  defaultW: 6,
  defaultH: 3,
  minW: 4,
  minH: 2,
  supportedFilters: ['timeRange', 'chartType'],
  defaultConfig: { timeRange: '7d', chartType: 'area' },
  component: CompanyGrowthWidget,
});
