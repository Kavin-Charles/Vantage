'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listActivity } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function ProjectActivityWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const limit = config.limit ?? 10;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'project-activity', limit],
    queryFn: async () => listActivity(await getToken(), { limit }),
    staleTime: 60_000,
    enabled: isEnabled('projects'),
  });

  if (!isEnabled('projects')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const items = data?.data ?? [];
  if (items.length === 0) return <EmptyState href="/projects" label="No recent activity" icon="activity" />;

  const TYPE_LABEL: Record<string, string> = { email: 'E', call: 'C', note: 'N', meeting: 'M', deal_change: 'D', infra_alert: 'A' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Recent Activity" href="/projects" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1, color: 'var(--text3)' }}>{TYPE_LABEL[a.type] ?? '-'}</span>
            <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body ?? a.type}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{relativeTime(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'projects:recent-activity', label: 'Recent Project Activity', description: 'Workspace activity feed focused on project-related events', icon: 'activity', category: 'projects', module: 'projects', sizeOptions: ['medium', 'large'], defaultSize: 'medium', defaultW: 4, defaultH: 4, minW: 3, minH: 3, supportedFilters: ['limit'], defaultConfig: { limit: 10 }, component: ProjectActivityWidget });

export { };
