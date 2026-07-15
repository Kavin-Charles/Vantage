'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { getPipeline } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { CHART_COLORS, STAGE_COLORS } from '@/modules/shared/lib/chart-colors';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Period } from '@/modules/analytics/lib/analytics';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, Cell } from 'recharts';

function PipelineByStageWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const period = (config.filters?.period as Period) ?? '30d';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'pipeline-by-stage', period],
    queryFn: async () => getPipeline(await getToken(), period),
    staleTime: 300_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const stages = data?.data?.stages ?? [];
  if (stages.length === 0) return <EmptyState href="/crm/pipeline" label="No pipeline data" icon="chart" />;

  const chartData = stages.map(s => ({ name: s.stage_name, count: s.count, value: s.value }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Pipeline by Stage" href="/crm/pipeline" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} />
            <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.text3 }} />
            <Tooltip contentStyle={{ fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'insights:pipeline-by-stage', label: 'Pipeline by Stage', description: 'Deal count per pipeline stage as a bar chart', icon: 'chart', category: 'insights', sizeOptions: ['medium', 'large'], defaultSize: 'medium', defaultW: 4, defaultH: 4, minW: 3, minH: 3, supportedFilters: [], defaultConfig: { filters: { period: '30d' } }, component: PipelineByStageWidget });
