# Project Management Polish — Design Spec

**Date:** 2026-06-14  
**Branch:** `feat/project-management`  
**Scope:** Frontend-only. No backend changes required.

---

## Overview

Five self-contained changes to the Project Management module:

| # | Change | Files |
|---|--------|-------|
| 1 | Nav expansion (primary + "More ▾") | `ProjectNav.tsx` |
| 2 | API client update for rich task creation | `modules/projects/lib/api.ts` |
| 3 | `TaskCreateModal` component | new `components/TaskCreateModal.tsx` |
| 4 | `AvatarGroup` component + assignee display in views | new `components/AvatarGroup.tsx`, board/list/table pages |
| 5 | UI polish — cards, rows, header, animations | view files + `layout.tsx` |

---

## 1. Navigation

### Pattern: Primary tabs + "More ▾" dropdown

**Primary tabs (always visible):**
```
Tasks | Roadmap | Milestones | Members | Docs
```

**"More ▾" dropdown (on click):**
```
Sprints
Calendar
Portal
Automation
Settings
```

### Behavior
- Active tab: `border-bottom: 2px solid var(--text)`, color `var(--text)`
- Inactive: color `var(--text3)`, no border
- Tab transition: `border-color 0.15s ease, color 0.15s ease`
- "More ▾" trigger: same style as inactive tab + `▾` glyph
- Dropdown: `position: absolute`, `var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 10px`, `box-shadow: 0 4px 16px rgba(0,0,0,0.08)`
- Dropdown animation: `transform: translateY(-4px)→0`, `opacity: 0→1`, `0.12s ease`
- Closes on outside click

### Routes (all already exist)
- `/projects/[id]/tasks` — Tasks
- `/projects/[id]/roadmap` — Roadmap
- `/projects/[id]/milestones` — Milestones
- `/projects/[id]/members` — Members
- `/projects/[id]/docs` — Docs
- `/projects/[id]/sprints` — Sprints
- `/projects/[id]/calendar` — Calendar (via TasksPage view switcher)
- `/projects/[id]/portal` — Portal (renders existing `PortalSettingsPage`)
- `/projects/[id]/automation` — Automation
- `/projects/[id]/settings` — Settings

---

## 2. API Client Update

File: `apps/web/modules/projects/lib/api.ts`

Update `createTask` signature:

```ts
createTask: (
  token: string,
  projectId: string,
  body: {
    title: string;
    status_id?: string;
    priority?: string;
    assignee_ids?: string[];
    due_date?: string | null;
  }
) => apiFetch<{ data: Task }>(...)
```

Backend `createTaskSchema` already accepts all these fields — no backend changes needed.

---

## 3. TaskCreateModal

File: `apps/web/modules/projects/components/TaskCreateModal.tsx`

### Trigger
"+ Add Task" button in board, list, and table views. Replaces any existing inline-add.

### Fields
| Field | Input type | Required |
|-------|-----------|----------|
| Title | text, autofocused | yes |
| Status | select (loads from `listStatuses`) | no (defaults to first status) |
| Priority | segmented control: LOW / MEDIUM / HIGH / URGENT | no |
| Assignees | member picker → renders AvatarGroup chips | no |
| Due Date | `input[type=date]` | no |

### Layout
- Centered overlay modal
- `width: 520px`, `border-radius: 12px`, `background: var(--surface)`
- Backdrop: `background: rgba(0,0,0,0.3)`
- Modal open animation: `opacity 0→1`, `scale 0.96→1`, `0.15s ease`
- Backdrop animation: `opacity 0→0.3`, `0.15s ease`

### Behavior
- Submit → `pmApi.createTask(token, projectId, { title, status_id, priority, assignee_ids, due_date })`
- On success: `queryClient.invalidateQueries(['tasks', projectId])`, close modal
- Escape / click-outside closes without saving
- Loading state: submit button disabled + spinner

### Assignee picker
- Fetches `GET /api/projects/:id/members` (existing endpoint)
- Dropdown list of workspace members with avatar initials + name
- Selected members render as `AvatarGroup` chips inside the field
- Click to toggle selection

---

## 4. AvatarGroup Component

File: `apps/web/modules/projects/components/AvatarGroup.tsx`

### Props
```ts
interface Props {
  assignees: { id: string; name: string; email: string }[];
  max?: number; // default 3
  size?: number; // default 24
}
```

### Rendering
- Stacked circles, each offset `-6px` left (overlap)
- Background: deterministic color from name hash, picks from 6 palette entries:
  `['#d8f3dc','#dbeafe','#fef3c7','#fee2e2','#ede9fe','#fce7f3']`
- Text color: matching dark tone from design system
- Initials: first char of first word + first char of last word (fallback: first 2 chars)
- Overflow: `+N` chip in `var(--surface2)` with `var(--text3)` text
- Tooltip on hover: full name(s), `opacity 0→1, 0.1s ease`
- No layout shift — wrapper always reserves `(size * max) - (6 * (max-1))` px width

### View integration

| View | Location |
|------|----------|
| Board | Bottom-right of task card, alongside priority badge |
| List | Dedicated "Assignees" column, right of title |
| Table | "Assignees" column cell |

`listTasks` API already joins `project_task_assignees` — data present, no API change needed.

---

## 5. UI Polish

### Global animation rule
All interactive elements:
```css
transition: background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
```

### Board — task cards
- `border-radius: 10px`, `background: var(--surface)`, `border: 1px solid var(--border)`
- Hover: `background: var(--surface2)`, `box-shadow: 0 2px 8px rgba(0,0,0,0.06)`
- Title: DM Sans 13px `var(--text)`
- Priority badge: top-right, colored dot + label
- Due date: bottom-left, DM Sans 12px `var(--text3)`; overdue → `var(--red)`
- AvatarGroup: bottom-right

### List — rows
- Clean single `border-bottom: 1px solid var(--border)`, no zebra
- Columns: `[ checkbox | title | status pill | priority | assignees | due date ]`
- Status pill: colored dot + name, `background: var(--surface2)`, `border-radius: 6px`, padding `2px 8px`
- Fixed-width "Assignees" column — no layout shift when empty

### Project header (layout.tsx)
- Progress bar: `height: 6px` (up from 4px)
- Health badge: padding `2px 8px`, tighten
- Breadcrumb: DM Sans 13px, color `var(--text2)` (up from `var(--text3)`)

### No layout shifts
- Avatar columns always reserve space
- Priority badge always present (NONE = transparent/no dot, same width)

---

## Out of Scope

- Module-level PM settings at `/settings/modules` — no module-level config identified; if needed, separate spec
- Mobile views — deferred until after web prod ships
- Automation page content — route surfaced in nav but page content unchanged
