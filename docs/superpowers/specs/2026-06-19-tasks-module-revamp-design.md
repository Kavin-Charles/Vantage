# Tasks Module Revamp — Design Spec
**Date:** 2026-06-19  
**Branch:** feat/database-module-revamp (tasks work added here)  
**Status:** Approved

---

## Overview

Revamp the `/tasks` page into a unified, feature-packed task hub that surfaces CRM tasks (general + contact-linked) and project management tasks assigned to the current user — all in one animated, polished view. New backend endpoint normalizes both sources. Dashboard widget added.

---

## 1. Data Architecture

### 1.1 Unified Endpoint

`GET /api/tasks/unified`  
Internal auth (session JWT, not v1 API key). Workspace-scoped.

**Query params:**
| Param | Type | Default |
|-------|------|---------|
| `status` | `todo\|done\|all` | `all` |
| `source` | `general\|contact\|project\|all` | `all` |
| `priority` | `URGENT\|HIGH\|MEDIUM\|LOW\|NONE` | — |
| `assignee_id` | uuid | — |
| `show_all` | boolean | false (admin only) |
| `q` | string | — (title search) |

**Normalized shape (`UnifiedTask`):**
```ts
interface UnifiedTask {
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
  status_label: string | null       // project status name e.g. "In Progress"
  status_color: string | null       // project status hex color
  source_url: string | null         // deep link for project tasks
  created_at: string
  updated_at: string
}
```

**Response shape:**
```ts
{
  data: {
    overdue: UnifiedTask[]
    today: UnifiedTask[]
    this_week: UnifiedTask[]
    later: UnifiedTask[]
    no_due_date: UnifiedTask[]
  },
  total: number,
  error: null
}
```

### 1.2 Source Normalization Rules

| Field | CRM task | Project task |
|-------|----------|--------------|
| `source` | `contact_id != null` → `'contact'`, else `'general'` | `'project'` |
| `status` | direct | `is_done` → `'done'`, else `'todo'` |
| `priority` | `'NONE'` | direct from `project_tasks.priority` |
| `contact_name` | JOIN `contacts.name` | `null` |
| `project_name` | `null` | from `projects.name` |
| `status_label` | `null` | from `project_task_statuses.name` |
| `status_color` | `null` | from `project_task_statuses.color` |
| `source_url` | `null` | `/projects/{project_id}/tasks` |

### 1.3 Due Date Bucketing (server-side, workspace timezone = UTC)

- **overdue:** `due_date < today`
- **today:** `due_date = today`
- **this_week:** `due_date` within next 7 days (exclusive of today)
- **later:** `due_date > 7 days out`
- **no_due_date:** `due_date IS NULL`

Within each bucket, sort by `priority` (URGENT first) then `created_at` asc.

---

## 2. Backend Implementation

### 2.1 New File

`apps/api/src/routes/tasks-unified.ts`  
Exports `createUnifiedTasksRouter(db)`.

**Queries:**
1. CRM tasks: `SELECT t.*, c.name as contact_name FROM tasks t LEFT JOIN contacts c ON t.contact_id = c.id WHERE t.workspace_id = $workspace AND (show_all OR t.assignee_id = $user)`
2. Project tasks: extend existing `createMyTasksRouter` query — already joins `projects`, `project_task_statuses`, `project_task_assignees`. Add `contact_id` join. Filter `p.status != 'DELETED'` and `s.is_done = false` for todo, or fetch all when `status=all`.
3. Merge arrays in Node, normalize fields, bucket by due date, return.

### 2.2 Mutation Routing

Mutations stay on existing endpoints — unified endpoint is read-only:

| Action | CRM route | Project route |
|--------|-----------|---------------|
| Toggle done | `PATCH /api/tasks/:id` `{status}` | `PATCH /api/projects/:pid/tasks/:tid` `{status_id: first_done_status}` |
| Toggle todo | same | `{status_id: first_todo_status}` |
| Edit title | `PATCH /api/tasks/:id` `{title}` | `PATCH /api/projects/:pid/tasks/:tid` `{title}` |
| Delete | `DELETE /api/tasks/:id` | `DELETE /api/projects/:pid/tasks/:tid` |

For project task toggle: frontend must fetch the project's statuses once (cached per project) to resolve the first done/todo status_id.

### 2.3 Activity Hook

On every task toggle → `done`:
- `POST /api/activity` with `{ type: 'note', body: 'Task completed: "{title}"', contact_id, deal_id: null }`
- Source: `general`/`contact` tasks log to activity feed. Project tasks emit existing `pm_events` (already handled).

### 2.4 Alert Hook (extend task-due-notifier worker)

Current: `apps/api/src/workers/task-due-notifier.ts`  
Add: if CRM task `due_date < now - 24h` and `status = 'todo'` and no existing unresolved alert for `resource_id = task.id`:
```ts
INSERT INTO alerts (workspace_id, resource_type, resource_id, severity, message)
VALUES ($wid, 'crm', $task_id, 'warning', 'Task overdue: "{title}"')
```

---

## 3. Frontend

### 3.1 Module Structure

```
apps/web/modules/tasks/
├── components/
│   ├── TaskRow.tsx           (animated row, inline edit, context menu)
│   ├── TaskGroup.tsx         (collapsible section with count badge)
│   ├── TaskDetailPanel.tsx   (slide-in panel, 380px)
│   ├── TaskFilterBar.tsx     (source + priority + assignee + search)
│   ├── BulkActionBar.tsx     (floating bar when rows selected)
│   ├── AddTaskModal.tsx      (source picker → context-specific form)
│   └── TasksWidget.tsx       (dashboard widget)
├── lib/
│   ├── useUnifiedTasks.ts    (fetch + cache unified endpoint)
│   └── taskMutations.ts      (route mutations by source)
└── index.ts
```

Page entry: `apps/web/app/(dashboard)/tasks/page.tsx` — thin shell, imports from module.

### 3.2 Component Details

**TaskRow**
- Checkbox: `transform: scale(0.85 → 1)` + background fill on check, `transition: all 0.15s`
- Title: double-click → `<input>` inline, blur/Enter saves, Escape cancels
- Source badge: colored dot (gray=general, blue=contact, purple=project) + label
- Priority chip: visible for project tasks (URGENT=red, HIGH=amber, MEDIUM=blue, LOW=gray)
- Context label: contact name or project name, clickable
- Due date chip: red + bold if overdue
- Row mount: `opacity: 0 + translateY(6px)` → `opacity: 1 + translateY(0)`, delay `index * 30ms`
- Task completion: title `text-decoration: line-through` + `opacity: 0.5` over `0.3s`, then row fades and collapses if filter is `todo`
- Right-click: `ContextMenu` with: Mark done/todo, Edit title, Copy title, Open detail, separator, Delete (admin)

**TaskGroup**
- Header: section label + count badge + collapse chevron
- Collapse: `max-height` transition `0.2s ease`, `overflow: hidden`
- Overdue section header is red-tinted

**TaskDetailPanel**
- Slide in from right: `translateX(100% → 0)` `0.2s ease-out`, backdrop click closes
- CRM task view: title (editable), status toggle, priority (editable for project), due date picker, assignee, contact link, activity log (last 5)
- Project task view: same fields + "Open in Project →" button deep-linking to `source_url`
- Width: 380px, full height, `position: fixed`, `z-index: 50`

**FilterBar**
- Source pills: All · General · Contact · Project
- Priority multi-select dropdown
- Assignee dropdown (admin only — shows all workspace members)
- Search input (debounced 300ms, filters title client-side against cached data)
- Status toggle: Todo / Done / All

**BulkActionBar**
- Appears at bottom when ≥1 row selected: `translateY(100% → 0)` `0.15s`
- Actions: "Mark done" · "Delete" · count label · "Clear"
- Bulk delete: confirm dialog before executing

**AddTaskModal**
- Step 1: source picker (General / Contact / Project) — large radio cards
- Step 2 (General): title, due date, assignee
- Step 2 (Contact): above + contact typeahead search
- Step 2 (Project): project dropdown → then title, priority, assignees (multi), due date
- Submit routes to correct API endpoint

### 3.3 Dashboard Widget (TasksWidget)

Location: `modules/tasks/components/TasksWidget.tsx`  
Display: 3 stat chips (Overdue count / Due Today / Total Open) + list of top 5 overdue tasks with checkboxes (toggle in-place).  
Uses `useUnifiedTasks({ status: 'todo', limit: 5 })` — no new query needed.  
Added to dashboard layout in `modules/dashboard/` where other widgets live.

### 3.4 Animations Summary

| Element | Animation | Duration |
|---------|-----------|----------|
| TaskRow mount | `opacity 0→1, translateY 6→0`, staggered | `200ms + i*30ms` |
| Checkbox check | `scale 0.85→1`, fill color | `150ms` |
| Task completion | title strike + fade to 0.5 | `300ms` |
| TaskGroup collapse | `max-height` | `200ms ease` |
| TaskDetailPanel open | `translateX 100%→0` | `200ms ease-out` |
| BulkActionBar appear | `translateY 100%→0` | `150ms ease-out` |
| Filter change | rows fade out/in | `150ms` |

All via CSS transitions — no animation library added.

---

## 4. Out of Scope

- Drag-to-reorder (requires position field on tasks table — future)
- Real-time updates via websocket (future)
- Task recurrence
- File attachments on tasks
- Notifications/email for task assignment

---

## 5. Files Changed

### New
- `apps/api/src/routes/tasks-unified.ts`
- `apps/web/modules/tasks/components/TaskRow.tsx`
- `apps/web/modules/tasks/components/TaskGroup.tsx`
- `apps/web/modules/tasks/components/TaskDetailPanel.tsx`
- `apps/web/modules/tasks/components/TaskFilterBar.tsx`
- `apps/web/modules/tasks/components/BulkActionBar.tsx`
- `apps/web/modules/tasks/components/AddTaskModal.tsx`
- `apps/web/modules/tasks/components/TasksWidget.tsx`
- `apps/web/modules/tasks/lib/useUnifiedTasks.ts`
- `apps/web/modules/tasks/lib/taskMutations.ts`
- `apps/web/modules/tasks/index.ts`

### Modified
- `apps/web/app/(dashboard)/tasks/page.tsx` (thin shell)
- `apps/api/src/routes/index.ts` or equivalent (mount unified router)
- `apps/api/src/workers/task-due-notifier.ts` (add alert on overdue)
- Dashboard layout file (add TasksWidget)
