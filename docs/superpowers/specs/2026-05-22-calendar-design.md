# Calendar Feature Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a workspace calendar showing admin-configured events (holidays, company events) and each user's task due dates, with month/week/day views.

**Architecture:** New `calendar_events` table for admin events; task due dates pulled from existing tasks API. Custom CSS grid calendar (no external library) styled with Vantage design tokens. Admin manages events in `/settings/calendar`; all users view in `/calendar`.

**Tech Stack:** Next.js 14 App Router, TanStack Query, date-fns, Kysely/PostgreSQL, Express API.

---

## Data Model

### New table: `calendar_events`

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id  uuid NOT NULL REFERENCES workspaces(id)
title         varchar(255) NOT NULL
description   text
category      varchar(50) NOT NULL  -- 'holiday' | 'company_event' | 'meeting' | 'other'
color         varchar(7)            -- hex e.g. '#6366f1', nullable (falls back to category default)
start_date    date NOT NULL
end_date      date                  -- nullable = single day event
all_day       boolean NOT NULL DEFAULT true
created_by    uuid NOT NULL REFERENCES users(id)
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
```

**Category default colors:**
- `holiday` → `#ef4444` (red)
- `company_event` → `#6366f1` (indigo)
- `meeting` → `#8b5cf6` (purple)
- `other` → `#6b665c` (text2)

**No schema changes to tasks.** Calendar reads `due_date` directly from the tasks API.

---

## API Routes

All routes under `/api/calendar/events`. Workspace-scoped via `requireWorkspace` middleware.

```
GET    /api/calendar/events          List events in date range
POST   /api/calendar/events          Create event (admin only)
PATCH  /api/calendar/events/:id      Update event (admin only)
DELETE /api/calendar/events/:id      Delete event (admin only)
```

### GET /api/calendar/events

Query params:
- `start: date` (required) — inclusive start, ISO date string e.g. `2026-05-01`
- `end: date` (required) — inclusive end, e.g. `2026-05-31`

Returns all `calendar_events` where `start_date <= end` AND (`end_date >= start` OR `end_date IS NULL AND start_date >= start`).

Response: `{ data: CalendarEvent[], error: null }`

### POST /api/calendar/events

Body (Zod):
```typescript
{
  title: string (min 1),
  description: string (optional),
  category: enum ['holiday', 'company_event', 'meeting', 'other'],
  color: string (optional, hex regex /^#[0-9a-fA-F]{6}$/),
  start_date: string (ISO date),
  end_date: string (optional, ISO date, must be >= start_date),
  all_day: boolean (default true),
}
```

Returns 403 if `user.role !== 'admin'`.

### PATCH /api/calendar/events/:id

Same body fields, all optional. Returns 403 if not admin. Returns 404 if event not in workspace.

### DELETE /api/calendar/events/:id

Returns 403 if not admin. Returns 404 if event not in workspace.

---

## Frontend — File Structure

```
apps/web/
  app/(dashboard)/
    calendar/
      page.tsx                    — main calendar page
    settings/
      calendar/
        page.tsx                  — admin event management
  components/calendar/
    CalendarToolbar.tsx           — view switcher + prev/next/today nav
    MonthView.tsx                 — 7-col CSS grid, 5-6 week rows
    WeekView.tsx                  — 7-col grid with hour rows (7am–10pm)
    DayView.tsx                   — single column with hour rows
    EventChip.tsx                 — colored pill for admin events
    TaskChip.tsx                  — dashed-border chip for task due dates
    EventPopover.tsx              — detail popover on chip click
  lib/
    calendar.ts                   — API client functions
```

---

## Frontend — Calendar Page (`/calendar`)

### Data fetching

Two parallel queries on view range change:

```typescript
// Admin events for visible date range
useQuery(['calendar-events', start, end], () =>
  apiFetch(`/api/calendar/events?start=${start}&end=${end}`)
)

// Current user's tasks with due dates
useQuery(['tasks-calendar'], () =>
  apiFetch('/api/tasks?per_page=100&status=todo')
)
```

`start`/`end` are derived from the current view (month = first/last day of month with padding, week = Mon–Sun, day = that day).

### CalendarToolbar

```
[ < ]  May 2026  [ > ]   [ Today ]   [ Month | Week | Day ]
```

- Prev/next moves by 1 month / 1 week / 1 day depending on active view
- View switcher: three buttons, active state matches Vantage filter tab pattern (dark fill on active)

### MonthView

- CSS `display: grid; grid-template-columns: repeat(7, 1fr)`
- Header row: Mon Tue Wed Thu Fri Sat Sun
- Days from previous/next month shown in muted color (`var(--text3)`)
- Today's date cell: subtle ring or background highlight (`var(--bg)` + border)
- Per day: up to 3 chips visible, "+N more" overflow link → opens day detail panel
- Multi-day admin events span across columns using `grid-column: span N`

### WeekView

- 7 columns (days) + 1 time-label column
- Hour rows from 00:00–23:00
- Admin events positioned absolutely within their time slot (or as all-day bar at top)
- Task due dates shown in all-day bar row (no time component)
- All-day events: horizontal bar across applicable columns at top

### DayView

- Single column, same hour-row structure as WeekView
- Task chips in all-day row at top
- Admin events in time slots

### EventChip

```tsx
// Admin event
<span style={{
  background: color + '20',   // 12% opacity fill
  color: color,
  border: `1px solid ${color}40`,
  borderRadius: 4,
  padding: '1px 6px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
}}>
  {title}
</span>
```

### TaskChip

```tsx
// Task due date — visually distinct from admin events
<span style={{
  background: 'transparent',
  color: 'var(--text2)',
  border: '1px dashed var(--border)',
  borderRadius: 4,
  padding: '1px 6px',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
}}>
  ✓ {task.title}
</span>
```

### EventPopover

Appears on chip click, positioned relative to chip. Closes on outside click or Escape.

```
┌─────────────────────────────────┐
│ [Category badge]  [color dot]   │
│ Title                           │
│ May 26 – May 27, 2026           │
│ ─────────────────────────────── │
│ Description text (if any)       │
└─────────────────────────────────┘
```

Admin users see Edit / Delete buttons at bottom of popover.

---

## Frontend — Settings Calendar Page (`/settings/calendar`)

Admin-only. Added to settings layout tab list with `adminOnly: true`. Redirect guard added for `/settings/calendar`.

### Layout

```
┌── Heading: "Calendar Events"  ──────────── [+ Add Event] ──┐
│                                                             │
│  Table of events:                                          │
│  Title | Category | Dates | Color | Actions (edit/delete) │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Add/Edit Form (modal)

Fields:
- **Title** — text input (required)
- **Category** — select: Holiday / Company Event / Meeting / Other
- **Start date** — date input (required)
- **End date** — date input (optional, must be ≥ start date — validated client + server)
- **Color** — color picker input (`<input type="color">`) pre-seeded with category default; user can override
- **Description** — textarea (optional)

On submit: POST (create) or PATCH (edit). On success: invalidate `['calendar-events']` query and close modal.

### Delete

Inline confirmation per row (same pattern as pipeline/stage delete — show "Delete?" text + Yes/Cancel buttons inline).

---

## API Client (`lib/calendar.ts`)

```typescript
export interface CalendarEvent {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  category: 'holiday' | 'company_event' | 'meeting' | 'other';
  color: string | null;
  start_date: string;   // ISO date
  end_date: string | null;
  all_day: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function listCalendarEvents(token: string, start: string, end: string): Promise<{ data: CalendarEvent[] }>
export async function createCalendarEvent(token: string, body: Omit<CalendarEvent, 'id' | 'workspace_id' | 'created_by' | 'created_at' | 'updated_at'>): Promise<{ data: CalendarEvent }>
export async function updateCalendarEvent(token: string, id: string, body: Partial<...>): Promise<{ data: CalendarEvent }>
export async function deleteCalendarEvent(token: string, id: string): Promise<void>
```

---

## Navigation

- Sidebar: add **Calendar** link (calendar icon) between Tasks and Activity
- Settings layout: add **Calendar** tab (`adminOnly: true`) with redirect guard

---

## Migration

New file: `apps/db/migrations/20260522_001_calendar_events.ts`

Creates `calendar_events` table. No changes to existing tables.

---

## Category Default Colors

```typescript
export const CATEGORY_COLORS: Record<string, string> = {
  holiday: '#ef4444',
  company_event: '#6366f1',
  meeting: '#8b5cf6',
  other: '#6b665c',
};
```

Used in EventChip when `event.color` is null, and pre-seeded in the settings form color picker when category changes.
