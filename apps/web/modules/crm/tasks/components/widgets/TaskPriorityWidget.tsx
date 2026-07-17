'use client';

import { useUnifiedTasks } from '../../lib/useUnifiedTasks';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { UnifiedTask } from '../../lib/types';
import { PRIORITY_COLOR } from '../../lib/types';

function TaskPriorityWidget({ config: _config }: { config: WidgetConfig }) {
  const { data, isLoading, isError, refetch } = useUnifiedTasks({ status: 'todo' });
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  const tasks: UnifiedTask[] = [
    ...(data?.data?.overdue ?? []),
    ...(data?.data?.today ?? []),
    ...(data?.data?.this_week ?? []),
    ...(data?.data?.later ?? []),
    ...(data?.data?.no_due_date ?? []),
  ];
  if (tasks.length === 0) return <EmptyState href="/crm/tasks" label="No open tasks" icon="tasks" />;
  const priorities = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
  const counts = priorities.reduce<Record<string, number>>((acc, p) => {
    acc[p] = tasks.filter(t => t.priority === p).length;
    return acc;
  }, {});
  const max = Math.max(...Object.values(counts), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Priority Breakdown" href="/crm/tasks" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {priorities.map(p => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: PRIORITY_COLOR[p] ?? 'var(--text2)', width: 60, flexShrink: 0 }}>{p}</span>
            <MiniBar value={counts[p] ?? 0} max={max} color={PRIORITY_COLOR[p] ?? 'var(--text3)'} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'right', flexShrink: 0 }}>{counts[p]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'projects:tasks-priority',
  label: 'Priority Breakdown',
  description: 'Open tasks split by HIGH / MEDIUM / LOW / NONE priority',
  icon: 'chart-bar',
  category: 'projects',
  module: 'tasks',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: TaskPriorityWidget,
});
