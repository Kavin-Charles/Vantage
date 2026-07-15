'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { getRevenue, getPipeline } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, Stat } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Period } from '@/modules/analytics/lib/analytics';

function fmt(v: number) { return v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`; }

function KpiCardsWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const period = (config.filters?.period as Period) ?? '30d';

  const revQ = useQuery({
    queryKey: ['widget', 'kpi-revenue', period],
    queryFn: async () => getRevenue(await getToken(), period),
    staleTime: 300_000,
    enabled: isEnabled('crm'),
  });

  const pipeQ = useQuery({
    queryKey: ['widget', 'kpi-pipeline', period],
    queryFn: async () => getPipeline(await getToken(), period),
    staleTime: 300_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (revQ.isLoading || pipeQ.isLoading) return <WidgetSkeleton />;
  if (revQ.isError || pipeQ.isError) return <WidgetError onRetry={() => { void revQ.refetch(); void pipeQ.refetch(); }} />;

  const revenue = revQ.data?.data;
  const pipeline = pipeQ.data?.data;
  const openDeals = (pipeline?.stages ?? []).filter(s => !['won', 'lost'].includes(s.stage_name)).reduce((a, s) => a + s.count, 0);
  const openValue = (pipeline?.stages ?? []).filter(s => !['won', 'lost'].includes(s.stage_name)).reduce((a, s) => a + s.value, 0);
  const winRate = revenue?.win_rate ?? 0;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, height: '100%', alignContent: 'center', alignItems: 'center' }}>
      <Stat label="Revenue" value={fmt(revenue?.total_revenue ?? 0)} color="var(--green)" />
      <Stat label="Win Rate" value={`${Math.round(winRate)}%`} color={winRate >= 50 ? 'var(--green)' : 'var(--amber)'} />
      <Stat label="Open Deals" value={openDeals} color="var(--blue)" />
      <Stat label="Pipeline Value" value={fmt(openValue)} color="var(--text)" />
    </div>
  );
}

registerDashboardWidget({ id: 'insights:kpi-cards', label: 'KPI Cards', description: 'Revenue, win rate, open deals, pipeline value at a glance', icon: 'chart', category: 'insights', sizeOptions: ['wide', 'full'], defaultSize: 'wide', defaultW: 8, defaultH: 2, minW: 4, minH: 2, supportedFilters: [], defaultConfig: { filters: { period: '30d' } }, component: KpiCardsWidget });
