'use client';

import { useUnifiedTasks } from '../../lib/useUnifiedTasks';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { UnifiedTask } from '../../lib/types';

function TeamTaskProgressWidget({ config: _config }: { config: WidgetConfig }) {
  const { data, isLoading, isError, refetch } = useUnifiedTasks({ status: 'todo' });
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  const tasks: UnifiedTask[] = [
    ...(data?.data?.overdue ?? []),
    ...(data?.data?.today ?? []),
    ...(data?.data?.this_week ?? []),
    ...(data?.data?.later ?? []),
  ];
  if (tasks.length === 0) return <EmptyState href="/crm/tasks" label="No open tasks" icon="tasks" />;
  const byAssignee: Record<string, number> = {};
  tasks.forEach(t => {
    const k = t.assignee_name ?? 'Unassigned';
    byAssignee[k] = (byAssignee[k] ?? 0) + 1;
  });
  const sorted = Object.entries(byAssignee).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Team Task Progress" href="/crm/tasks" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {sorted.slice(0, 6).map(([name, count]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{name}</span>
            <MiniBar value={count} max={max} color="var(--blue)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'projects:tasks-team-progress',
  label: 'Team Task Progress',
  description: 'Open task count per team member',
  icon: 'users',
  category: 'projects',
  module: 'tasks',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: TeamTaskProgressWidget,
});
