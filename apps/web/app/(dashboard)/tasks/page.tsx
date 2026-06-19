'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/modules/shared/components/Topbar'
import { Button } from '@/modules/shared/components/ui/Button'
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu'
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog'
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard'
import { useAuth } from '@/modules/shared/lib/AuthContext'
import { useUnifiedTasks } from '@/modules/tasks/lib/useUnifiedTasks'
import { useToggleTask, useEditTaskTitle, useDeleteTask, useBulkToggleTasks, useBulkDeleteTasks } from '@/modules/tasks/lib/taskMutations'
import { TaskGroup } from '@/modules/tasks/components/TaskGroup'
import { TaskFilterBar } from '@/modules/tasks/components/TaskFilterBar'
import { BulkActionBar } from '@/modules/tasks/components/BulkActionBar'
import { TaskDetailPanel } from '@/modules/tasks/components/TaskDetailPanel'
import { AddTaskModal } from '@/modules/tasks/components/AddTaskModal'
import type { UnifiedTask, UnifiedTasksFilters, DueBucket } from '@/modules/tasks/lib/types'
import { BUCKET_LABELS, BUCKET_ORDER } from '@/modules/tasks/lib/types'
import type { ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu'

export default function TasksPage() {
  const { user: authUser } = useAuth()
  const isAdmin = authUser?.role === 'admin'

  const [filters, setFilters] = useState<UnifiedTasksFilters>({ status: 'todo' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailTask, setDetailTask] = useState<UnifiedTask | null>(null)
  const [addModal, setAddModal] = useState(false)

  const { data, isLoading } = useUnifiedTasks(filters)
  const { menu, open: openMenu, close: closeMenu } = useContextMenu()
  const { ask: askConfirm, el: confirmEl } = useConfirm()

  const toggleMut = useToggleTask()
  const editTitleMut = useEditTaskTitle()
  const deleteMut = useDeleteTask()
  const bulkToggleMut = useBulkToggleTasks()
  const bulkDeleteMut = useBulkDeleteTasks()

  const buckets = data?.data
  const total = data?.total ?? 0

  const allTasks = buckets
    ? [
        ...(buckets.overdue ?? []),
        ...(buckets.today ?? []),
        ...(buckets.this_week ?? []),
        ...(buckets.later ?? []),
        ...(buckets.no_due_date ?? []),
      ]
    : []

  const selectedTasks = allTasks.filter(t => selectedIds.has(t.id))

  const handleSelect = useCallback((task: UnifiedTask) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(task.id)) next.delete(task.id)
      else next.add(task.id)
      return next
    })
  }, [])

  function handleDelete(task: UnifiedTask) {
    askConfirm({
      title: 'Delete task',
      message: `Delete "${task.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => deleteMut.mutate(task),
    })
  }

  function handleBulkDelete() {
    askConfirm({
      title: `Delete ${selectedTasks.length} tasks`,
      message: 'Delete selected tasks? This cannot be undone.',
      confirmLabel: 'Delete all',
      variant: 'danger',
      onConfirm: () => {
        bulkDeleteMut.mutate(selectedTasks)
        setSelectedIds(new Set())
      },
    })
  }

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, items: ContextMenuItem[]) => {
      openMenu(e, items)
    },
    [openMenu],
  )

  return (
    <ModuleGuard moduleId="tasks">
      <Topbar
        action={
          <Button variant="primary" onClick={() => setAddModal(true)}>
            + Add Task
          </Button>
        }
      />

      <div style={{ padding: '16px 24px', maxWidth: 860, margin: '0 auto' }}>
        {/* Stats bar */}
        <div
          style={{
            display: 'flex',
            gap: 20,
            marginBottom: 16,
            padding: '12px 16px',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}
        >
          <Stat label="Total" value={total} />
          <Stat label="Overdue" value={buckets?.overdue?.length ?? 0} color="var(--red)" />
          <Stat label="Due Today" value={buckets?.today?.length ?? 0} color="var(--amber)" />
        </div>

        <TaskFilterBar filters={filters} isAdmin={isAdmin} onFiltersChange={setFilters} />

        {isLoading ? (
          <SkeletonLoader />
        ) : !buckets || total === 0 ? (
          <EmptyState hasFilters={Object.keys(filters).some(k => k !== 'status')} />
        ) : (
          BUCKET_ORDER.map((bucket: DueBucket) => (
            <TaskGroup
              key={bucket}
              label={BUCKET_LABELS[bucket]}
              tasks={buckets[bucket] ?? []}
              isOverdue={bucket === 'overdue'}
              isAdmin={isAdmin}
              selectedIds={selectedIds}
              onToggle={task => toggleMut.mutate(task)}
              onDelete={handleDelete}
              onEditTitle={(task, title) => editTitleMut.mutate({ task, title })}
              onSelect={handleSelect}
              onOpenDetail={setDetailTask}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onMarkDone={() => {
          bulkToggleMut.mutate({ tasks: selectedTasks, newStatus: 'done' })
          setSelectedIds(new Set())
        }}
        onMarkTodo={() => {
          bulkToggleMut.mutate({ tasks: selectedTasks, newStatus: 'todo' })
          setSelectedIds(new Set())
        }}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      <TaskDetailPanel
        task={detailTask}
        isAdmin={isAdmin}
        onClose={() => setDetailTask(null)}
        onToggle={task => toggleMut.mutate(task)}
        onDelete={task => {
          handleDelete(task)
          setDetailTask(null)
        }}
      />

      {addModal && <AddTaskModal onClose={() => setAddModal(false)} />}

      {confirmEl}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </ModuleGuard>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: color ?? 'var(--text)',
          fontFamily: 'Instrument Serif, serif',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function SkeletonLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 44,
            borderRadius: 8,
            background: 'var(--surface2)',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 100}ms`,
          }}
        >
          <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>
        {hasFilters ? 'No tasks match the current filters' : "No tasks — you're all caught up"}
      </div>
    </div>
  )
}
