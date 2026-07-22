# Design: rbac3 Enforcement Across All Feature Modules

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan

## Problem

The rbac3 permission system (roles → `role_permissions` → inheritance closure →
session roles → `requirePermission(perm)` middleware) already **declares**
granular permissions for every module and **enforces** them in CRM, messaging,
analytics, dashboards, and admin routes.

Two areas declare permissions but do **not** enforce them:

1. **Projects / PM** — ~18 route files are mounted bare (e.g.
   `createProjectsRouter(db)` with only `requireAuth`). The projects module
   declares 22 `projects:*` / `pm.*` permissions that no route checks. Any
   authenticated user in the workspace can perform every project action.
2. **Infra stray routes** — `alerts`, `alert-thresholds`, `infra-databases` are
   gated by `requireInfraFeature(...)` (module-enabled check) but have **no
   permission gate**, so the declared `alerts:*` / `databases:*` permissions
   (view vs acknowledge vs resolve vs configure) are not honored.

The (mistaken) original framing was that Project Management was the module with
"full RBAC". The code shows the opposite: it is the module **missing** rbac3
enforcement, relying instead on a separate, weaker `project_members` model.

**No new permissions need to be declared** — the taxonomy already exists in
`packages/modules/src/*/index.ts`. This work is pure enforcement wiring.

## Goal

Make rbac3 permission enforcement uniform across all feature modules: every
mutating/reading project + infra endpoint checks the permission its module
already declares, using the exact pattern CRM/infra already use.

## Non-Goals

- **`project_members` model is not removed or merged.** The per-project
  OWNER/MANAGER/MEMBER/VIEWER membership stays as an orthogonal row-scoping
  layer (which projects/rows a user sees). rbac3 is the workspace-level
  action gate (what actions a user may perform). The two are layered, not
  unified. (Exception: member-mutation routes gain a `projects:admin` gate —
  see below — because they are currently completely ungated.)
- **Platform/admin routes are out of scope** (follow-up): `api-keys`,
  `webhooks`, `plugins`, `notifications`, `settings/*`, `hub/*`,
  `workspace/modules`, `cross-module-settings`, `sidebar`, `sse`. Several
  already use `requireAdmin`. A later effort maps them to `apikeys:manage`,
  `plugins:manage`, `integrations:manage`, etc.
- No changes to the rbac3 core (`middleware/permission.ts`, `lib/rbac/*`,
  module permission declarations).

## Approach

**Chosen: thread `requirePermission` into each router factory** — identical to
the existing CRM/infra pattern (`createContactsRouter(db, requirePermission)`).

- Change factory signature: `createXRouter(db)` → `createXRouter(db, requirePermission)`.
- Add a per-endpoint gate: `router.post('/', requirePermission('pm.tasks:create'), handler)`.
- Update the mount in `apps/api/src/index.ts`.

`requirePermission` is workspace-level and independent of `:projectId`; it does
not need the project id in the path. Row-scoping by project stays wherever it
already exists via `project_members`.

**Rejected alternatives:**

- **Coarse single gate at mount** (`app.use('/api/projects', requirePermission('projects:view'), ...)`)
  — collapses view vs create vs delete into one permission, discarding the
  granular taxonomy the module already encodes.
- **Declarative route→permission table applied by a wrapper** — introduces a new
  abstraction inconsistent with the rest of the codebase. YAGNI.

## Endpoint → Permission Map

### Projects core — `projects.ts` (+ statuses, labels), `project-widget-stats.ts`
| Endpoint | Permission |
|---|---|
| GET list / GET one / widget-stats | `projects:view` |
| POST create | `projects:create` |
| PATCH update | `projects:edit` |
| archive | `projects:archive` |
| DELETE | `projects:delete` |
| statuses / labels create/update/delete | `projects:edit` |

### Tasks — `project-tasks.ts`, `me/tasks` (MyTasks), task field-values, `recurring-rules.ts`
| Endpoint | Permission |
|---|---|
| GET tasks / my-tasks / field-value read | `pm.tasks:view` |
| POST create | `pm.tasks:create` |
| PATCH edit / field-value write / recurring-rule create+edit | `pm.tasks:edit` |
| assignment change | `pm.tasks:assign` |
| DELETE | `pm.tasks:delete` |

### Sprints — `sprints.ts`
| Endpoint | Permission |
|---|---|
| GET | `pm.sprints:view` |
| create / update / delete | `pm.sprints:manage` |

### Milestones — `milestones.ts`
| Endpoint | Permission |
|---|---|
| GET | `pm.milestones:view` |
| create / update / delete | `pm.milestones:manage` |

### Time — `time-logs.ts`, `time-summary`
| Endpoint | Permission |
|---|---|
| log time (create/edit own) | `pm.time:log` |
| time-summary / view all users' time | `pm.time:view_all` |

### Portal / Docs / Automation
| Endpoint | Permission |
|---|---|
| portal-internal manage (`portal.ts` internal router) | `pm.portal:manage` |
| approvals respond | `pm.approvals:respond` |
| public `/api/portal` (token-auth) | **unchanged — stays unauthenticated by JWT token, no rbac3** |
| docs GET | `pm.docs:view` |
| docs create/update/delete | `pm.docs:edit` |
| automations + automation-logs | `pm.automations:manage` |

### Settings-ish — `project-members.ts`, project `custom-fields.ts`, `project-templates.ts`, `save-as-template`, `pm-search.ts`, `pm-analytics.ts`
| Endpoint | Permission |
|---|---|
| members GET | `projects:view` |
| members invite / update-role / remove | `projects:admin` |
| custom-fields read | `projects:view` |
| custom-fields manage | `projects:admin` |
| templates list | `projects:view` |
| save-as-template / template manage | `projects:admin` |
| pm/search | `projects:view` |
| pm-analytics | `projects:view` |

### Infra stray — `alerts.ts`, `alert-thresholds.ts`, `infra-databases.ts`
| Endpoint | Permission |
|---|---|
| alerts GET | `alerts:view` |
| alert acknowledge | `alerts:acknowledge` |
| alert resolve | `alerts:resolve` |
| alert-thresholds (all) | `alerts:configure` |
| databases GET | `databases:view` |
| databases create | `databases:create` |
| databases edit | `databases:edit` |
| databases delete | `databases:delete` |

(Existing `requireInfraFeature(...)` module-enabled gate is kept; the permission
gate is added alongside it, matching how `servers.ts`/`websites.ts` already
combine both.)

## Testing

Mirror the established route-test pattern (`contacts.test.ts`): for each
converted router, assert:

- request with a role lacking the permission → **403** `{ error: { code: 'FORBIDDEN' } }`
- request with a role holding the permission → **2xx**
- superuser / `grants_all` role → **2xx** (bypass)

Extend existing files where present (`projects.test.ts`, `sprints.test.ts`,
`milestones.test.ts`, `time-logs.test.ts`, `project-tasks.test.ts`,
`portal.test.ts`, `automation.test.ts`, `project-widget-stats.test.ts`) and add
tests for infra stray routes.

## Implementation Phasing

Sizable (≈21 route files, each: signature change + per-endpoint gates + mount
update + tests). Split into reviewable phases:

1. **Projects core** — projects, statuses, labels, widget-stats
2. **Tasks & time** — project-tasks, me/tasks, field-values, recurring-rules, time-logs, time-summary
3. **Sprints & milestones**
4. **Portal, docs, automation**
5. **Members, templates, custom-fields, pm-search, pm-analytics**
6. **Infra stray** — alerts, alert-thresholds, infra-databases

Each phase is independently mergeable and leaves the app in a working state.

## Post-Implementation

Run `Update Graphify` after wiring (new cross-file relationships:
routes → `requirePermission`).
