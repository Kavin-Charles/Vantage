'use client';

import { useUnifiedTasks } from '../../lib/useUnifiedTasks';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import { apiFetch } from '@/modules/shared/lib/api';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';
import type { UnifiedTask } from '../../lib/types';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

function UpcomingDeadlinesWidget({ config }: { config: WidgetConfig }) {
  const owner = config.filters?.['owner'] ?? '';
  const { data, isLoading, isError, refetch } = useUnifiedTasks({ status: 'todo', owner_id: owner || undefined });
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  const tasks: UnifiedTask[] = [
    ...(data?.data?.today ?? []),
    ...(data?.data?.this_week ?? []),
  ];
  if (tasks.length === 0) return <EmptyState href="/crm/tasks" label="No upcoming deadlines" icon="calendar" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Upcoming — {tasks.length}</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tasks.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            {t.due_date && (
              <span style={{ fontSize: 10, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>
                {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'projects:tasks-upcoming',
  label: 'Upcoming Deadlines',
  description: 'Tasks due today and this week',
  icon: 'clock',
  category: 'projects',
  module: 'tasks',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  filterDefs: [
    { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
  ],
  defaultConfig: {},
  component: UpcomingDeadlinesWidget,
});
