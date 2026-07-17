'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { apiFetch } from '@/modules/shared/lib/api';
import type { StageData } from '@/modules/analytics/lib/analytics';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

const STAGE_OPTIONS: FilterOption[] = [
  { label: 'Lead', value: 'lead' },
  { label: 'Qualifying', value: 'qualifying' },
  { label: 'Proposal', value: 'proposal' },
  { label: 'Closing', value: 'closing' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
];

const STAGE_COLORS: Record<string, string> = {
  lead: 'var(--text3)',
  qualifying: 'var(--blue)',
  proposal: 'var(--amber)',
  closing: 'var(--green)',
  won: 'var(--green)',
  lost: 'var(--red)',
};

function stageColor(name: string, fallback: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(STAGE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return fallback || 'var(--text3)';
}

function RecentOpportunitiesWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const _limit = config.limit ?? 6;
  const owner = config.filters?.['owner'] ?? '';
  const stage = config.filters?.['stage'] ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'recent-opportunities', owner, stage],
    queryFn: async () => {
      const token = await getToken();
      const qs = [
        owner ? `&owner_id=${owner}` : '',
        stage ? `&stage=${stage}` : '',
      ].join('');
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
  if (stages.length === 0) return <EmptyState href="/crm/pipeline" label="Create your first deal" icon="pipeline" />;

  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Pipeline by Stage" href="/crm/pipeline" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {stages.map(s => (
          <div key={s.stage_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.stage_name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
              {fmt(s.value)}
            </span>
            <span style={{
              fontSize: 10,
              color: stageColor(s.stage_name ?? '', s.stage_color ?? 'var(--text3)'),
              background: 'var(--surface2)',
              padding: '1px 6px',
              borderRadius: 6,
              flexShrink: 0,
              textTransform: 'capitalize',
            }}>
              {s.count} deal{s.count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:pipeline-recent',
  label: 'Recent Opportunities',
  description: 'Pipeline breakdown by stage with deal count and value',
  icon: 'pipeline',
  category: 'sales',
  module: 'pipeline',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  filterDefs: [
    { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
    { key: 'stage', label: 'Stage', type: 'pills', options: STAGE_OPTIONS },
  ],
  supportedFilters: ['limit'],
  defaultConfig: { limit: 6 },
  component: RecentOpportunitiesWidget,
});
