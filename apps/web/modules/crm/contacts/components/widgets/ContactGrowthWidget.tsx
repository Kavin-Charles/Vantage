'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { CHART_COLORS } from '@/modules/shared/lib/chart-colors';

function buildWeekBuckets(contacts: { created_at: Date | string }[], days: number) {
  const buckets: Record<string, number> = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets[key] = 0;
  }
  const cutoff = new Date(now - days * 86_400_000);
  contacts.forEach(c => {
    const d = new Date(c.created_at);
    if (d < cutoff) return;
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (key in buckets) buckets[key]++;
  });
  return Object.entries(buckets).map(([label, count]) => ({ label, count }));
}

function ContactGrowthWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const days = config.timeRange === '30d' ? 30 : config.timeRange === '1d' ? 7 : 14;
  const chartType = config.chartType ?? 'area';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'contact-growth', days],
    queryFn: async () => listContacts(await getToken(), { limit: '500' }),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = data?.data ?? [];
  if (contacts.length === 0) return <EmptyState href="/crm/contacts/new" label="Add your first contact" icon="users" />;

  const chartData = buildWeekBuckets(contacts, days);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Contact Growth" href="/crm/contacts" />
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
              <Bar dataKey="count" name="New contacts" fill={CHART_COLORS.green} radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
              <Area type="monotone" dataKey="count" name="New contacts" stroke={CHART_COLORS.green} fill={CHART_COLORS.green} fillOpacity={0.15} strokeWidth={2} dot={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:contacts-growth',
  label: 'Contact Growth',
  description: 'New contacts added over time — spot acquisition trends',
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
  component: ContactGrowthWidget,
});
