'use client'

import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry'
import { useUnifiedTasks } from '../lib/useUnifiedTasks'
import { useToggleTask } from '../lib/taskMutations'
import type { UnifiedTask } from '../lib/types'
import { PRIORITY_COLOR, PRIORITY_BG, SOURCE_COLOR } from '../lib/types'
import { Icon } from '@/modules/shared/components/ui/Icon'

function StatTile({ icon, label, count, color, bg }: { icon: string; label: string; count: number; color: string; bg: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 9px', borderRadius: 8, background: bg, minWidth: 0,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 7, background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={13} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>
          {count}
        </div>
        <div style={{ fontSize: 9, color, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {label}
        </div>
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange() }}
      style={{
        width: 15, height: 15, borderRadius: 5, flexShrink: 0,
        border: '1.5px solid ' + (checked ? 'var(--text)' : 'var(--border)'),
        background: checked ? 'var(--text)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, transition: 'all 0.12s',
      }}
    >
      {checked && <Icon name="check" size={9} color="#fff" strokeWidth={3} />}
    </button>
  )
}

function WidgetTaskRow({ task, isOverdue, onToggle }: { task: UnifiedTask; isOverdue: boolean; onToggle: () => void }) {
  const done = task.status === 'done'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '6px 2px', borderBottom: '1px solid var(--border)', fontSize: 12,
    }}>
      <Checkbox checked={done} onChange={onToggle} />

      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: SOURCE_COLOR[task.source],
      }} title={task.source} />

      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: done ? 'var(--text3)' : 'var(--text)',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>

      {task.priority !== 'NONE' && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, flexShrink: 0,
          color: PRIORITY_COLOR[task.priority], background: PRIORITY_BG[task.priority],
          letterSpacing: '0.03em',
        }}>
          {task.priority}
        </span>
      )}

      {task.assignee_name && (
        <span style={{
          width: 17, height: 17, borderRadius: '50%', background: 'var(--surface2)',
          border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'var(--text2)', flexShrink: 0,
        }} title={task.assignee_name}>
          {task.assignee_name[0]?.toUpperCase()}
        </span>
      )}

      {task.due_date && (
        <span style={{
          fontSize: 10, flexShrink: 0, fontWeight: isOverdue ? 600 : 400,
          color: isOverdue ? 'var(--red)' : 'var(--text3)',
          background: isOverdue ? 'var(--red-bg)' : 'transparent',
          padding: isOverdue ? '1px 6px' : undefined,
          borderRadius: isOverdue ? 999 : undefined,
        }}>
          {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  )
}

function TasksWidgetInner() {
  const { data, isLoading } = useUnifiedTasks({ status: 'todo' })
  const toggleMut = useToggleTask()

  const overdue = data?.data?.overdue ?? []
  const today = data?.data?.today ?? []
  const thisWeek = data?.data?.this_week ?? []
  const later = data?.data?.later ?? []
  const noDueDate = data?.data?.no_due_date ?? []
  const total = data?.total ?? 0

  const urgentTasks = [...overdue, ...today, ...thisWeek]
  const showingCurrent = urgentTasks.length === 0
  const topTasks = (showingCurrent ? [...later, ...noDueDate] : urgentTasks).slice(0, 6)
  const remaining = Math.max(0, total - topTasks.length)

  if (isLoading) {
    return <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
  }

  return (
    <div style={{ padding: '10px 14px', height: '100%', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <StatTile icon="warning" label="Overdue" count={overdue.length} color="var(--red)" bg="var(--red-bg)" />
        <StatTile icon="clock" label="Today" count={today.length} color="var(--amber)" bg="var(--amber-bg)" />
        <StatTile icon="tasks" label="Open" count={total} color="var(--text2)" bg="var(--surface2)" />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {topTasks.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text3)' }}>
            <Icon name="check" size={20} />
            <span style={{ fontSize: 12 }}>No open tasks</span>
          </div>
        ) : (
          <>
            {showingCurrent && (
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 2px 4px' }}>
                No urgent tasks — showing current
              </div>
            )}
            {topTasks.map((task: UnifiedTask) => (
              <WidgetTaskRow
                key={task.id}
                task={task}
                isOverdue={overdue.some(t => t.id === task.id)}
                onToggle={() => toggleMut.mutate(task)}
              />
            ))}
            {remaining > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', padding: '5px 2px 0' }}>
                +{remaining} more
              </div>
            )}
          </>
        )}
      </div>

      <a
        href="/tasks"
        style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text3)', textDecoration: 'none', display: 'flex',
          alignItems: 'center', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}
      >
        <Icon name="open" size={11} />
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
