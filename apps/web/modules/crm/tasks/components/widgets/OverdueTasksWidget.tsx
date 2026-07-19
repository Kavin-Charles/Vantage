'use client';

import { useUnifiedTasks } from '../../lib/useUnifiedTasks';
import { useToggleTask } from '../../lib/taskMutations';
import { WidgetSkeleton, WidgetError } from '@/modules/shared/components/ui/WidgetHelpers';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { apiFetch } from '@/modules/shared/lib/api';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';
import type { UnifiedTask } from '../../lib/types';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

function OverdueTasksWidget({ config }: { config: WidgetConfig }) {
  const owner = config.filters?.['owner'] ?? '';
  const { data, isLoading, isError, refetch } = useUnifiedTasks({ status: 'todo', owner_id: owner || undefined });
  const toggleMut = useToggleTask();
  const limit = config.limit ?? 10;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  const tasks: UnifiedTask[] = (data?.data?.overdue ?? []).slice(0, limit);
  if (tasks.length === 0) return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: 'var(--text3)' }}>
      <Icon name="check" size={20} />
      <span style={{ fontSize: 13 }}>No overdue tasks</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Overdue — {tasks.length}</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tasks.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => toggleMut.mutate(t)}
              style={{ width: 15, height: 15, borderRadius: 5, border: '1.5px solid var(--red)', background: 'transparent', cursor: 'pointer', flexShrink: 0, padding: 0 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            {t.due_date && (
              <span style={{ fontSize: 10, color: 'var(--red)', background: 'var(--red-bg)', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>
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
  id: 'projects:tasks-overdue',
  label: 'Overdue Tasks',
  description: 'Tasks past their due date — clear blockers fast',
  icon: 'warning',
  category: 'projects',
  module: 'tasks',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: ['limit'],
  filterDefs: [
    { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
  ],
  defaultConfig: { limit: 10 },
  component: OverdueTasksWidget,
});
