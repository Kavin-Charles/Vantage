'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import { useAuth } from '@/modules/shared/lib/AuthContext'
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog'
import { useUnifiedTasks } from '@/modules/crm/tasks/lib/useUnifiedTasks'
import { useToggleTask, useEditTaskTitle, useDeleteTask, useBulkToggleTasks, useBulkDeleteTasks } from '@/modules/crm/tasks/lib/taskMutations'
import type { UnifiedTask, UnifiedTasksFilters, DueBucket } from '@/modules/crm/tasks/lib/types'
import { BUCKET_LABELS, BUCKET_ORDER } from '@/modules/crm/tasks/lib/types'
import { listContacts } from '@/modules/crm/contacts/lib/contacts'
import { PageHeader, MetricPill, GlassCard, FluidChip, FluidButton, FluidInput, FluidSelect, EmptyState, MSIcon } from '@/modules/shared/fluid/ui'

export function TasksScreen() {
  const { user: authUser, hasPermission } = useAuth()
  const isAdmin = authUser?.isAdmin ?? false
  const canCreate = hasPermission('tasks:create')
  const canDelete = hasPermission('tasks:delete')

  const [filters, setFilters] = useState<UnifiedTasksFilters>({ status: 'todo' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newContactId, setNewContactId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const { data, isLoading } = useUnifiedTasks(filters)
  const { ask: askConfirm, el: confirmEl } = useConfirm()
  const getToken = useApiToken()
  const qc = useQueryClient()

  const toggleMut = useToggleTask()
  const editTitleMut = useEditTaskTitle()
  const deleteMut = useDeleteTask()
  const bulkToggleMut = useBulkToggleTasks()
  const bulkDeleteMut = useBulkDeleteTasks()

  const { data: contactsData } = useQuery({
    queryKey: ['contacts', 'task-picker'],
    queryFn: async () => listContacts(await getToken(), { per_page: '100' }),
  })
  const contactOptions = [
    { label: 'No contact', value: '' },
    ...(contactsData?.data ?? []).map(c => ({ label: c.name, value: c.id })),
  ]

  const addTaskMut = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      const body: Record<string, unknown> = { title: newTitle.trim() }
      if (newDue) body['due_date'] = newDue
      if (newContactId) body['contact_id'] = newContactId
      return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body), token })
    },
    onSuccess: () => {
      setNewTitle('')
      setNewDue('')
      setNewContactId('')
      void qc.invalidateQueries({ queryKey: ['tasks-unified'] })
    },
  })

  const buckets = data?.data
  const total = data?.total ?? 0

  const allTasks: UnifiedTask[] = buckets ? BUCKET_ORDER.flatMap(b => buckets[b] ?? []) : []
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

  function startEdit(task: UnifiedTask) {
    setEditingId(task.id)
    setEditVal(task.title)
  }

  function commitEdit(task: UnifiedTask) {
    setEditingId(null)
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== task.title) editTitleMut.mutate({ task, title: trimmed })
  }

  function handleAddTask() {
    if (!newTitle.trim() || addTaskMut.isPending) return
    addTaskMut.mutate()
  }

  return (
    <>
      <PageHeader title="Tasks" subtitle={`${total} tasks tracked`} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetricPill icon="checklist" label="Total" value={String(total)} />
        <MetricPill icon="warning" label="Overdue" value={String(buckets?.overdue?.length ?? 0)} trend="Overdue" />
        <MetricPill icon="schedule" label="Due Today" value={String(buckets?.today?.length ?? 0)} trend="Due Today" />
        <MetricPill icon="calendar_month" label="This Week" value={String(buckets?.this_week?.length ?? 0)} trend="This Week" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0 16px' }}>
        <FluidChip active={(filters.status ?? 'todo') === 'todo'} onClick={() => setFilters(f => ({ ...f, status: 'todo' }))}>
          To do
        </FluidChip>
        <FluidChip active={filters.status === 'done'} onClick={() => setFilters(f => ({ ...f, status: 'done' }))}>
          Done
        </FluidChip>
        <FluidChip active={filters.status === 'all'} onClick={() => setFilters(f => ({ ...f, status: 'all' }))}>
          All
        </FluidChip>

        {isAdmin && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--fl-outline-variant)', margin: '0 2px' }} />
            <FluidChip active={!filters.show_all} onClick={() => setFilters(f => ({ ...f, show_all: undefined }))}>
              Mine
            </FluidChip>
            <FluidChip active={!!filters.show_all} onClick={() => setFilters(f => ({ ...f, show_all: true }))}>
              All
            </FluidChip>
          </>
        )}
      </div>

      {canCreate && (
        <GlassCard style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <FluidInput value={newTitle} onChange={setNewTitle} placeholder="Add a task…" icon="add_task" />
            </div>
            <div style={{ width: 160 }}>
              <FluidInput value={newDue} onChange={setNewDue} type="date" placeholder="Due date" />
            </div>
            <div style={{ width: 180 }}>
              <FluidSelect value={newContactId} onChange={setNewContactId} options={contactOptions} />
            </div>
            <FluidButton icon="add" onClick={handleAddTask} disabled={!newTitle.trim() || addTaskMut.isPending}>
              Add
            </FluidButton>
          </div>
        </GlassCard>
      )}

      {isLoading ? (
        <TasksSkeleton />
      ) : !buckets || total === 0 ? (
        <EmptyState
          icon="checklist"
          title={Object.keys(filters).some(k => k !== 'status') ? 'No tasks match the current filters' : "No tasks — you're all caught up"}
        />
      ) : (
        BUCKET_ORDER.map((bucket: DueBucket) => {
          const tasks = buckets[bucket] ?? []
          if (tasks.length === 0) return null
          const overdueBucket = bucket === 'overdue'

          return (
            <GlassCard key={bucket} style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px',
                  borderBottom: '1px solid var(--fl-outline-variant)',
                }}
              >
                <h3
                  style={{
                    margin: 0, fontFamily: 'var(--fl-font-display)', fontSize: 16, fontWeight: 600,
                    color: overdueBucket ? 'var(--fl-error)' : 'var(--fl-on-surface)',
                  }}
                >
                  {BUCKET_LABELS[bucket]}
                </h3>
                <span
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999,
                    background: overdueBucket ? 'var(--fl-error-container)' : 'var(--fl-surface-container)',
                    color: overdueBucket ? 'var(--fl-error)' : 'var(--fl-on-surface-variant)',
                  }}
                >
                  {tasks.length}
                </span>
              </div>

              {tasks.map(task => {
                const done = task.status === 'done'
                const overdueTask = !done && !!task.due_date && new Date(task.due_date) < new Date()
                const editing = editingId === task.id

                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                      borderBottom: '1px solid var(--fl-outline-variant)',
                      background: selectedIds.has(task.id) ? 'var(--fl-primary-container)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      onChange={() => handleSelect(task)}
                      style={{ flexShrink: 0, cursor: 'pointer' }}
                      aria-label={`Select ${task.title}`}
                    />

                    <button
                      type="button"
                      onClick={() => toggleMut.mutate(task)}
                      aria-label={done ? 'Mark as todo' : 'Mark as done'}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        border: `1px solid ${done ? 'var(--fl-primary)' : 'var(--fl-outline)'}`,
                        background: done ? 'var(--fl-primary)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', padding: 0,
                      }}
                    >
                      {done ? <MSIcon name="check" size={14} style={{ color: 'var(--fl-on-primary)' }} /> : null}
                    </button>

                    {editing ? (
                      <input
                        autoFocus
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitEdit(task)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit(task)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        style={{
                          flex: 1, border: '1px solid var(--fl-primary)', borderRadius: 6,
                          padding: '4px 8px', fontSize: 14, fontFamily: 'inherit',
                          background: 'var(--fl-surface-container-lowest)', color: 'var(--fl-on-surface)', outline: 'none',
                        }}
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startEdit(task)}
                        style={{
                          flex: 1, fontSize: 14,
                          color: done ? 'var(--fl-on-surface-variant)' : 'var(--fl-on-surface)',
                          textDecoration: done ? 'line-through' : 'none',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {task.title}
                      </span>
                    )}

                    {task.contact_id && (
                      <Link
                        href={`/crm/contacts/${task.contact_id}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                          padding: '4px 12px', borderRadius: 'var(--fl-radius-pill)',
                          fontSize: 12, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
                          background: 'var(--fl-surface-container-lowest)', border: '1px solid var(--fl-outline-variant)',
                          textDecoration: 'none', whiteSpace: 'nowrap', maxWidth: 140,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        <MSIcon name="person" size={13} />
                        {task.contact_name ?? 'Contact'}
                      </Link>
                    )}

                    {task.due_date && (
                      <span
                        style={{
                          fontSize: 12, flexShrink: 0,
                          color: overdueTask ? 'var(--fl-error)' : 'var(--fl-on-surface-variant)',
                          background: overdueTask ? 'var(--fl-error-container)' : 'var(--fl-surface-container)',
                          padding: '2px 9px', borderRadius: 999, fontWeight: overdueTask ? 600 : 500,
                        }}
                      >
                        {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(task)}
                        aria-label="Delete task"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'var(--fl-on-surface-variant)', borderRadius: 4, display: 'flex', flexShrink: 0,
                        }}
                      >
                        <MSIcon name="delete" size={16} />
                      </button>
                    )}
                  </div>
                )
              })}
            </GlassCard>
          )
        })
      )}

      {selectedIds.size > 0 && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--fl-surface-container-highest)', color: 'var(--fl-on-surface)',
            border: '1px solid var(--fl-outline-variant)',
            borderRadius: 'var(--fl-radius-pill)', padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: 'var(--fl-shadow-float)', zIndex: 100,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, marginRight: 4 }}>{selectedIds.size} selected</span>
          <FluidButton
            variant="ghost"
            icon="check"
            style={{ padding: '6px 12px' }}
            onClick={() => {
              bulkToggleMut.mutate({ tasks: selectedTasks, newStatus: 'done' })
              setSelectedIds(new Set())
            }}
          >
            Mark done
          </FluidButton>
          <FluidButton
            variant="ghost"
            icon="refresh"
            style={{ padding: '6px 12px' }}
            onClick={() => {
              bulkToggleMut.mutate({ tasks: selectedTasks, newStatus: 'todo' })
              setSelectedIds(new Set())
            }}
          >
            Mark todo
          </FluidButton>
          {canDelete && (
            <FluidButton
              variant="ghost"
              icon="delete"
              style={{ padding: '6px 12px', color: 'var(--fl-error)', borderColor: 'var(--fl-error-container)' }}
              onClick={handleBulkDelete}
            >
              Delete
            </FluidButton>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 4, display: 'flex' }}
          >
            <MSIcon name="close" size={16} />
          </button>
        </div>
      )}

      {confirmEl}
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
