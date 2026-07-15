'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { pmApi } from '@/modules/projects/lib/api';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function ActiveProjectsWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 8;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'active-projects'],
    queryFn: async () => pmApi.listProjects(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('projects'),
  });

  if (!isEnabled('projects')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const projects = (data?.data ?? []).filter(p => p.status !== 'done' && p.status !== 'archived').slice(0, limit);
  if (projects.length === 0) return <EmptyState href="/projects/new" label="Create your first project" icon="projects" />;

  const HEALTH_COLOR: Record<string, string> = { on_track: 'var(--green)', at_risk: 'var(--amber)', off_track: 'var(--red)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Active Projects" href="/projects" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map(p => (
          <button key={p.id} onClick={() => router.push(`/projects/${p.id}`)}
            style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px', background: 'var(--surface2)', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {p.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: HEALTH_COLOR[p.health] ?? 'var(--text3)' }}>{Math.round(p.progress)}%</span>
            </div>
            <MiniBar value={p.progress} max={100} color={HEALTH_COLOR[p.health] ?? 'var(--green)'} />
          </button>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({ id: 'projects:active', label: 'Active Projects', description: 'In-progress projects with health and completion percentage', icon: 'projects', category: 'projects', sizeOptions: ['medium', 'large'], defaultSize: 'medium', defaultW: 4, defaultH: 4, minW: 3, minH: 3, supportedFilters: ['limit'], defaultConfig: { limit: 8 }, component: ActiveProjectsWidget });
