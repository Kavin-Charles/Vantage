'use client'

import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry'
import { useUnifiedTasks } from '../lib/useUnifiedTasks'
import type { UnifiedTask } from '../lib/types'
import { Icon } from '@/modules/shared/components/ui/Icon'

function TasksWidgetInner() {
  const { data, isLoading } = useUnifiedTasks({ status: 'todo' })

  const overdue = data?.data?.overdue ?? []
  const today = data?.data?.today ?? []
  const total = data?.total ?? 0
  const topTasks = [...overdue, ...today].slice(0, 5)

  if (isLoading) {
    return <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
  }

  return (
    <div style={{ padding: '12px 16px', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: 'Overdue', count: overdue.length, color: 'var(--red)', bg: 'var(--red-bg)' },
          { label: 'Due Today', count: today.length, color: 'var(--amber)', bg: 'var(--amber-bg)' },
          { label: 'Open', count: total, color: 'var(--text2)', bg: 'var(--surface2)' },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1, padding: '8px 10px', borderRadius: 8,
            background: stat.bg, textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: stat.color, fontFamily: 'Instrument Serif, serif' }}>
              {stat.count}
            </div>
            <div style={{ fontSize: 10, color: stat.color, fontWeight: 600, letterSpacing: '0.04em' }}>
              {stat.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {topTasks.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', paddingTop: 12 }}>
            No urgent tasks
          </div>
        ) : (
          topTasks.map((task: UnifiedTask) => (
            <div key={task.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: overdue.some(t => t.id === task.id) ? 'var(--red)' : 'var(--amber)',
              }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                {task.title}
              </span>
              {task.due_date && (
                <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>
                  {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <a
        href="/tasks"
        style={{
          fontSize: 11, color: 'var(--text3)', textDecoration: 'none', display: 'flex',
          alignItems: 'center', gap: 4,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}
      >
        <Icon name="external-link" size={11} />
        View all tasks
      </a>
    </div>
  )
}

registerDashboardWidget({
  id: 'tasks-overview',
  label: 'Tasks Overview',
  description: 'Overdue, due today, and open task counts with a quick task list',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  component: TasksWidgetInner,
})

export { TasksWidgetInner as TasksWidget }
