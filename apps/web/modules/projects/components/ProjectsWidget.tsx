'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { pmApi, type WidgetStats } from '@/modules/projects/lib/api';
import { WidgetSkeleton, WidgetError, Stat, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';

function MilestoneRow({
  milestone,
  last,
  onOpen,
}: {
  milestone: WidgetStats['upcoming_milestones'][number];
  last: boolean;
  onOpen: () => void;
}) {
  const dueDate = new Date(milestone.due_date);
  const isSoon = dueDate.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000;

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px',
        border: 'none', borderBottom: last ? 'none' : '1px solid var(--border)',
        cursor: 'pointer', borderRadius: 4, background: 'transparent', width: '100%', textAlign: 'left',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: isSoon ? 'var(--amber)' : 'var(--text3)',
      }} />
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {milestone.name}
      </span>
      <span style={{ fontSize: 12, color: isSoon ? 'var(--amber)' : 'var(--text3)', flexShrink: 0, fontWeight: isSoon ? 600 : 400 }}>
        {dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
    </button>
  );
}

export function ProjectsWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'projects'],
    queryFn: async () => pmApi.getWidgetStats(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('projects'),
  });

  if (!isEnabled('projects')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const stats: WidgetStats | undefined = data?.data;

  if (!stats || (stats.active_projects === 0 && stats.upcoming_milestones.length === 0)) {
    return <EmptyState href="/projects/new" label="Create your first project" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Active" value={stats.active_projects} color="var(--text)" />
        <Stat label="At risk" value={stats.at_risk_projects} color={stats.at_risk_projects > 0 ? 'var(--amber)' : 'var(--text)'} />
        <Stat label="Overdue" value={stats.overdue_tasks} color={stats.overdue_tasks > 0 ? 'var(--red)' : 'var(--text)'} />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {stats.upcoming_milestones.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12 }}>
            No milestones due this week
          </div>
        ) : (
          stats.upcoming_milestones.slice(0, 5).map((m, i) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              last={i === Math.min(stats.upcoming_milestones.length, 5) - 1}
              onOpen={() => router.push(`/projects/${m.project_id}/milestones`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
