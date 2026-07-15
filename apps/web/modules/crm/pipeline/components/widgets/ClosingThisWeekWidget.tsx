'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { getPipeline } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function ClosingThisWeekWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'closing-this-week'],
    queryFn: async () => getPipeline(await getToken(), '30d'),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const stages = data?.data?.stages ?? [];
  if (stages.length === 0) return <EmptyState href="/crm/pipeline" label="Create your first pipeline" icon="pipeline" />;

  // Show active (non-won, non-lost) stages as "in-progress" opportunities
  const activeStages = stages.filter(s => {
    const n = (s.stage_name ?? '').toLowerCase();
    return !n.includes('won') && !n.includes('lost');
  });

  const totalActive = activeStages.reduce((sum, s) => sum + s.count, 0);
  const totalValue = activeStages.reduce((sum, s) => sum + s.value, 0);
  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

  if (totalActive === 0) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No active deals in pipeline
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label={`Active Pipeline (${totalActive})`} href="/crm/pipeline" />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
        {totalActive} deal{totalActive !== 1 ? 's' : ''} · <strong style={{ color: 'var(--text)' }}>{fmt(totalValue)}</strong> total value
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {activeStages.map(s => (
          <div
            key={s.stage_id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--border)' }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%', background: s.stage_color || 'var(--blue)',
                flexShrink: 0, display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.stage_name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', flexShrink: 0 }}>
              {fmt(s.value)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>
              {s.count} deal{s.count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:pipeline-closing-week',
  label: 'Closing This Week',
  description: 'Active pipeline stages with deal counts and values',
  icon: 'calendar',
  category: 'sales',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: ClosingThisWeekWidget,
});
