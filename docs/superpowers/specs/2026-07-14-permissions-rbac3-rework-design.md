# Permissions Rework — Full RBAC (NIST RBAC3)

**Date:** 2026-07-14
**Status:** Approved design — ready for implementation planning
**Scope:** `packages/db`, `packages/types`, `packages/modules`, `packages/api-client`, `apps/api`, `apps/web`

---

## 1. Problem

The current permissions surface is broken and under-powered:

1. **Both editor pages crash.** `GET /api/users/:id/permissions` and `GET /api/groups/:id` return permissions as a **flat array** (`{key,label,moduleId,moduleName,effectivelyGranted,isOverride}`), but `UserPermissionsEditor` / `GroupPermissionsEditor` expect **grouped `ModuleBlock[]`** with `.permissions[]` and `.granted`. `mod.permissions.map` runs on `undefined` → runtime crash. This is the "pages don't work" / "doesn't show up in groups" symptom.
2. **"Toggles don't stick"** — downstream of the crash (write succeeds, re-render dies) plus a 60s resolve cache.
3. **Duplicate route** — `settings/team/[userId]/permissions` is an orphaned byte-copy of `settings/(users-groups)/users/[userId]/permissions`, with no nav link.
4. **No fine-graining** — permissions are coarse per-module keys (`projects:view/manage/admin`); no sub-feature granularity.
5. **Inheritance invisible** — the API computes `isOverride` but the UI discards it.

**Decision:** rather than patch, replace the model with **full NIST RBAC (RBAC3)** — flat roles + role hierarchy + separation-of-duty constraints + session role activation — promoting the existing `groups` concept into first-class **roles**.

## 2. Current-state facts (grounding)

- `users.role` enum `'admin' | 'member'` is wired across ~50 files (~144 occurrences): middleware, sidebar, settings-layout `adminOnly` groups, many routes.
- Backend already resolves RBAC-style: `resolvePermissions()` = member role defaults ∪ group permissions, then user overrides (`apps/api/src/middleware/permission.ts`). Admin short-circuits via `ADMIN_SENTINEL`.
- Existing tables: `groups`, `group_members`, `group_permissions`, `user_permissions` (per-user overrides), `dashboard_group_assignments` (group→dashboard).
- Two more role-enum couplings: `record_type_permissions.role` and `invites.role`.
- Permission registry: `packages/modules` — `MODULE_REGISTRY`, `PermissionDef {key,label,defaultRoles}`, `getDefaultPermissionsForRole`, `getModuleForPermission`.
- Theme (authoritative = `apps/web/app/globals.css`, **CLAUDE.md is stale**): IBM Plex Sans + IBM Plex Mono (no serif); cool ink-blue text ladder (`--text #0b1330`); **full dark theme** via `[data-theme="dark"]`; token kit incl. `--purple/-bg`, `--border2`, `--radius-sm…xl/pill`, `--shadow-hover/-modal`, `--motion-*`/`--transition`; utilities `.skeleton` (shimmer), `.fade-in` (slideDown).

## 3. Target model — RBAC3

Group-based RBAC, full replace of the `admin|member` enum.

- **Roles** = named permission bundles. A user holds one-or-many roles (many-to-many).
- **Two immutable system roles** seeded per workspace:
  - **Administrator** — `grants_all` flag → bypasses every check (the new superuser).
  - **Member** — `is_default` → auto-assigned to new/invited users; holds baseline permissions.
- **Role hierarchy (RBAC1):** a senior *parent* role inherits its *child* roles' permissions. DAG-constrained.
- **Constraints (RBAC2):** SSD (static separation of duty, enforced at assignment) and DSD (dynamic, enforced at activation), plus per-role cardinality caps.
- **Sessions (RBAC3):** each user has an **active-role set** (subset of assigned), defaulting to all assigned. DSD enforced on activation. Pragmatic choice: one active set **per user** (not per physical device) to avoid JWT churn.
- **Grant-only:** `role_permissions` presence = granted; there are no per-role denies.
- **Per-user overrides dropped** — pure RBAC. Overrides would undermine SoD (an override could grant what SSD forbids). Existing `user_permissions` rows are discarded, with a migration report (§9) so admins can intentionally recreate them as roles.
- **Superuser stays O(1):** session carries `isAdmin` derived from "holds a `grants_all` role."

---

## 4. Data model & migration

### 4.1 Tables (rename `groups` → `roles` **in place** — preserves FK data, no copy step)

**Core**
- `roles` (was `groups`): `id, workspace_id, name, description, color, is_system bool, grants_all bool, is_default bool, max_members int null, rank int, created_at, updated_at`
- `role_permissions` (was `group_permissions`): `role_id, permission` — **grant-only** (drop the `granted` column after removing `granted=false` rows).
- `user_roles` (was `group_members`): `user_id, role_id`
- `dashboard_group_assignments.group_id` → `role_id`

**Hierarchy (RBAC1)**
- `role_inheritance` (`parent_role_id`, `child_role_id`) — parent inherits child's permissions. DAG-only; API rejects cycle-creating edges. Resolution = transitive descendant closure.

**Constraints (RBAC2)**
- `ssd_sets` (`id, workspace_id, name, cardinality`) + `ssd_set_roles` (`set_id, role_id`) — user may hold at most `cardinality-1` authorized roles from the set. Enforced at assignment.
- `dsd_sets` (`id, workspace_id, name, cardinality`) + `dsd_set_roles` (`set_id, role_id`) — user may be assigned all but not activate ≥ `cardinality` together. Enforced at activation.
- Role cardinality cap: `roles.max_members`.

**Sessions (RBAC3)**
- `user_session_roles` (`user_id, role_id, active`) — active-role set per user; default all assigned active.

**Invites / record types**
- `invite_roles` (`invite_id, role_id`) — replaces `invites.role` string (one-or-many).
- `record_type_permissions.role` enum → `role_id` FK.

**Migration report**
- `migration_discarded_grants` (`workspace_id, user_id, permission, discarded_at`) — records every dropped override.

### 4.2 Migration steps (one-way)

1. Rename group tables → role tables; add new columns; create hierarchy / constraint / session / invite_roles / report tables.
2. Delete `role_permissions` rows where `granted=false` (old denies → absence in grant-only model); drop the `granted` column.
3. Per workspace, seed:
   - **Administrator** (`is_system`, `grants_all=true`); add every current `role='admin'` user to `user_roles`.
   - **Member** (`is_system`, `is_default=true`); materialize current member-default permission keys (from `getDefaultPermissionsForRole('member')`, mapped through the legacy-key table in §5) as `role_permissions`; add every current `role='member'` user.
4. Copy existing `user_permissions` rows into `migration_discarded_grants`, then drop/empty the overrides usage.
5. Migrate `invites.role` → `invite_roles` (map `admin`→Administrator, `member`→Member); migrate `record_type_permissions.role`→`role_id`.
6. Drop `users.role`.

### 4.3 Risk

Dropping `users.role` is the highest-blast change; **TypeScript surfaces every site at compile time** — that becomes the conversion checklist (§6). Migration is one-way → **DB backup required** before running.

---

## 5. Permission registry & fine-graining

### 5.1 Registry shape (`packages/modules`)

- `ModuleDefinition` gains `permissionGroups?: { id: string; label: string }[]`.
- `PermissionDef` gains `group?: string` (references a `permissionGroups` id). Ungrouped → "General".
- `defaultRoles` **repurposed**: no longer resolves live perms (roles are explicit DB sets). Used to (a) seed the Member role at migration, (b) serve as "recommended defaults" template when creating a new custom role.

### 5.2 Key convention

`module.subfeature:action`. **PM fine-grained first** (other modules keep coarse keys until separately fine-grained):

| Sub-feature | Keys |
|---|---|
| Projects | `projects:view`, `projects:create`, `projects:edit`, `projects:archive`, `projects:delete` |
| Tasks | `pm.tasks:view/create/edit/assign/delete` |
| Sprints | `pm.sprints:view/manage` |
| Milestones | `pm.milestones:view/manage` |
| Time tracking | `pm.time:log`, `pm.time:view_all` |
| Automations | `pm.automations:manage` |
| Client portal | `pm.portal:manage`, `pm.approvals:respond` |
| Docs | `pm.docs:view/edit` |
| Settings | `projects:admin` |

### 5.3 Administration permission namespace (new)

Workspace-management gates (today collapsed into `adminOnly`) become **grantable permission keys** so a custom role can be given admin powers without `grants_all`:

`workspace:manage`, `users:manage`, `roles:manage`, `modules:manage`, `plugins:manage`, `apikeys:manage`, `integrations:manage`, `billing:manage`

### 5.4 Legacy key migration map

`projects:manage` → grant the new PM write keys (`projects:create/edit/archive`, `pm.tasks:*` write, `pm.sprints:manage`, `pm.milestones:manage`, `pm.automations:manage`, `pm.portal:manage`, `pm.docs:edit`); `projects:view` → `projects:view` (+ `pm.tasks:view`, read keys); `projects:admin` → `projects:admin`. Applied to `role_permissions` during migration.

### 5.5 Enforcement scope

A granular key is only real if its routes check it. First pass adds `requirePermission('pm.<sub>:<action>')` to each PM/projects route. Same pattern later extends to other modules.

---

## 6. Resolution & enforcement

### 6.1 Resolver

```
resolve(user, workspace):
  active   = user's active roles              # default: all assigned; editable
  if any active role has grants_all: return SUPERUSER      # allow everything
  expanded = transitive descendant closure(active) over role_inheritance
  perms    = ⋃ role_permissions for every role in expanded
  perms    = perms ∩ { keys whose module is enabled for workspace }
  return perms
```

No override layer, no `getDefaultPermissionsForRole` fallback. Hierarchy closure + resolved set cached per user with TTL (as today); invalidated on any role / permission / assignment / inheritance / activation / constraint mutation.

### 6.2 Blast-radius conversion (~50 sites)

- Genuine superuser-only checks → `user.isAdmin` (derived from `grants_all`).
- Workspace-management gates (`adminOnly` settings: workspace/users/roles/modules/plugins/api-keys/integrations) → `requirePermission('<x>:manage')` using the Administration namespace.
- Middleware stays `requirePermission(key)`; `grants_all` bypasses all.
- Frontend `AuthContext` exposes `{ permissions: Set<string>, isAdmin, hasPermission(key) }`; nav / settings-layout / pages gate on `hasPermission(key)` instead of `isAdmin`.
- Programmatic checks (WebSocket upgrade, `record-type-permission`) use the same resolver.
- `record_type_permissions` (now `role_id`) resolves per active+inherited role: op allowed if any grants it.

---

## 7. Constraints engine

Shared, pure, unit-testable module `apps/api/src/lib/rbac/`: `authorizedRoleClosure`, `checkSSD`, `checkDSD`, `checkCardinality`, `wouldCreateCycle`.

- **Hierarchy-aware membership:** all constraint checks operate on the **authorized-role closure** (assigned roles + inheritance descendants), not just direct assignments. This is the NIST-correct hierarchy↔constraint interaction.
- **SSD (static, at assignment):** user may hold at most `cardinality-1` authorized roles from a set. Enforced on: assign-user-to-role, add-inheritance-edge (can create implicit membership), add-role-to-SSD-set.
- **DSD (dynamic, at activation):** enforced on session activation over the activated-role closure.
- **Cardinality:** reject assignment if `roles.max_members` reached.
- **Constraint-creation validation:** adding roles to an SSD/DSD set or an inheritance edge re-validates existing data; if existing assignments/activations already violate, the create is **rejected with a conflict list** (users + roles) rather than persisting inconsistent state. Inheritance edges also rejected on cycle (DAG invariant).

---

## 8. API contract

Envelope `{data,error}`, Zod-validated. `/api/groups*` and `/api/users/:id/permissions*` (overrides) are **removed**; `@vencore/api-client` updated.

**Roles CRUD** `[roles:manage]`
- `GET /api/roles` — list (`member_count, is_system, grants_all, is_default, rank`)
- `POST /api/roles` — create (`name, description, color, copyDefaults?`)
- `GET /api/roles/:id` — detail: **grouped** permissions (module → sub-feature → `{key,label,granted,inherited}`), members, inheritance parents/children, SSD/DSD memberships. *(This grouped shape fixes the old crash.)*
- `PATCH /api/roles/:id` — meta (`name, description, color, max_members`). System roles: name locked, cannot strip `grants_all`/`is_default`.
- `DELETE /api/roles/:id` — **blocked** if `is_system` or has members (reassign first).

**Role permissions (matrix)** `[roles:manage]`
- `PUT /api/roles/:id/permissions` — bulk `{permissions:string[]}` (replace set) or single `{permission,granted}`. Grant-only: `granted:false` removes. Keys validated against registry.

**Hierarchy** `[roles:manage]`
- `POST /api/roles/:id/inherit {childRoleId}` — validates DAG + SSD
- `DELETE /api/roles/:id/inherit/:childId`

**Constraints** `[roles:manage]`
- `GET/POST/PATCH/DELETE /api/rbac/ssd-sets` and `/api/rbac/dsd-sets` (`name, cardinality, roles[]`). Reject-with-conflict-list on violating create/modify.

**User assignment** `[users:manage]`
- `GET /api/users/:id/roles` — assigned + resolved effective perms (grouped, with source role)
- `PUT /api/users/:id/roles {roleIds:[]}` — set assignments; SSD + cardinality checked in one place.

**Session activation** (self)
- `GET /api/me/active-roles`
- `PUT /api/me/active-roles {roleIds:[]}` — DSD checked; invalidates resolved cache.

**Resolved perms + report**
- `GET /api/me` (extended) → resolved `{ permissions:[], isAdmin }` for frontend gating.
- `GET /api/rbac/discarded-grants` `[roles:manage]` — migration report of dropped overrides.

---

## 9. Frontend / UX

### 9.1 IA / nav

- "Users & Groups" → **"Users & Roles"**. Sub-tabs: **Users | Roles | Constraints**.
- Kill orphaned `settings/team/*` routes (redirect to canonical). Canonical user detail: `/settings/users/[id]`.

### 9.2 Pages

1. **Roles list** `/settings/roles` — cards: color-dot marker, overlapping member-avatar stack, pill badges (System / Administrator / Default). Create Role. Row → detail.
2. **Role detail** `/settings/roles/[id]` — header (name/desc/color/max_members, system locks) + sections:
   - **Permissions matrix** — modules → sub-feature groups → toggle rows; inherited perms checked-but-muted with "via {child role}" tag; search box + per-group tri-state bulk toggle.
   - **Members** — list + add/remove (SSD-checked; conflict inline).
   - **Inheritance** — "inherits → [child roles]" add/remove; cycle/SSD errors inline.
3. **Users list** `/settings/users` — roles-badges column.
4. **User detail** `/settings/users/[id]` — assigned-roles multi-select (`PUT`, SSD/cardinality checked) + **read-only effective-permissions view** (grouped, each perm tagged with source role) + isAdmin indicator. Replaces the old per-user toggle editor.
5. **Constraints** tab — SSD + DSD sets (name, cardinality, member roles); conflict-list errors on save.
6. **Active-role switcher** — topbar/user-menu popover; toggle assigned roles active/inactive (DSD-checked); shown only when user has >1 assigned role; persists via `PUT /api/me/active-roles`.

### 9.3 Components (rebuild — delete old `PermissionBlock`, `UserPermissionsEditor`, `GroupPermissionsEditor`)

`RoleMatrixEditor`, `PermissionRow`, `RoleMembersPanel`, `RoleInheritancePanel`, `ConstraintSetEditor`, `UserRoleAssignment`, `EffectivePermissionsView`, `ActiveRoleSwitcher`.

### 9.4 Visual craft (match `_design`, authoritative tokens in `globals.css`)

- **Type:** IBM Plex Sans throughout; IBM Plex **Mono** for permission keys (`pm.sprints:manage`). No serif.
- **Dual-theme:** every component token-driven; verified light **and** dark.
- **Token-native:** `--radius-*` on cards/pills, `--shadow-hover` on card hover, `--shadow-modal` on switcher/why popovers, `--transition`/`--motion-*` on toggles + row hover, `.skeleton` loaders (kill "Loading…" text), `.fade-in` on section mount.
- **Badges:** System → `--purple-bg`, Administrator → `--blue-bg`, Default → `--green-bg`, cardinality-full → `--amber-bg`.
- **Signature moment:** inheritance **DAG tree** — read-only, senior→junior indented, muted `--border` connectors.
- Sticky module/sub-feature headers in the matrix; source-role chips + "why" popover in the effective view.

### 9.5 Gating

`AuthContext` `{ permissions, isAdmin, hasPermission }`. Settings-layout `adminOnly` groups → per-link permission gates. Sidebar extended with Administration keys.

---

## 10. Implementation phases

- **A — Data + resolver core (no UI):** migration; `rbac/` lib (TDD); resolver + middleware rewrite + ~50-site conversion; registry fine-graining + PM route enforcement + Administration namespace.
- **B — API:** roles CRUD, matrix, hierarchy, constraints, user assignment, session activation, `/api/me` extension, discarded-grants; api-client update; delete old routes.
- **C — Frontend:** AuthContext perms/gating; rebuild components/pages; delete old; route consolidation + redirects; visual polish both themes.
- **D — Verify:** test matrix + screenshots.

Given span across `db/api/web/types/modules`, this is large (multi-week) and will likely be split into per-phase implementation plans.

## 11. Testing

- **Unit (`rbac/` lib, TDD):** hierarchy closure; SSD/DSD incl. hierarchy-implicit membership; cardinality; cycle rejection; `grants_all` short-circuit; module-disabled filter.
- **API integration:** every endpoint; permission gating; constraint reject-with-conflict; system-role guards (no delete/rename, can't strip grants_all/is_default); workspace scoping.
- **Migration test:** seed workspace (admins/members/groups/overrides) → run → assert system roles seeded, assignments preserved, denies dropped, `migration_discarded_grants` populated, `users.role` gone, invites/record-type migrated.
- **Frontend:** pages render (crash fixed); assignments persist; both themes; DSD block in switcher.
- **Regression:** update `permission.test.ts`, `ssh-permission.test.ts`, `sidebar.test.ts`, `dashboards-group-assignments.test.ts` to the new model.

## 12. Rollout / risk

- One-way migration → **DB backup first**. White-label self-hosted: each workspace deploy migrates its own DB. Stage on **demo.vencore.in** before release.
- TS compile gate = safety net: build fails until every `users.role` site is converted.
- Audit cache-invalidation on every mutation path.
- `graphify update .` after implementation.

## 13. Explicitly out of scope

- Fine-graining modules other than Project Management (coarse keys retained).
- Per-device session tracking (one active-role set per user instead).
- Attribute-based (ABAC) rules / conditional policies.
