# Projects Module — Production Revamp Design Spec
**Date:** 2026-06-20  
**Status:** Approved  

---

## Overview

Bring the existing Projects (PM) module up to production standards across four milestone PRs: wire it into the platform's cross-cutting systems (Activity feed, Alerts, Notifications, Dashboard Widgets), close out its known feature gaps (recurring tasks, drag-to-reorder, subtask nesting, clickable Gantt, time tracking, custom fields, automation UI, client approvals), add full-automation CRM linking, and apply a CSS-transition animation polish pass — no new animation library.

---

## PR Sequence

| PR | Name | Ships | Depends on |
|---|---|---|---|
| **1** | Foundation: Hooks + Widget | `emitsAlerts` flag, comprehensive ActivityType additions, `logActivity` calls across all PM routes, `createAlert` for overdue/at-risk, `notify()` helper, ProjectsWidget, animation baseline | — |
| **2** | Daily-use features | Recurring task rules + worker, drag-to-reorder (board + list), subtask nesting (1-level), clickable Gantt bars, enriched TaskDetailPanel | PR1 |
| **3** | Power features | Time tracking UI + project time report, custom fields UI (manager + renderers + table columns), richer automation rules UI (visual rule builder + log viewer) | PR1 |
| **4** | Cross-module wow | CRM full-automation linking (deal-close auto-spawn, project-complete deal-stage), client-approval email-link flow, final animation polish pass | PR1-3 |

---

## Scope Decisions (Constraints)

- Recurring tasks: editing/deleting a rule only affects future generation; existing instances are untouched.
- Subtask nesting: 1 level max (task + subtasks). Depth enforced API-side.
- Client approvals: email-link flow with signed JWT tokens, no portal login required.
- CRM linking: full automation — deal close spawns project, project completion changes deal stage. All opt-in via settings toggles.
- Cross-module hooks: opt-in via settings toggles in the respective module. Activity logging is always-on (standard pattern).
- Infra/Servers ↔ Projects linking: explicitly out of scope.
- Animations: CSS transitions only, matching the Tasks revamp approach. No framer-motion.

---

## PR1 — Foundation: Hooks + Widget

### 1.1 Module Registry

`packages/modules/src/projects/index.ts` — add `emitsAlerts: true`. The existing auto-discovering settings UI (`module-event-settings` route) auto-shows activity + alert toggles for Projects.

### 1.2 ActivityType Additions

Extend the union in `apps/api/src/lib/log-activity.ts` and `packages/types/src/index.ts`:

```
| 'project_created'
| 'project_updated'
| 'project_archived'
| 'pm_task_created'
| 'pm_task_assigned'
| 'pm_task_status_changed'
| 'pm_comment_added'
| 'milestone_created'
| 'milestone_completed'
| 'sprint_started'
| 'sprint_ended'
```

Column is `varchar(30)` — no migration needed.

### 1.3 logActivity Wiring

| Route file | Event | When |
|---|---|---|
| `projects.ts` | `project_created` | After INSERT |
| `projects.ts` | `project_updated` | After UPDATE |
| `projects.ts` | `project_archived` | Status → ARCHIVED/DELETED |
| `project-tasks.ts` | `pm_task_created` | After INSERT |
| `project-tasks.ts` | `pm_task_assigned` | Assignees added/changed |
| `project-tasks.ts` | `pm_task_status_changed` | status_id changes (supplements existing `task_done`) |
| `project-tasks.ts` | `pm_comment_added` | After comment INSERT |
| `milestones.ts` | `milestone_created` | After INSERT |
| `milestones.ts` | `milestone_completed` | Status → COMPLETED |
| `sprints.ts` | `sprint_started` | Status → ACTIVE |
| `sprints.ts` | `sprint_ended` | Status → COMPLETED |

All pass `source_module_id: 'projects'` for toggle control.

### 1.4 Alert Wiring

| Scenario | Severity | resourceType | Location |
|---|---|---|---|
| Task overdue (due_date < today, not done) | `warning` | `projects` | New worker `pm-due-alert.ts` (daily) |
| Milestone at risk (due within 3 days, not COMPLETED) | `warning` | `projects` | Same worker |
| Project health → AT_RISK or OFF_TRACK | `warning` | `projects` | `projects.ts` PATCH handler |

All pass `sourceModuleId: 'projects'`. Widen the type assertion in `alert-service.ts:43` to include `'projects'`.

### 1.5 Notification Helper

New file: `apps/api/src/lib/notify.ts`

```ts
interface NotifyParams {
  db: Kysely<Database>;
  workspaceId: string;
  userId: string;
  title: string;
  body: string;
  link?: string;
  sourceModuleId?: string;
}

export async function notify(params: NotifyParams): Promise<void>
```

Inserts into `notifications` table + looks up user's push tokens/preferences and calls `sendPush()`.

### 1.6 ProjectsWidget

**Data endpoint:** `GET /api/projects/widget-stats`

```ts
{
  data: {
    active_count: number;
    at_risk_count: number;
    overdue_tasks_count: number;
    upcoming_milestones: Array<{
      id: string;
      name: string;
      project_name: string;
      due_date: string;
      status: string;
    }>;
  }
}
```

**Widget:** `apps/web/modules/projects/components/ProjectsWidget.tsx`
- 3 StatTile chips: Active (blue), At Risk (amber), Overdue Tasks (red)
- Upcoming milestones list (up to 3, due within 14 days)
- Empty state: "No active projects"
- Footer: "View all projects" → `/projects`
- Registration: `id: 'core:projects'`, `defaultW: 4`, `defaultH: 4`, `minW: 3`, `minH: 3`
- Added to `register-module-widgets.ts`

### 1.7 Animation Baseline

- ProjectsPage card mount: `opacity 0→1, translateY 6→0`, staggered `index * 30ms`, `200ms ease`
- Board column cards: same stagger
- Status badge pulse dot for at-risk/off-track
- Row hover: `background` transition `0.12s`

### 1.8 Files (PR1)

**New:** `apps/api/src/lib/notify.ts`, `apps/api/src/workers/pm-due-alert.ts`, `apps/api/src/routes/project-widget-stats.ts`, `apps/web/modules/projects/components/ProjectsWidget.tsx`

**Modified:** `packages/modules/src/projects/index.ts`, `apps/api/src/lib/log-activity.ts`, `packages/types/src/index.ts`, `apps/api/src/lib/alert-service.ts`, `apps/api/src/routes/projects.ts`, `apps/api/src/routes/project-tasks.ts`, `apps/api/src/routes/milestones.ts`, `apps/api/src/routes/sprints.ts`, `apps/api/src/index.ts`, `apps/web/modules/shared/lib/register-module-widgets.ts`, `apps/web/modules/projects/pages/ProjectsPage.tsx`, `apps/web/modules/projects/pages/ProjectBoardPage.tsx`

---

## PR2 — Daily-use Features

### 2.1 Recurring Task Rules

**Migration** — new table `recurring_task_rules`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | cascade |
| `title` | varchar(500) NOT NULL | |
| `description` | text | |
| `priority` | varchar(20) DEFAULT 'NONE' | |
| `status_id` | uuid FK → project_task_statuses | restrict |
| `assignee_ids` | jsonb DEFAULT '[]' | array of user UUIDs |
| `frequency` | varchar(20) NOT NULL | daily / weekly / biweekly / monthly |
| `day_of_week` | integer | 0-6 for weekly/biweekly |
| `day_of_month` | integer | 1-31 for monthly |
| `next_run_at` | timestamptz NOT NULL | scheduling cursor |
| `is_active` | boolean DEFAULT true | |
| `created_by` | uuid FK → users | cascade |
| `created_at` | timestamptz DEFAULT now() | |

**Worker:** `recurring-task-generator.ts` — runs hourly, queries rules where `is_active = true AND next_run_at <= now()`, creates task instances, advances `next_run_at`.

**API:**

| Method | Path |
|---|---|
| `GET` | `/api/projects/:pid/recurring-rules` |
| `POST` | `/api/projects/:pid/recurring-rules` |
| `PATCH` | `/api/projects/:pid/recurring-rules/:rid` |
| `DELETE` | `/api/projects/:pid/recurring-rules/:rid` |

**UI:** `RecurringRuleModal.tsx` (frequency radio cards, day selector, title/priority/assignee), `RecurringRulesPanel.tsx` (list in project settings). Repeat icon on generated tasks.

### 2.2 Drag-to-Reorder

`project_tasks.position` (real) already exists — fractional indexing.

**Board:** native HTML drag-and-drop. Drop within column recomputes position as midpoint. Drop across columns also updates `status_id`. Optimistic updates. Drop zone: `2px dashed var(--border)` `0.15s`. Card lift: `box-shadow` + `scale(1.02)` `0.15s`.

**List:** vertical drag within status group. Grip-dot handle on hover. Drop indicator: thin blue line.

**Bulk reorder endpoint:** `PATCH /api/projects/:pid/tasks/reorder` — body: `{ items: [{ id, position, status_id? }] }`

### 2.3 Subtask Nesting (1-level)

`project_tasks.parent_id` already exists.

**List:** subtasks indented 28px with left-border connector. Parent gets collapse chevron + subtask count badge. `max-height` transition `0.2s ease`.

**Board:** subtasks nested inside parent card. Progress bar: `completed / total`.

**Depth enforcement:** POST/PATCH handler rejects if target parent is itself a subtask (has non-null `parent_id`).

**Grouping:** flat response with `parent_id`, frontend groups.

### 2.4 Clickable Gantt Bars

`GanttChart.tsx` changes:
- `onClick` on each bar → opens TaskDetailPanel
- Hover: `opacity 0.8→1` + tooltip (title, dates, assignee)
- Bar color by priority: URGENT=red, HIGH=amber, MEDIUM=blue, LOW/NONE=project color
- Subtask bars: 60% height, nested below parent

### 2.5 Enriched TaskDetailPanel

Slide in `translateX(100%→0)` `0.2s ease-out`. Sections: title (editable), status dropdown, priority dropdown, assignees (multi-select), due/start date pickers, description textarea, subtasks list (add/toggle/delete), checklist items, comments thread, time logs (read-only, editable in PR3), custom fields (read-only, editable in PR3). Activity mini-feed: last 5 entries for this task. Close on Escape + backdrop click.

### 2.6 Files (PR2)

**New:** `packages/db/migrations/YYYYMMDD_recurring_task_rules.ts`, `apps/api/src/workers/recurring-task-generator.ts`, `apps/api/src/routes/recurring-rules.ts`, `apps/web/modules/projects/components/RecurringRuleModal.tsx`, `apps/web/modules/projects/components/RecurringRulesPanel.tsx`, `apps/web/modules/projects/components/DragHandle.tsx`

**Modified:** `apps/api/src/routes/project-tasks.ts`, `apps/api/src/index.ts`, `ProjectBoardPage.tsx`, `ProjectListPage.tsx`, `GanttChart.tsx`, `TaskDetailPanel.tsx`, `TaskCreateModal.tsx`, `CalendarPage.tsx`, `SettingsPage.tsx`

---

## PR3 — Power Features

### 3.1 Time Tracking UI

Tables `time_logs`, API routes already exist. Add project-level rollup endpoint:

`GET /api/projects/:pid/time-summary` — aggregate total hours by member, by task, by week.

**TaskDetailPanel:** "Time" section — log form (hours + minutes + note), entry list (avatar, duration, note, date, delete own), total at header.

**Time report page:** `TimeTrackingPage.tsx` at `/projects/[id]/time`. Member breakdown table, task breakdown table, date range filter (week/month/sprint/custom). Add "Time" to ProjectNav.

**Activity:** `pm_time_logged` type added.

### 3.2 Custom Fields UI

Tables `custom_fields`, `custom_field_values` already exist. API routes exist.

**CustomFieldsManager.tsx:** field list (name, type badge, options preview), add/edit/delete inline. Max 20 per project.

**CustomFieldRenderer.tsx:** renders by type — text input, number input, date picker, select dropdown, boolean toggle. Values save on blur/change (debounced 500ms for text/number).

**TaskDetailPanel:** custom fields section below core fields.

**TablePage.tsx:** custom fields as additional sortable/editable columns.

### 3.3 Richer Automation UI

**New action types:** `create_alert` (severity + message template → calls `createAlert()`), `send_push_notification` (user_ids + title + body → calls `notify()`).

**RuleCard:** name, active toggle, trigger/action summaries, last triggered, run count. Click to expand. `max-height` `0.25s ease`.

**RuleBuilder:** Step 1 — trigger dropdown with contextual sub-fields (status picker for `task_status_changed`, milestone picker for `milestone_completed`). Step 2 — add 1+ action cards (notification user picker + message with variable chips, status picker, user picker, milestone picker, URL + payload editor, severity radio + message, push title + body). Visual connector line between trigger and actions.

**AutomationLogViewer:** last 20 `automation_logs` entries. Rule name, time, success/fail badge, expandable detail. New endpoint: `GET /api/projects/:pid/automation-logs?limit=20`.

### 3.4 Files (PR3)

**New:** `TimeTrackingPage.tsx`, `projects/[id]/time/page.tsx`, `project-time-summary.ts`, `CustomFieldsManager.tsx`, `CustomFieldRenderer.tsx`, `RuleBuilder.tsx`, `RuleCard.tsx`, `AutomationLogViewer.tsx`, `automation-logs.ts`

**Modified:** `automation.ts`, `automation-engine.ts`, `AutomationPage.tsx`, `TaskDetailPanel.tsx`, `TablePage.tsx`, `SettingsPage.tsx`, `ProjectNav.tsx`, `log-activity.ts`, `packages/types/src/index.ts`

---

## PR4 — Cross-module Wow

### 4.1 CRM Full-Automation Linking

**Migration:** add `deal_id`, `contact_id`, `company_id` (nullable FKs) to `projects`. New table `cross_module_settings` (workspace_id, key, enabled, config jsonb, unique on workspace_id+key).

**Settings keys:**

| Key | Default | Effect |
|---|---|---|
| `crm.deal_close_spawn_project` | false | Deal → won auto-creates project (from template if `config.template_id` set) |
| `crm.show_project_health` | false | Show linked project health on deal/contact detail pages |
| `pm.deal_link_enabled` | true | Show deal/contact/company link fields on project forms |
| `pm.project_complete_deal_stage` | false | Project completed → change linked deal to `config.stage` |

**Deal-close hook:** in deals PATCH handler, after stage → `won`: check setting, create project with `deal_id`/`contact_id`/`company_id`, clone template if configured, fire `logActivity` + `notify()` to deal owner.

**Project-complete hook:** in projects PATCH handler, after status → COMPLETED/ARCHIVED: check setting, update linked deal stage, fire `logActivity`.

**CRM UI:** `LinkedProjectCard.tsx` on deal detail (project name, health badge, completion bar, next milestone). `ContactProjectsCard.tsx` on contact detail (project list with health dots). CRM settings: "Projects Integration" section with toggles + template picker.

### 4.2 Client Approval Email-Link Flow

`approval_requests` table already exists with the right shape.

**Signed tokens:** JWT with `{ aid: approval_id, act: 'approve'|'reject' }`, 7-day expiry.

**API:**

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/projects/:pid/approvals` | Session JWT |
| `GET` | `/api/projects/:pid/approvals` | Session JWT |
| `GET` | `/api/portal/approve/:token` | Signed token |
| `POST` | `/api/portal/approve/:token` | Signed token |

**Email:** follows `send-alert-email.ts` pattern. Workspace branding, task/milestone title, approve/reject CTA buttons.

**Landing page:** `apps/web/app/portal/approve/[token]/page.tsx` — public, token-validated server-side. Shows workspace logo, approval details, attachments list, approve/reject buttons, optional note textarea. Success confirmation after action.

**PM events:** fires `client_approved`/`client_rejected` (already defined in `pm-events.ts`), feeds automation engine. `logActivity` with `pm_approval_responded`. `notify()` to project owner.

**UI:** "Request Approval" button in TaskDetailPanel (when `client_visible = true`). Modal: portal picker, message, send. Approval status badge on task cards/rows: PENDING (amber), APPROVED (green), REJECTED (red). `ApprovalsPanel.tsx` for management.

### 4.3 Final Animation Polish

| Element | Animation |
|---|---|
| ProjectsPage cards | `opacity 0→1, translateY(6→0)`, staggered `i*30ms`, `200ms` |
| Board column cards | Same stagger |
| Board drag | `scale(1.02) + shadow` lift, `dashed border` drop zone, `0.15s` |
| List rows | Same opacity+translateY stagger |
| Subtask expand | `max-height` `0.2s ease` |
| Calendar month change | `opacity` crossfade `0.2s` |
| Gantt bar hover | `opacity 0.8→1 + tooltip fade` `0.15s` |
| TaskDetailPanel | `translateX(100%→0)` `0.2s ease-out`, backdrop `opacity 0→0.3` `0.15s` |
| RuleBuilder expand | `max-height + opacity` `0.25s ease` |
| All modals | `opacity 0→1, scale(0.97→1)` `0.15s ease-out` |
| Stat tiles (widget) | Count-up animation |
| Status badges | Pulse dot `scale(1→1.3→1)` `2s infinite` |
| Tab indicator | `left + width` `0.2s ease` |

All CSS transitions/keyframes — no framer-motion.

### 4.4 Files (PR4)

**New:** `packages/db/migrations/YYYYMMDD_crm_project_link.ts`, `cross-module-settings.ts`, `approval-requests.ts`, `portal-approve.ts`, `portal/approve/[token]/page.tsx`, `ApprovalsPanel.tsx`, `ApprovalRequestModal.tsx`, `ApprovalBadge.tsx`, `LinkedProjectCard.tsx`, `ContactProjectsCard.tsx`

**Modified:** `projects.ts`, `pipeline-items.ts`, `log-activity.ts`, `packages/types/src/index.ts`, `apps/api/src/index.ts`, `TaskDetailPanel.tsx`, `ProjectBoardPage.tsx`, `ProjectListPage.tsx`, `NewProjectPage.tsx`, `SettingsPage.tsx`, `ProjectNav.tsx`, CRM settings page, deal detail page, contact detail page, all project pages (animation pass)

---

## Edge Case Decisions

| Edge case | Decision |
|---|---|
| Recurring rule edited/deleted | Only affects future generation; existing task instances untouched |
| Subtask nesting depth | 1 level max, enforced API-side (reject if parent has non-null parent_id) |
| Client approval surface | Email-link with signed JWT, no portal login required |
| CRM toggle default for new workspaces | All off except `pm.deal_link_enabled` (true) |
| Toggling off cross-module setting | Stops new links/alerts/spawns; existing records remain visible |
| Approval token expiry | 7 days; expired token shows "link expired, contact your team" |
| Custom fields limit | 20 per project, enforced API-side |
