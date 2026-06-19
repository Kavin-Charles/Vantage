# Tasks Revamp — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single tasks page with a full-featured unified task hub — animated rows, grouped by due date, covering CRM + project tasks, with inline edit, detail panel, bulk actions, filter bar, right-click context menu, add-task modal with source picker, and a dashboard widget.

**Architecture:** New `apps/web/modules/tasks/` module. `useUnifiedTasks` hook fetches `/api/tasks/unified`. Mutations route to the correct API endpoint based on `task.source`. The page shell at `app/(dashboard)/tasks/page.tsx` becomes a thin wrapper. Dashboard widget registers itself via `registerDashboardWidget` when its module is imported.

**Tech Stack:** React, Next.js App Router, TanStack Query v5, CSS transitions (no animation library), existing shared UI components (`Icon`, `Badge`, `Button`, `Modal`, `ContextMenu`, `useConfirm`, `apiFetch`).

---

### Task 1: Types + `useUnifiedTasks` hook

**Files:**
- Create: `apps/web/modules/tasks/lib/types.ts`
- Create: `apps/web/modules/tasks/lib/useUnifiedTasks.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
// apps/web/modules/tasks/lib/types.ts

export interface UnifiedTask {
  id: string
  source: 'general' | 'contact' | 'project'
  title: string
  status: 'todo' | 'done'
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
  contact_id: string | null
  contact_name: string | null
  project_id: string | null
  project_name: string | null
  status_label: string | null
  status_color: string | null
  done_status_id: string | null
  todo_status_id: string | null
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface UnifiedTasksBuckets {
  overdue: UnifiedTask[]
  today: UnifiedTask[]
  this_week: UnifiedTask[]
  later: UnifiedTask[]
  no_due_date: UnifiedTask[]
}

export type DueBucket = keyof UnifiedTasksBuckets

export interface UnifiedTasksFilters {
  status?: 'todo' | 'done' | 'all'
  source?: 'general' | 'contact' | 'project' | 'all'
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  show_all?: boolean
  q?: string
}

export const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Due Today',
  this_week: 'This Week',
  later: 'Later',
  no_due_date: 'No Due Date',
}

export const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'this_week', 'later', 'no_due_date']

export const PRIORITY_COLOR: Record<UnifiedTask['priority'], string> = {
  URGENT: 'var(--red)',
  HIGH: 'var(--amber)',
  MEDIUM: 'var(--blue)',
  LOW: 'var(--text3)',
  NONE: 'var(--text3)',
}

export const PRIORITY_BG: Record<UnifiedTask['priority'], string> = {
  URGENT: 'var(--red-bg)',
  HIGH: 'var(--amber-bg)',
  MEDIUM: 'var(--blue-bg)',
  LOW: 'transparent',
  NONE: 'transparent',
}

export const SOURCE_COLOR: Record<UnifiedTask['source'], string> = {
  general: 'var(--text3)',
  contact: '#3b82f6',
  project: '#8b5cf6',
}
```

- [ ] **Step 2: Create `useUnifiedTasks.ts`**

```typescript
// apps/web/modules/tasks/lib/useUnifiedTasks.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import type { UnifiedTasksBuckets, UnifiedTasksFilters } from './types'

interface UnifiedTasksResponse {
  data: UnifiedTasksBuckets
  total: number
  error: null
}

export function useUnifiedTasks(filters: UnifiedTasksFilters = {}) {
  const getToken = useApiToken()

  return useQuery({
    queryKey: ['tasks-unified', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.source) params.set('source', filters.source)
      if (filters.priority) params.set('priority', filters.priority)
      if (filters.show_all) params.set('show_all', 'true')
      if (filters.q) params.set('q', filters.q)
      const qs = params.toString() ? `?${params.toString()}` : ''
      return apiFetch<UnifiedTasksResponse>(`/api/tasks/unified${qs}`, {
        token: await getToken(),
      })
    },
    staleTime: 30_000,
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | grep "tasks/lib" | head -20
```
Expected: no errors from the new files.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/modules/tasks/lib/types.ts apps/web/modules/tasks/lib/useUnifiedTasks.ts
rtk git commit -m "feat(tasks): add UnifiedTask types and useUnifiedTasks hook"
```

---

### Task 2: Mutation routing (`taskMutations.ts`)

**Files:**
- Create: `apps/web/modules/tasks/lib/taskMutations.ts`

- [ ] **Step 1: Create the file**

```typescript
// apps/web/modules/tasks/lib/taskMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import type { UnifiedTask } from './types'

// ── Toggle done/todo ─────────────────────────────────────────────────────────

export function useToggleTask() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (task: UnifiedTask) => {
      const token = await getToken()
      const newStatus = task.status === 'done' ? 'todo' : 'done'

      if (task.source === 'project') {
        const statusId = newStatus === 'done' ? task.done_status_id : task.todo_status_id
        if (!statusId) throw new Error('No status ID available for project task toggle')
        return apiFetch(
          `/api/projects/${task.project_id}/tasks/${task.id}`,
          { method: 'PATCH', body: JSON.stringify({ status_id: statusId }), token },
        )
      }

      return apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
        token,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}

// ── Edit title ───────────────────────────────────────────────────────────────

export function useEditTaskTitle() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ task, title }: { task: UnifiedTask; title: string }) => {
      const token = await getToken()

      if (task.source === 'project') {
        return apiFetch(
          `/api/projects/${task.project_id}/tasks/${task.id}`,
          { method: 'PATCH', body: JSON.stringify({ title }), token },
        )
      }

      return apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
        token,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}

// ── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteTask() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (task: UnifiedTask) => {
      const token = await getToken()

      if (task.source === 'project') {
        return apiFetch(
          `/api/projects/${task.project_id}/tasks/${task.id}`,
          { method: 'DELETE', token },
        )
      }

      return apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE', token })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}

// ── Bulk actions ─────────────────────────────────────────────────────────────

export function useBulkToggleTasks() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ tasks, newStatus }: { tasks: UnifiedTask[]; newStatus: 'todo' | 'done' }) => {
      const token = await getToken()
      await Promise.all(tasks.map(task => {
        if (task.source === 'project') {
          const statusId = newStatus === 'done' ? task.done_status_id : task.todo_status_id
          if (!statusId) return Promise.resolve()
          return apiFetch(
            `/api/projects/${task.project_id}/tasks/${task.id}`,
            { method: 'PATCH', body: JSON.stringify({ status_id: statusId }), token },
          )
        }
        return apiFetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
          token,
        })
      }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}

export function useBulkDeleteTasks() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (tasks: UnifiedTask[]) => {
      const token = await getToken()
      await Promise.all(tasks.map(task => {
        if (task.source === 'project') {
          return apiFetch(
            `/api/projects/${task.project_id}/tasks/${task.id}`,
            { method: 'DELETE', token },
          )
        }
        return apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE', token })
      }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | grep "taskMutations" | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/modules/tasks/lib/taskMutations.ts
rtk git commit -m "feat(tasks): add mutation hooks for unified tasks"
```

---

### Task 3: `TaskRow` component

**Files:**
- Create: `apps/web/modules/tasks/components/TaskRow.tsx`

- [ ] **Step 1: Create `TaskRow.tsx`**

```typescript
// apps/web/modules/tasks/components/TaskRow.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/modules/shared/components/ui/Icon'
import type { ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu'
import type { UnifiedTask } from '../lib/types'
import { PRIORITY_COLOR, PRIORITY_BG, SOURCE_COLOR } from '../lib/types'

interface Props {
  task: UnifiedTask
  index: number
  isAdmin: boolean
  selected: boolean
  onToggle: () => void
  onDelete: () => void
  onEditTitle: (title: string) => void
  onSelect: () => void
  onOpenDetail: () => void
  onContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange() }}
      style={{
        width: 18, height: 18, borderRadius: 6, flexShrink: 0,
        border: '1.5px solid ' + (checked ? 'var(--text)' : 'var(--border2, #d4cfc5)'),
        background: checked ? 'var(--text)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        transition: 'all 0.15s, transform 0.15s',
        transform: 'scale(1)',
      }}
      onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.85)' }}
      onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
    >
      {checked && <Icon name="check" size={11} color="#fff" strokeWidth={2.5} />}
    </button>
  )
}

function SelectBox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange() }}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: '1.5px solid ' + (checked ? 'var(--text)' : 'var(--border)'),
        background: checked ? 'var(--text)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, transition: 'all 0.12s',
      }}
    >
      {checked && <Icon name="check" size={10} color="#fff" strokeWidth={3} />}
    </button>
  )
}

export function TaskRow({
  task, index, isAdmin, selected,
  onToggle, onDelete, onEditTitle, onSelect, onOpenDetail, onContextMenu,
}: Props) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = task.status === 'done'

  useEffect(() => { setEditVal(task.title) }, [task.title])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(true)
  }

  function commitEdit() {
    setEditing(false)
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== task.title) onEditTitle(trimmed)
    else setEditVal(task.title)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') { setEditing(false); setEditVal(task.title) }
  }

  const menuItems: ContextMenuItem[] = [
    done
      ? { icon: 'refresh', label: 'Mark todo', onClick: onToggle }
      : { icon: 'check', label: 'Mark done', shortcut: '⌘↵', onClick: onToggle },
    { icon: 'edit', label: 'Edit title', onClick: () => setEditing(true) },
    { type: 'separator' },
    { icon: 'external-link', label: 'Open detail', onClick: onOpenDetail },
    { icon: 'copy', label: 'Copy title', onClick: () => navigator.clipboard.writeText(task.title) },
    ...(task.source_url
      ? [{ icon: 'arrow-right', label: 'Open in Project', onClick: () => window.location.href = task.source_url! }]
      : []),
    ...(isAdmin
      ? [{ type: 'separator' as const }, { icon: 'trash', label: 'Delete task', danger: true, onClick: onDelete }]
      : []),
  ]

  const isOverdue = task.status === 'todo' && task.due_date && new Date(task.due_date) < new Date()

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, menuItems) }}
      onClick={onOpenDetail}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--blue-bg)' : hover ? 'var(--surface2)' : 'transparent',
        transition: 'background 0.12s',
        cursor: 'pointer',
        opacity: 0,
        transform: 'translateY(6px)',
        animation: `taskFadeIn 0.2s ease forwards`,
        animationDelay: `${Math.min(index * 30, 300)}ms`,
        fontSize: 13,
      }}
    >
      <style>{`
        @keyframes taskFadeIn {
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <SelectBox checked={selected} onChange={onSelect} />
      <Checkbox checked={done} onChange={onToggle} />

      {/* Source dot */}
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: SOURCE_COLOR[task.source],
        title: task.source,
      }} title={task.source} />

      {/* Title */}
      {editing ? (
        <input
          ref={inputRef}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, border: '1px solid var(--border)', borderRadius: 6,
            padding: '2px 6px', fontSize: 13, fontFamily: 'inherit',
            background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          }}
        />
      ) : (
        <span
          onDoubleClick={startEdit}
          style={{
            flex: 1,
            color: done ? 'var(--text3)' : 'var(--text)',
            textDecoration: done ? 'line-through' : 'none',
            transition: 'color 0.3s, text-decoration 0.3s',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </span>
      )}

      {/* Priority chip (project tasks only) */}
      {task.priority !== 'NONE' && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, flexShrink: 0,
          color: PRIORITY_COLOR[task.priority],
          background: PRIORITY_BG[task.priority],
          letterSpacing: '0.04em',
        }}>
          {task.priority}
        </span>
      )}

      {/* Context label: contact or project name */}
      {(task.contact_name || task.project_name) && (
        <span
          onClick={e => {
            e.stopPropagation()
            if (task.source_url) window.location.href = task.source_url
          }}
          style={{
            fontSize: 11, color: 'var(--text3)', flexShrink: 0, maxWidth: 100,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: task.source_url ? 'pointer' : 'default',
            textDecoration: task.source_url && hover ? 'underline' : 'none',
          }}
        >
          {task.contact_name ?? task.project_name}
        </span>
      )}

      {/* Status label for project tasks */}
      {task.status_label && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 999, flexShrink: 0,
          background: task.status_color ? `${task.status_color}22` : 'var(--surface2)',
          color: task.status_color ?? 'var(--text2)',
          fontWeight: 600,
        }}>
          {task.status_label}
        </span>
      )}

      {/* Due date */}
      {task.due_date && (
        <span style={{
          fontSize: 11, flexShrink: 0,
          color: isOverdue ? 'var(--red)' : 'var(--text3)',
          background: isOverdue ? 'var(--red-bg)' : 'transparent',
          padding: isOverdue ? '2px 7px' : undefined,
          borderRadius: isOverdue ? 999 : undefined,
          fontWeight: isOverdue ? 600 : 400,
        }}>
          {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}

      {/* Assignee avatar */}
      {task.assignee_name && (
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: 'var(--text2)', flexShrink: 0,
        }} title={task.assignee_name}>
          {task.assignee_name[0]?.toUpperCase()}
        </span>
      )}

      {/* Delete button */}
      {isAdmin && hover && !editing && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            color: 'var(--text3)', borderRadius: 4, display: 'flex', alignItems: 'center',
            transition: 'color 0.12s', flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}
        >
          <Icon name="trash" size={13} />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | grep "TaskRow" | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/modules/tasks/components/TaskRow.tsx
rtk git commit -m "feat(tasks): add animated TaskRow component"
```

---

### Task 4: `TaskGroup` component

**Files:**
- Create: `apps/web/modules/tasks/components/TaskGroup.tsx`

- [ ] **Step 1: Create `TaskGroup.tsx`**

```typescript
// apps/web/modules/tasks/components/TaskGroup.tsx
'use client'

import { useState } from 'react'
import { Icon } from '@/modules/shared/components/ui/Icon'
import type { UnifiedTask } from '../lib/types'
import { TaskRow } from './TaskRow'
import type { ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu'

interface Props {
  label: string
  tasks: UnifiedTask[]
  isOverdue?: boolean
  isAdmin: boolean
  selectedIds: Set<string>
  onToggle: (task: UnifiedTask) => void
  onDelete: (task: UnifiedTask) => void
  onEditTitle: (task: UnifiedTask, title: string) => void
  onSelect: (task: UnifiedTask) => void
  onOpenDetail: (task: UnifiedTask) => void
  onContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void
}

export function TaskGroup({
  label, tasks, isOverdue = false, isAdmin,
  selectedIds, onToggle, onDelete, onEditTitle, onSelect, onOpenDetail, onContextMenu,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  if (tasks.length === 0) return null

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Group header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px 16px', textAlign: 'left',
          color: isOverdue ? 'var(--red)' : 'var(--text2)',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', fontFamily: 'inherit',
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}>
          <Icon name="chevron-down" size={13} />
        </span>
        {label.toUpperCase()}
        <span style={{
          fontSize: 11, fontWeight: 700,
          background: isOverdue ? 'var(--red-bg)' : 'var(--surface2)',
          color: isOverdue ? 'var(--red)' : 'var(--text3)',
          padding: '1px 7px', borderRadius: 999,
        }}>
          {tasks.length}
        </span>
      </button>

      {/* Task rows — collapse via max-height */}
      <div style={{
        overflow: 'hidden',
        maxHeight: collapsed ? 0 : `${tasks.length * 60}px`,
        transition: 'max-height 0.2s ease',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        marginLeft: 0,
      }}>
        {tasks.map((task, i) => (
          <TaskRow
            key={task.id}
            task={task}
            index={i}
            isAdmin={isAdmin}
            selected={selectedIds.has(task.id)}
            onToggle={() => onToggle(task)}
            onDelete={() => onDelete(task)}
            onEditTitle={title => onEditTitle(task, title)}
            onSelect={() => onSelect(task)}
            onOpenDetail={() => onOpenDetail(task)}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/modules/tasks/components/TaskGroup.tsx
rtk git commit -m "feat(tasks): add collapsible TaskGroup component"
```

---

### Task 5: `TaskFilterBar` + `BulkActionBar`

**Files:**
- Create: `apps/web/modules/tasks/components/TaskFilterBar.tsx`
- Create: `apps/web/modules/tasks/components/BulkActionBar.tsx`

- [ ] **Step 1: Create `TaskFilterBar.tsx`**

```typescript
// apps/web/modules/tasks/components/TaskFilterBar.tsx
'use client'

import { Icon } from '@/modules/shared/components/ui/Icon'
import type { UnifiedTasksFilters } from '../lib/types'

interface Props {
  filters: UnifiedTasksFilters
  isAdmin: boolean
  onFiltersChange: (f: UnifiedTasksFilters) => void
}

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'general', label: 'General' },
  { value: 'contact', label: 'Contact' },
  { value: 'project', label: 'Project' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'Todo' },
  { value: 'done', label: 'Done' },
] as const

const PRIORITY_OPTIONS = [
  { value: undefined, label: 'Any Priority' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
] as const

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px', borderRadius: 999, border: '1px solid var(--border)',
  background: active ? 'var(--text)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--text2)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit', transition: 'all 0.12s', whiteSpace: 'nowrap',
})

const selectStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text2)', fontSize: 12,
  fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
}

export function TaskFilterBar({ filters, isAdmin, onFiltersChange }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '12px 0', marginBottom: 8,
    }}>
      {/* Search */}
      <div style={{ position: 'relative', marginRight: 4 }}>
        <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={filters.q ?? ''}
          onChange={e => onFiltersChange({ ...filters, q: e.target.value || undefined })}
          placeholder="Search tasks…"
          style={{
            paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
            borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 12,
            fontFamily: 'inherit', outline: 'none', width: 180,
          }}
        />
      </div>

      {/* Status pills */}
      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          style={pillStyle((filters.status ?? 'all') === opt.value)}
          onClick={() => onFiltersChange({ ...filters, status: opt.value as UnifiedTasksFilters['status'] })}
        >
          {opt.label}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

      {/* Source pills */}
      {SOURCE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          style={pillStyle((filters.source ?? 'all') === opt.value)}
          onClick={() => onFiltersChange({ ...filters, source: opt.value as UnifiedTasksFilters['source'] })}
        >
          {opt.label}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

      {/* Priority select */}
      <select
        style={selectStyle}
        value={filters.priority ?? ''}
        onChange={e => onFiltersChange({ ...filters, priority: (e.target.value || undefined) as UnifiedTasksFilters['priority'] })}
      >
        {PRIORITY_OPTIONS.map(opt => (
          <option key={opt.value ?? 'any'} value={opt.value ?? ''}>{opt.label}</option>
        ))}
      </select>

      {/* Show all (admin) */}
      {isAdmin && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.show_all ?? false}
            onChange={e => onFiltersChange({ ...filters, show_all: e.target.checked || undefined })}
          />
          All workspace
        </label>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `BulkActionBar.tsx`**

```typescript
// apps/web/modules/tasks/components/BulkActionBar.tsx
'use client'

import { Icon } from '@/modules/shared/components/ui/Icon'

interface Props {
  count: number
  onMarkDone: () => void
  onMarkTodo: () => void
  onDelete: () => void
  onClear: () => void
}

export function BulkActionBar({ count, onMarkDone, onMarkTodo, onDelete, onClear }: Props) {
  if (count === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--text)', color: '#fff',
      borderRadius: 12, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      zIndex: 100,
      animation: 'bulkBarIn 0.15s ease-out forwards',
    }}>
      <style>{`
        @keyframes bulkBarIn {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <span style={{ fontSize: 13, fontWeight: 600, marginRight: 4 }}>{count} selected</span>

      {[
        { label: 'Mark done', icon: 'check', onClick: onMarkDone },
        { label: 'Mark todo', icon: 'refresh', onClick: onMarkTodo },
        { label: 'Delete', icon: 'trash', onClick: onDelete, danger: true },
      ].map(action => (
        <button
          key={action.label}
          onClick={action.onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.12)', border: 'none',
            borderRadius: 7, padding: '5px 10px', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            color: action.danger ? '#fca5a5' : '#fff',
            fontFamily: 'inherit', transition: 'background 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)' }}
        >
          <Icon name={action.icon} size={12} />
          {action.label}
        </button>
      ))}

      <button
        onClick={onClear}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.6)', padding: '4px', marginLeft: 4,
          display: 'flex', alignItems: 'center', borderRadius: 4,
          transition: 'color 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)' }}
        title="Clear selection"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/modules/tasks/components/TaskFilterBar.tsx apps/web/modules/tasks/components/BulkActionBar.tsx
rtk git commit -m "feat(tasks): add TaskFilterBar and BulkActionBar components"
```

---

### Task 6: `TaskDetailPanel`

**Files:**
- Create: `apps/web/modules/tasks/components/TaskDetailPanel.tsx`

- [ ] **Step 1: Create `TaskDetailPanel.tsx`**

```typescript
// apps/web/modules/tasks/components/TaskDetailPanel.tsx
'use client'

import { useEffect } from 'react'
import { Icon } from '@/modules/shared/components/ui/Icon'
import { Button } from '@/modules/shared/components/ui/Button'
import type { UnifiedTask } from '../lib/types'
import { PRIORITY_COLOR, SOURCE_COLOR } from '../lib/types'

interface Props {
  task: UnifiedTask | null
  isAdmin: boolean
  onClose: () => void
  onToggle: (task: UnifiedTask) => void
  onDelete: (task: UnifiedTask) => void
}

export function TaskDetailPanel({ task, isAdmin, onClose, onToggle, onDelete }: Props) {
  useEffect(() => {
    if (!task) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [task, onClose])

  const open = task !== null

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.12)',
            animation: 'backdropIn 0.2s ease',
          }}
        />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s ease-out',
        overflowY: 'auto',
      }}>
        <style>{`
          @keyframes backdropIn { from { opacity: 0 } to { opacity: 1 } }
        `}</style>

        {task && (
          <>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '20px 20px 16px', borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: SOURCE_COLOR[task.source], flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    {task.source.toUpperCase()}
                  </span>
                </div>
                <h2 style={{
                  margin: 0, fontSize: 16, fontWeight: 600,
                  color: task.status === 'done' ? 'var(--text3)' : 'var(--text)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  lineHeight: 1.3,
                }}>
                  {task.title}
                </h2>
              </div>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 20px', flex: 1 }}>
              {/* Status */}
              <Row label="Status">
                <button
                  onClick={() => onToggle(task)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: task.status === 'done' ? 'var(--green-bg)' : 'var(--amber-bg)',
                    color: task.status === 'done' ? 'var(--green)' : 'var(--amber)',
                    transition: 'all 0.12s',
                  }}
                >
                  {task.status === 'done' ? '✓ Done' : '○ Todo'}
                </button>
              </Row>

              {/* Priority (project tasks) */}
              {task.priority !== 'NONE' && (
                <Row label="Priority">
                  <span style={{ fontSize: 12, fontWeight: 700, color: PRIORITY_COLOR[task.priority] }}>
                    {task.priority}
                  </span>
                </Row>
              )}

              {/* Status label (project tasks) */}
              {task.status_label && (
                <Row label="Project status">
                  <span style={{
                    fontSize: 12, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                    background: task.status_color ? `${task.status_color}22` : 'var(--surface2)',
                    color: task.status_color ?? 'var(--text2)',
                  }}>
                    {task.status_label}
                  </span>
                </Row>
              )}

              {/* Due date */}
              {task.due_date && (
                <Row label="Due date">
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>
                    {new Date(task.due_date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </Row>
              )}

              {/* Assignee */}
              {task.assignee_name && (
                <Row label="Assignee">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: 'var(--text2)',
                    }}>
                      {task.assignee_name[0]?.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13 }}>{task.assignee_name}</span>
                  </div>
                </Row>
              )}

              {/* Contact link */}
              {task.contact_name && (
                <Row label="Contact">
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{task.contact_name}</span>
                </Row>
              )}

              {/* Project link */}
              {task.project_name && (
                <Row label="Project">
                  <a
                    href={task.source_url ?? '#'}
                    style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                  >
                    {task.project_name} →
                  </a>
                </Row>
              )}
            </div>

            {/* Footer actions */}
            <div style={{
              padding: '14px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: 8, flexShrink: 0,
            }}>
              {task.source_url && (
                <Button onClick={() => window.location.href = task.source_url!}>
                  Open in Project
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="danger"
                  onClick={() => { onDelete(task); onClose() }}
                  style={{ marginLeft: 'auto' }}
                >
                  Delete
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '9px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text3)', width: 110, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/modules/tasks/components/TaskDetailPanel.tsx
rtk git commit -m "feat(tasks): add slide-in TaskDetailPanel"
```

---

### Task 7: `AddTaskModal`

**Files:**
- Create: `apps/web/modules/tasks/components/AddTaskModal.tsx`

- [ ] **Step 1: Create `AddTaskModal.tsx`**

```typescript
// apps/web/modules/tasks/components/AddTaskModal.tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/modules/shared/components/ui/Modal'
import { Button } from '@/modules/shared/components/ui/Button'
import { FormField, Input } from '@/modules/shared/components/ui/FormField'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'

type Source = 'general' | 'contact' | 'project'

interface WorkspaceUser { id: string; name: string; email: string }
interface ContactItem { id: string; name: string }
interface ProjectItem { id: string; name: string }

interface Props {
  onClose: () => void
}

export function AddTaskModal({ onClose }: Props) {
  const getToken = useApiToken()
  const qc = useQueryClient()
  const [source, setSource] = useState<Source | null>(null)
  const [form, setForm] = useState({
    title: '', due_date: '', assignee_id: '',
    contact_id: '', project_id: '', priority: 'NONE',
  })

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () => apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
  })
  const users = usersData?.data ?? []

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-list'],
    queryFn: async () => apiFetch<{ data: ContactItem[] }>('/api/contacts?per_page=100', { token: await getToken() }),
    enabled: source === 'contact',
  })
  const contacts = contactsData?.data ?? []

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: async () => apiFetch<{ data: ProjectItem[] }>('/api/projects', { token: await getToken() }),
    enabled: source === 'project',
  })
  const projects = projectsData?.data ?? []

  const createMut = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (source === 'project') {
        const body: Record<string, unknown> = { title: form.title, priority: form.priority }
        if (form.due_date) body['due_date'] = new Date(form.due_date).toISOString()
        if (form.assignee_id) body['assignee_ids'] = [form.assignee_id]
        return apiFetch(`/api/projects/${form.project_id}/tasks`, {
          method: 'POST', body: JSON.stringify(body), token,
        })
      }
      const body: Record<string, unknown> = { title: form.title }
      if (form.due_date) body['due_date'] = form.due_date
      if (form.assignee_id) body['assignee_id'] = form.assignee_id
      if (source === 'contact' && form.contact_id) body['contact_id'] = form.contact_id
      return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body), token })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-unified'] })
      onClose()
    },
  })

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'inherit', outline: 'none',
  }

  if (!source) {
    return (
      <Modal title="Add Task" onClose={onClose}>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Where should this task live?</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {([
            { id: 'general', label: 'General', desc: 'Standalone task' },
            { id: 'contact', label: 'Contact', desc: 'Linked to a contact' },
            { id: 'project', label: 'Project', desc: 'In a project board' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setSource(opt.id)}
              style={{
                padding: '16px 12px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--bg)',
                cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
                transition: 'border-color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg)' }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  const canSubmit = form.title.trim().length > 0 &&
    (source !== 'contact' || form.contact_id !== '') &&
    (source !== 'project' || form.project_id !== '')

  return (
    <Modal title={`Add ${source.charAt(0).toUpperCase() + source.slice(1)} Task`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (canSubmit) createMut.mutate() }}>
        <FormField label="Title *">
          <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" />
        </FormField>

        {source === 'contact' && (
          <FormField label="Contact *">
            <select style={selectStyle} value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
              <option value="">— Select contact —</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
        )}

        {source === 'project' && (
          <>
            <FormField label="Project *">
              <select style={selectStyle} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select style={selectStyle} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {['NONE','LOW','MEDIUM','HIGH','URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
          </>
        )}

        <FormField label="Assign to">
          <select style={selectStyle} value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
            <option value="">— Me —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </FormField>

        <FormField label="Due date">
          <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </FormField>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <Button type="button" onClick={() => setSource(null)}>← Back</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!canSubmit || createMut.isPending}>
              {createMut.isPending ? 'Saving…' : 'Add task'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/modules/tasks/components/AddTaskModal.tsx
rtk git commit -m "feat(tasks): add AddTaskModal with source picker"
```

---

### Task 8: `TasksWidget` (dashboard widget)

**Files:**
- Create: `apps/web/modules/tasks/components/TasksWidget.tsx`

- [ ] **Step 1: Create `TasksWidget.tsx`**

```typescript
// apps/web/modules/tasks/components/TasksWidget.tsx
'use client'

import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry'
import { useUnifiedTasks } from '../lib/useUnifiedTasks'
import type { UnifiedTask } from '../lib/types'
import { Icon } from '@/modules/shared/components/ui/Icon'

function TasksWidgetInner() {
  const { data, isLoading } = useUnifiedTasks({ status: 'todo' })

  const overdue = data?.data?.overdue ?? []
  const today = data?.data?.today ?? []
  const total = (data?.total ?? 0)
  const topTasks = [...overdue, ...today].slice(0, 5)

  if (isLoading) {
    return <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
  }

  return (
    <div style={{ padding: '12px 16px', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stats row */}
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

      {/* Top tasks list */}
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

      {/* Link to tasks page */}
      <a href="/tasks" style={{
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
```

- [ ] **Step 2: Import `TasksWidget` in `AddWidgetPanel.tsx` to trigger registration**

Open `apps/web/modules/dashboard/components/AddWidgetPanel.tsx`. Find the imports at the top. Add this line:

```typescript
import '@/modules/tasks/components/TasksWidget'
```

This side-effect import ensures the widget is registered before `getDashboardWidgets()` is called in the panel.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/modules/tasks/components/TasksWidget.tsx apps/web/modules/dashboard/components/AddWidgetPanel.tsx
rtk git commit -m "feat(tasks): add dashboard TasksWidget and register it"
```

---

### Task 9: Revamp `tasks/page.tsx` (the main page shell)

**Files:**
- Modify: `apps/web/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Replace the entire file content**

```typescript
// apps/web/app/(dashboard)/tasks/page.tsx
'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/modules/shared/components/Topbar'
import { Button } from '@/modules/shared/components/ui/Button'
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu'
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
    ? [...(buckets.overdue ?? []), ...(buckets.today ?? []), ...(buckets.this_week ?? []), ...(buckets.later ?? []), ...(buckets.no_due_date ?? [])]
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
      onConfirm: () => { bulkDeleteMut.mutate(selectedTasks); setSelectedIds(new Set()) },
    })
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    openMenu(e, items)
  }, [openMenu])

  return (
    <ModuleGuard moduleId="tasks">
      <Topbar
        action={
          <Button variant="primary" onClick={() => setAddModal(true)}>+ Add Task</Button>
        }
      />

      <div style={{ padding: '16px 24px', maxWidth: 860, margin: '0 auto' }}>
        {/* Stats bar */}
        <div style={{
          display: 'flex', gap: 20, marginBottom: 16, padding: '12px 16px',
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
        }}>
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
        onMarkDone={() => { bulkToggleMut.mutate({ tasks: selectedTasks, newStatus: 'done' }); setSelectedIds(new Set()) }}
        onMarkTodo={() => { bulkToggleMut.mutate({ tasks: selectedTasks, newStatus: 'todo' }); setSelectedIds(new Set()) }}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      <TaskDetailPanel
        task={detailTask}
        isAdmin={isAdmin}
        onClose={() => setDetailTask(null)}
        onToggle={task => toggleMut.mutate(task)}
        onDelete={task => { handleDelete(task); setDetailTask(null) }}
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
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'Instrument Serif, serif' }}>
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
        <div key={i} style={{
          height: 44, borderRadius: 8, background: 'var(--surface2)',
          opacity: 1 - i * 0.15,
          animation: 'pulse 1.5s ease-in-out infinite',
          animationDelay: `${i * 100}ms`,
        }}>
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
        {hasFilters ? 'No tasks match the current filters' : 'No tasks — you\'re all caught up'}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create barrel file `apps/web/modules/tasks/index.ts`**

```typescript
// apps/web/modules/tasks/index.ts
export { TasksWidget } from './components/TasksWidget'
export type { UnifiedTask, UnifiedTasksFilters } from './lib/types'
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | grep -E "tasks|error" | head -30
```
Expected: no errors from the tasks module.

- [ ] **Step 4: Commit**

```bash
rtk git add "apps/web/app/(dashboard)/tasks/page.tsx" apps/web/modules/tasks/index.ts
rtk git commit -m "feat(tasks): revamped tasks page with unified view, animations, filters, detail panel"
```
