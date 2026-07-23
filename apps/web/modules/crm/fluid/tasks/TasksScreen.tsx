'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/modules/shared/lib/AuthContext'
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu'
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog'
import { useUnifiedTasks } from '@/modules/crm/tasks/lib/useUnifiedTasks'
import { useToggleTask, useEditTaskTitle, useDeleteTask, useBulkToggleTasks, useBulkDeleteTasks } from '@/modules/crm/tasks/lib/taskMutations'
import { TaskGroup } from '@/modules/crm/tasks/components/TaskGroup'
import { TaskFilterBar } from '@/modules/crm/tasks/components/TaskFilterBar'
import { BulkActionBar } from '@/modules/crm/tasks/components/BulkActionBar'
import { TaskDetailPanel } from '@/modules/crm/tasks/components/TaskDetailPanel'
import { AddTaskModal } from '@/modules/crm/tasks/components/AddTaskModal'
import type { UnifiedTask, UnifiedTasksFilters, DueBucket } from '@/modules/crm/tasks/lib/types'
import { BUCKET_LABELS, BUCKET_ORDER } from '@/modules/crm/tasks/lib/types'
import type { ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu'
import { PageHeader, MetricPill, FluidButton, EmptyState } from '@/modules/shared/fluid/ui'

export function TasksScreen() {
  const { user: authUser, hasPermission } = useAuth()
  const isAdmin = authUser?.isAdmin ?? false
  const canCreate = hasPermission('tasks:create')
  const canDelete = hasPermission('tasks:delete')

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
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${total} tasks tracked`}
        actions={
          canCreate ? (
            <FluidButton icon="add" onClick={() => setAddModal(true)}>
              Add Task
            </FluidButton>
          ) : undefined
        }
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetricPill icon="checklist" label="Total" value={String(total)} />
        <MetricPill icon="warning" label="Overdue" value={String(buckets?.overdue?.length ?? 0)} trend="Overdue" />
        <MetricPill icon="schedule" label="Due Today" value={String(buckets?.today?.length ?? 0)} trend="Due Today" />
        <MetricPill icon="calendar_month" label="This Week" value={String(buckets?.this_week?.length ?? 0)} trend="This Week" />
      </div>

      <TaskFilterBar filters={filters} isAdmin={isAdmin} onFiltersChange={setFilters} />

      {isLoading ? (
        <TasksSkeleton />
      ) : !buckets || total === 0 ? (
        <EmptyState
          icon="checklist"
          title={Object.keys(filters).some(k => k !== 'status') ? 'No tasks match the current filters' : "No tasks — you're all caught up"}
        />
      ) : (
        BUCKET_ORDER.map((bucket: DueBucket) => (
          <TaskGroup
            key={bucket}
            label={BUCKET_LABELS[bucket]}
            tasks={buckets[bucket] ?? []}
            isOverdue={bucket === 'overdue'}
            isAdmin={canDelete}
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
        isAdmin={canDelete}
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
    </>
  )
}

function TasksSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 48,
            borderRadius: 'var(--fl-radius-input)',
            background: 'var(--fl-surface-container)',
            animation: 'flTaskPulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 100}ms`,
          }}
        >
          <style>{`@keyframes flTaskPulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
        </div>
      ))}
    </div>
  )
}
