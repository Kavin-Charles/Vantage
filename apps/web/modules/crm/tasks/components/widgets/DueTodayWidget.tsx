'use client';

import { useUnifiedTasks } from '../../lib/useUnifiedTasks';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import { useToggleTask } from '../../lib/taskMutations';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { UnifiedTask } from '../../lib/types';

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(); }}
      style={{
        width: 15,
        height: 15,
        borderRadius: 5,
        flexShrink: 0,
        border: '1.5px solid ' + (checked ? 'var(--text)' : 'var(--border)'),
        background: checked ? 'var(--text)' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        color: 'var(--surface)',
        fontSize: 9,
        lineHeight: 1,
      }}
    >
      {checked && '✓'}
    </button>
  );
}

function DueTodayWidget({ config: _config }: { config: WidgetConfig }) {
  const { data, isLoading, isError, refetch } = useUnifiedTasks({ status: 'todo' });
  const toggleMut = useToggleTask();
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  const tasks: UnifiedTask[] = data?.data?.today ?? [];
  if (tasks.length === 0) return <EmptyState href="/crm/tasks" label="Nothing due today" icon="check" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Due Today — {tasks.length}</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tasks.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <Checkbox checked={t.status === 'done'} onChange={() => toggleMut.mutate(t)} />
            <span style={{
              fontSize: 12,
              color: t.status === 'done' ? 'var(--text3)' : 'var(--text)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: t.status === 'done' ? 'line-through' : 'none',
            }}>
              {t.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'projects:tasks-due-today',
  label: 'Due Today',
  description: 'Tasks with a due date of today',
  icon: 'calendar',
  category: 'projects',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: DueTodayWidget,
});
