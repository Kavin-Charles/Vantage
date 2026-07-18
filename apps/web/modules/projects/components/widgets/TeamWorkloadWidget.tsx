'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { pmApi } from '@/modules/projects/lib/api';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, Stat } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function TeamWorkloadWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'team-workload'],
    queryFn: async () => pmApi.getWidgetStats(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('projects'),
  });

  if (!isEnabled('projects')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const stats = data?.data;
  if (!stats) return <EmptyState href="/projects" label="No project data" icon="projects" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16, justifyContent: 'center' }}>
      <WidgetHeader label="Team Workload" href="/projects" />
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Stat label="Active Projects" value={stats.active_projects} color="var(--blue)" />
        <Stat label="At Risk" value={stats.at_risk_projects} color="var(--amber)" />
        <Stat label="Overdue Tasks" value={stats.overdue_tasks} color="var(--red)" />
        <Stat label="Upcoming Milestones" value={stats.upcoming_milestones.length} color="var(--green)" />
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'projects:team-workload', label: 'Team Workload', description: 'Active, at-risk, overdue and milestone summary across all projects', icon: 'users', category: 'projects', module: 'projects', sizeOptions: ['medium', 'wide'], defaultSize: 'medium', defaultW: 6, defaultH: 2, minW: 4, minH: 2, supportedFilters: [], defaultConfig: {}, component: TeamWorkloadWidget });

export { };
