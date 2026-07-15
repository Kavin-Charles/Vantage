'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { pmApi } from '@/modules/projects/lib/api';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function DelayedProjectsWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'delayed-projects'],
    queryFn: async () => pmApi.listProjects(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('projects'),
  });

  if (!isEnabled('projects')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const now = new Date();
  const delayed = (data?.data ?? []).filter(p => p.end_date && new Date(p.end_date) < now && p.status !== 'done');
  if (delayed.length === 0) return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
      No delayed projects
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label={`Delayed Projects (${delayed.length})`} href="/projects" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {delayed.map(p => {
          const daysLate = Math.floor((now.getTime() - new Date(p.end_date!).getTime()) / 86_400_000);
          return (
            <button key={p.id} onClick={() => router.push(`/projects/${p.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontSize: 10, color: 'var(--red)', background: 'var(--red-bg)', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>{daysLate}d late</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'projects:delayed', label: 'Delayed Projects', description: 'Projects past their end date that are not yet complete', icon: 'warning', category: 'projects', sizeOptions: ['small', 'medium'], defaultSize: 'small', defaultW: 3, defaultH: 3, minW: 2, minH: 2, supportedFilters: [], defaultConfig: {}, component: DelayedProjectsWidget });

export { };
