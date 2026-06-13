# Project Management Module — Design Spec

**Date:** 2026-06-13  
**Status:** Draft  
**Scope:** Vencore monorepo — new first-class module  

---

## 1. Overview

A full-featured project management module built into every white-labeled Vencore instance. Each tenant gets isolated projects, teams, and data. Core differentiator: a native **Client Portal** — branded, permission-scoped, and client-facing — something no generic PM tool does well for white-label products.

No CRM integration. No agent/server-awareness. Those are future modules.

---

## 2. Architecture

### Approach

Standalone PM module. Lives in `apps/web` (UI) and `apps/api` (REST). Shares the existing:
- Auth & custom JWT (`apps/api`) — project roles extend existing group/permission system
- Notification & alert system — PM events feed into existing notification infrastructure
- Activity feed UI — per-project feeds reuse existing feed components
- Analytics/KPI components — reporting reuses existing chart components
- Task module UI — extended, not replaced
- Design system — all new UI uses existing typography, components

### New packages / modules

| Location | What |
|---|---|
| `apps/web/app/(dashboard)/projects/` | All PM UI routes |
| `apps/web/app/(portal)/` | Client portal — separate layout, no sidebar |
| `apps/api/src/modules/projects/` | Projects CRUD, members, roles |
| `apps/api/src/modules/tasks/` | Extended tasks (dependencies, custom fields, time tracking) |
| `apps/api/src/modules/milestones/` | Milestones + sprints |
| `apps/api/src/modules/portal/` | Portal access, tokens, client auth |
| `apps/api/src/modules/automation/` | Rule engine |
| `apps/worker/src/jobs/pm/` | Due-date alerts, sprint rollover, digest emails |

---

## 3. Data Model

### Project

```
Project {
  id            uuid PK
  tenant_id     uuid FK → Tenant
  name          string
  description   json          // block editor content
  cover_image   string?       // URL
  color         string?       // hex
  status        enum(ACTIVE, ARCHIVED, DELETED)
  health        enum(ON_TRACK, AT_RISK, OFF_TRACK)  // manually set or auto
  start_date    date?
  end_date      date?
  budget        decimal?      // optional
  created_by    uuid FK → User
  created_at    timestamp
  updated_at    timestamp
}
```

### Task (extends existing)

```
Task {
  id              uuid PK
  project_id      uuid FK → Project
  parent_id       uuid? FK → Task   // subtasks
  title           string
  description     json?             // block editor
  status_id       uuid FK → TaskStatus
  priority        enum(URGENT, HIGH, MEDIUM, LOW, NONE)
  assignees       TaskAssignee[]
  due_date        timestamp?
  start_date      timestamp?
  estimate_hours  decimal?
  logged_hours    decimal           // sum of TimeLog
  is_recurring    boolean
  recurrence_rule string?           // rrule string
  client_visible  boolean           // shown in client portal
  position        float             // ordering within column
  created_by      uuid FK → User
  created_at      timestamp
  updated_at      timestamp
}

TaskStatus {
  id          uuid PK
  project_id  uuid FK → Project
  name        string
  color       string
  position    int
  is_done     boolean   // completion counts toward progress
}

TaskDependency {
  task_id       uuid FK → Task
  depends_on_id uuid FK → Task
  type          enum(BLOCKS, RELATES_TO)
}

TaskLabel {
  id          uuid PK
  project_id  uuid FK → Project
  name        string
  color       string
}

TaskLabelAssignment {
  task_id   uuid FK → Task
  label_id  uuid FK → TaskLabel
}

CustomField {
  id          uuid PK
  project_id  uuid FK → Project
  name        string
  type        enum(TEXT, NUMBER, DATE, SELECT, MULTI_SELECT, CHECKBOX, URL)
  options     json?   // for SELECT types
  position    int
}

CustomFieldValue {
  task_id   uuid FK → Task
  field_id  uuid FK → CustomField
  value     json
}

TaskChecklist {
  id        uuid PK
  task_id   uuid FK → Task
  title     string
  done      boolean
  position  int
}

TimeLog {
  id          uuid PK
  task_id     uuid FK → Task
  user_id     uuid FK → User
  duration_m  int       // minutes
  logged_at   timestamp
  note        string?
  is_billable boolean
}

TaskAttachment {
  id          uuid PK
  task_id     uuid FK → Task
  filename    string
  url         string
  size_bytes  int
  uploaded_by uuid FK → User
  uploaded_at timestamp
  is_deliverable boolean  // flagged for client portal
}

TaskComment {
  id          uuid PK
  task_id     uuid FK → Task
  author_id   uuid FK → User | ClientPortalSession
  body        json     // block editor
  parent_id   uuid?    // thread reply
  created_at  timestamp
  updated_at  timestamp
}
```

### Milestone

```
Milestone {
  id             uuid PK
  project_id     uuid FK → Project
  name           string
  description    string?
  due_date       date
  status         enum(PENDING, COMPLETED, MISSED)
  client_visible boolean
  position       int
}

MilestoneTask {
  milestone_id uuid FK → Milestone
  task_id      uuid FK → Task
}
```

### Sprint

```
Sprint {
  id          uuid PK
  project_id  uuid FK → Project
  name        string
  start_date  date
  end_date    date
  status      enum(PLANNED, ACTIVE, COMPLETED)
  goal        string?
  velocity    int?   // story points completed
}

SprintTask {
  sprint_id uuid FK → Sprint
  task_id   uuid FK → Task
  points    int?
}
```

### Project Membership & Roles

```
ProjectMember {
  id         uuid PK
  project_id uuid FK → Project
  user_id    uuid? FK → User       // null for client members
  role       enum(OWNER, MANAGER, MEMBER, VIEWER)
  joined_at  timestamp
}
```

### Client Portal

```
PortalAccess {
  id            uuid PK
  project_id    uuid FK → Project
  label         string       // "Acme Corp portal"
  token         string UNIQUE // random, URL-safe
  password_hash string?      // optional protection
  is_active     boolean
  last_accessed timestamp?
  created_by    uuid FK → User
  created_at    timestamp
}

ClientPortalSession {
  id          uuid PK
  portal_id   uuid FK → PortalAccess
  ip          string?
  user_agent  string?
  started_at  timestamp
  last_seen   timestamp
}

ApprovalRequest {
  id           uuid PK
  project_id   uuid FK → Project
  portal_id    uuid FK → PortalAccess
  task_id      uuid? FK → Task
  milestone_id uuid? FK → Milestone
  attachment_id uuid? FK → TaskAttachment
  status       enum(PENDING, APPROVED, REJECTED)
  note         string?
  responded_at timestamp?
  created_at   timestamp
}
```

### Automation

```
AutomationRule {
  id          uuid PK
  project_id  uuid FK → Project
  name        string
  is_active   boolean
  trigger     json   // { type, conditions }
  actions     json   // [{ type, params }]
  created_by  uuid FK → User
}

AutomationLog {
  id         uuid PK
  rule_id    uuid FK → AutomationRule
  triggered_at timestamp
  success    boolean
  detail     string?
}
```

### Docs / Wiki

```
ProjectDoc {
  id         uuid PK
  project_id uuid FK → Project
  parent_id  uuid? FK → ProjectDoc
  title      string
  body       json      // block editor
  position   int
  created_by uuid FK → User
  updated_at timestamp
}
```

---

## 4. Features

### 4.1 Projects

- Create, edit, archive, delete (soft)
- Project templates: save any project as template, apply on creation
- Health status: manual override or auto-computed (task overdue rate)
- Progress %: `done_tasks / total_tasks`
- Tags: cross-project labels, filterable from global view
- Cover image + color per project
- Budget field (optional, displayed on project header)

### 4.2 Tasks

- Full CRUD with subtasks (1-level nesting minimum, n-level supported)
- Custom statuses per project (name, color, position, is_done flag)
- Priority levels: Urgent / High / Medium / Low / None
- Multi-assignee
- Due date + estimated hours
- Dependencies: blocks / blocked-by — visualized on Gantt
- Recurring tasks via rrule
- Labels (project-scoped)
- Checklist items inside task
- File attachments
- Comment threads with @mentions and reactions
- Activity log (every field change recorded)
- Time tracking: manual log or start/stop timer
- Custom fields: Text, Number, Date, Select, Multi-select, Checkbox, URL
- `client_visible` toggle — controls portal visibility
- Bulk edit (select multiple, change status/assignee/priority)
- Task templates

### 4.3 Views

All views share the same filter/sort state per project. User sets default per project.

| View | Details |
|---|---|
| Kanban | Drag-drop by status column, WIP limit per column, swimlanes by assignee/priority |
| List | Rows with inline edit, groupable by status/assignee/priority/label |
| Timeline (Gantt) | Horizontal bars, dependency arrows, drag to reschedule |
| Calendar | Monthly/weekly grid by due date, drag to reschedule |
| Table | Dense spreadsheet, bulk edit, custom field columns |
| Roadmap | Milestones only, quarter/month view, high-level |

### 4.4 Milestones

- Named checkpoints with due dates
- Auto-complete when all linked tasks hit a `is_done` status
- Visible on Timeline + Roadmap views
- `client_visible` toggle per milestone
- Milestone status: Pending / Completed / Missed (auto on overdue)

### 4.5 Sprints

- Create sprints with date range + goal
- Drag tasks from backlog into sprint
- Story points per sprint task (optional)
- Burndown chart per sprint
- Velocity: points completed per sprint, tracked over time
- Sprint close: incomplete tasks auto-carried to next sprint or returned to backlog (user chooses)

### 4.6 Members & Roles

Roles extend existing Group & Permission system:

| Role | Capabilities |
|---|---|
| Owner | Full control including delete project, manage portal |
| Manager | Edit everything, invite members, cannot delete project |
| Member | Work on assigned tasks, comment |
| Viewer | Read-only, internal only |
| Client | Portal-only, scoped to `client_visible` items |

Invite by email — org user or external (external becomes Viewer until assigned role).  
Client tokens are separate from user accounts.

### 4.7 Client Portal ★

**The differentiator.**

#### Access
- Each project can have one or more portal links (`PortalAccess`)
- Portal URL: `{tenant}.vencore.app/portal/{token}` or custom subdomain via tenant settings
- Optional password protection per portal
- Magic-link / token-based — no Vencore account required for client
- Revoke access anytime from project settings

#### Branding
- Inherits tenant white-label settings: logo, primary color, font
- No Vencore branding visible to client
- Optional custom portal title per project

#### Client View
- Only items where `client_visible = true` are shown
- Views available to client: Roadmap (milestones), Task list (filtered), Files/Deliverables
- Internal tasks, internal comments, internal members — never exposed
- Project health status + progress bar
- Activity feed filtered to client-relevant events

#### Client Actions
- Comment on visible tasks (threaded, same comment table, author = `ClientPortalSession`)
- Submit approval on deliverables (attachments flagged `is_deliverable = true`)
- Submit approval on milestones
- Download shared files
- View approval history

#### Approval Workflow
- Internal user creates `ApprovalRequest` linked to task / milestone / file
- Client sees "Awaiting your approval" banner in portal
- Client approves or rejects with optional note
- `ApprovalRequest` status updates, triggers automation if rule set
- Full approval audit log visible internally

#### Internal Controls
- "Preview as client" mode — see exactly what client sees
- Portal access log: last visited, session count, pages viewed
- Per-item `client_visible` toggle (task, milestone, file)
- Portal notification settings per portal link

#### Client Notifications
- Email digest: configurable (immediate / daily / weekly)
- "Since your last visit" summary on portal login
- Milestone reached email
- "Awaiting your approval" email

### 4.8 Notifications & Alerts

Extends existing notification system. New PM event types:

- @mention in task comment
- Task assigned to me
- Task due in 24h / 1h
- Task overdue
- Task status changed (for watchers)
- Milestone completed / missed
- Sprint started / ended
- Client commented in portal
- Client approved / rejected
- Approval requested

User-level notification preferences (per event type: in-app / email / none).  
Worker jobs handle due-date alerts + digest generation.

### 4.9 Automation

No-code rule builder in project settings.

**Triggers:**
- Task moved to status X
- Task due date passes (overdue)
- Task assigned to user
- Milestone completed
- Client approves / rejects
- Sprint starts / ends

**Actions:**
- Send notification to user(s) / client portal
- Change task status
- Assign task to user
- Create task from template
- Mark milestone complete
- Send webhook (URL + payload)

Rules are ordered, evaluated in sequence. Max 20 rules per project (prevent abuse).  
`AutomationLog` records every trigger for debugging.

### 4.10 Docs & Wiki

- Per-project wiki: nested pages (tree), rich block editor
- Inline images, code blocks, tables, embeds (URL → preview)
- Page history (last 30 versions)
- Deliverable library: files flagged `is_deliverable`, filterable, shareable to portal
- File version history: re-upload replaces but keeps prior versions

### 4.11 Analytics & Reporting

**Internal dashboards (extends existing KPI/analytics):**
- Project health dashboard: health, progress, overdue count, upcoming milestones
- Team workload: tasks per assignee, overdue + upcoming breakdown
- Burndown chart: sprint and project level
- Velocity chart: story points per sprint over time
- On-time delivery %: milestones hit on time vs missed
- Time report: logged vs estimated per task/assignee/project
- Task completion rate over rolling window

**Client-facing (portal):**
- Auto-generated progress report: milestone status, completion %, deliverables
- PDF export of progress report
- Milestone timeline visual (read-only Roadmap)

### 4.12 Search & Global Views

- Global search: tasks, docs, files across all projects in tenant
- Filter by: assignee, status, priority, label, project, due date range
- Saved filter views (per user, per project)
- **My Tasks**: cross-project view of everything assigned to current user
- **My Week**: tasks due this week across all projects
- **All Projects**: grid/list of all projects with health + progress

### 4.13 Templates

- Project templates: pre-built task lists + statuses + milestones + custom fields
- Save any project as template (strips member/date data, keeps structure)
- Task templates
- Org-level template gallery: shared across all projects in tenant
- Default templates shipped with module (e.g. "Software Sprint", "Client Delivery", "Event Planning")

---

## 5. API Design

RESTful. All routes under `/api/v1/projects/`.

```
GET    /projects                          list all (tenant-scoped)
POST   /projects                          create
GET    /projects/:id                      get
PATCH  /projects/:id                      update
DELETE /projects/:id                      archive/delete

GET    /projects/:id/tasks                list (with filters)
POST   /projects/:id/tasks                create
PATCH  /projects/:id/tasks/:taskId        update
DELETE /projects/:id/tasks/:taskId        delete
POST   /projects/:id/tasks/bulk           bulk update

GET    /projects/:id/milestones           list
POST   /projects/:id/milestones           create
PATCH  /projects/:id/milestones/:mId      update

GET    /projects/:id/sprints              list
POST   /projects/:id/sprints              create
POST   /projects/:id/sprints/:sId/close   close sprint

GET    /projects/:id/members              list
POST   /projects/:id/members/invite       invite
PATCH  /projects/:id/members/:mId         change role
DELETE /projects/:id/members/:mId         remove

GET    /projects/:id/portal               list portal links
POST   /projects/:id/portal               create portal link
DELETE /projects/:id/portal/:pId          revoke

GET    /projects/:id/automations          list rules
POST   /projects/:id/automations          create rule
PATCH  /projects/:id/automations/:rId     update
DELETE /projects/:id/automations/:rId     delete

GET    /projects/:id/docs                 list wiki pages
POST   /projects/:id/docs                 create page
PATCH  /projects/:id/docs/:docId          update page

GET    /projects/:id/analytics            project analytics summary
GET    /projects/:id/analytics/burndown   burndown data
GET    /projects/:id/analytics/workload   workload data

# Client Portal (separate auth — portal token, not JWT)
GET    /portal/:token                     portal handshake + branding
POST   /portal/:token/auth                password auth (if protected)
GET    /portal/:token/project             portal project view
GET    /portal/:token/tasks               visible tasks
GET    /portal/:token/milestones          visible milestones
GET    /portal/:token/files               deliverables
POST   /portal/:token/comments            client comment
POST   /portal/:token/approvals/:id/respond  approve/reject

# Cross-project
GET    /tasks/mine                        my tasks across all projects
GET    /tasks/week                        my week view
GET    /search                            global search
```

---

## 6. Client Portal Auth

Portal routes use a separate auth path — not the existing JWT middleware.

- `GET /portal/:token` validates token, returns tenant branding + project basics
- If password-protected: returns `{ requiresPassword: true }`, client POSTs password
- On success: issues short-lived signed cookie (`portal_session_id`) — no JWT
- All `/portal/:token/*` routes validate `portal_session_id` + token ownership
- Sessions stored in `ClientPortalSession`, expire after 7 days inactivity

---

## 7. Real-time

Use existing WebSocket / SSE infrastructure (if present) or add SSE endpoint:

- Task status changes → push to all project members viewing that task/board
- New comment → push to open task views
- Client approval → push to internal project members
- Board columns update in real-time (no manual refresh)

---

## 8. Worker Jobs (apps/worker)

New PM jobs:

| Job | Schedule | What |
|---|---|---|
| `pm-due-date-alerts` | Every 15 min | Find tasks due in 24h/1h, emit notifications |
| `pm-overdue-scan` | Hourly | Mark overdue tasks, alert assignees |
| `pm-digest-email` | Daily 8am (tenant TZ) | Generate + send weekly/daily digests |
| `pm-sprint-rollover` | On sprint end | Move incomplete tasks per user setting |
| `pm-health-auto` | Hourly | Recompute project health from overdue % |
| `pm-automation-eval` | Event-driven | Evaluate automation rules on trigger events |

---

## 9. UI Routes

```
/projects                          all projects grid
/projects/new                      create project
/projects/:id                      project home (health, recent activity)
/projects/:id/board                kanban view
/projects/:id/list                 list view
/projects/:id/timeline             gantt view
/projects/:id/calendar             calendar view
/projects/:id/table                table view
/projects/:id/roadmap              roadmap view
/projects/:id/tasks/:taskId        task detail panel (slide-over)
/projects/:id/milestones           milestones list
/projects/:id/sprints              sprint management
/projects/:id/docs                 wiki
/projects/:id/docs/:docId          wiki page
/projects/:id/files                deliverable library
/projects/:id/analytics            project analytics
/projects/:id/settings             project settings
/projects/:id/settings/portal      portal management
/projects/:id/settings/automation  automation rules
/projects/:id/settings/members     member management
/projects/:id/settings/statuses    custom statuses
/projects/:id/settings/fields      custom fields

# Global views
/my-tasks                          my tasks across projects
/my-week                           my week view

# Client Portal (separate layout — no sidebar, white-labeled)
/portal/:token                     portal home
/portal/:token/tasks               tasks view
/portal/:token/roadmap             milestone roadmap
/portal/:token/files               deliverables
/portal/:token/approvals           approval requests
```

---

## 10. Out of Scope (this spec)

- CRM integration
- Agent / server-awareness (deployments → task status)
- Mobile app
- Public API for PM data
- Billing / invoice generation
- AI features (auto-assign, deadline prediction)
- GitHub / GitLab PR linking
- Import from Jira / Linear / Asana

These are additive and do not require architecture changes to implement later.

---

## 11. Open Questions

None — spec is complete for initial implementation.
