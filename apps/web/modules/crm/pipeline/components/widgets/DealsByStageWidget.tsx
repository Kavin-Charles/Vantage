'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { apiFetch } from '@/modules/shared/lib/api';
import type { StageData } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

function DealsByStageWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const owner = config.filters?.['owner'] ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'deals-by-stage', owner],
    queryFn: async () => {
      const token = await getToken();
      const qs = owner ? `&owner_id=${owner}` : '';
      return apiFetch<{ data: { stages: StageData[] }; error: null }>(
        `/api/analytics/pipeline?period=30d${qs}`,
        { token },
      );
    },
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const stages = data?.data?.stages ?? [];
  if (stages.length === 0) return <EmptyState href="/crm/pipeline" label="Create your first pipeline" icon="pipeline" />;

  const maxCount = Math.max(...stages.map(s => s.count), 1);
  const totalValue = stages.reduce((sum, s) => sum + s.value, 0);

  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Deals by Stage" href="/crm/pipeline" />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
        Total pipeline: <strong style={{ color: 'var(--text)' }}>{fmt(totalValue)}</strong>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {stages.map(s => (
          <div key={s.stage_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.stage_name}</span>
            <MiniBar value={s.count} max={maxCount} color={s.stage_color || 'var(--blue)'} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'right', flexShrink: 0 }}>{s.count}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', width: 40, textAlign: 'right', flexShrink: 0 }}>{fmt(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:pipeline-deals-by-stage',
  label: 'Deals by Stage',
  description: 'Count and value of deals in each pipeline stage',
  icon: 'pipeline',
  category: 'sales',
  module: 'pipeline',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  filterDefs: [
    { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
  ],
  supportedFilters: [],
  defaultConfig: {},
  component: DealsByStageWidget,
});
