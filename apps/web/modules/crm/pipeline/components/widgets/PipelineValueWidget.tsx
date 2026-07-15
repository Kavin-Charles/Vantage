'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { getPipeline } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState, Stat } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function PipelineValueWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'pipeline-value'],
    queryFn: async () => getPipeline(await getToken(), '30d'),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const stages = data?.data?.stages ?? [];
  if (stages.length === 0) return <EmptyState href="/crm/pipeline" label="Create your first pipeline" icon="pipeline" />;

  const openStages = stages.filter(s => !['won', 'lost'].includes(s.stage_name?.toLowerCase() ?? ''));
  const totalValue = openStages.reduce((sum, s) => sum + s.value, 0);
  const totalDeals = openStages.reduce((sum, s) => sum + s.count, 0);
  const fmt = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16, justifyContent: 'center' }}>
      <div>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>{fmt(totalValue)}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Total open pipeline</div>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Open Deals" value={totalDeals} />
        <Stat label="Avg Deal" value={fmt(totalDeals > 0 ? Math.round(totalValue / totalDeals) : 0)} />
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:pipeline-value',
  label: 'Pipeline Value',
  description: 'Total open pipeline value and average deal size',
  icon: 'dollar',
  category: 'sales',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: PipelineValueWidget,
});
