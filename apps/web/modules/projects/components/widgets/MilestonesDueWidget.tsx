'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { pmApi } from '@/modules/projects/lib/api';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function MilestonesDueWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'milestones-due'],
    queryFn: async () => pmApi.getWidgetStats(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('projects'),
  });

  if (!isEnabled('projects')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const milestones = data?.data?.upcoming_milestones ?? [];
  if (milestones.length === 0) return <EmptyState href="/projects" label="No upcoming milestones" icon="flag" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Milestones Due" href="/projects" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {milestones.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
            <span style={{ fontSize: 10, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>
              {new Date(m.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'projects:milestones-due', label: 'Milestones Due', description: 'Upcoming project milestones from widget stats', icon: 'flag', category: 'projects', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: [], defaultConfig: {}, component: MilestonesDueWidget });

export { };
