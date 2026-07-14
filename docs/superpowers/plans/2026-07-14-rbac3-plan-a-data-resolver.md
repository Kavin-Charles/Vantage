# RBAC3 — Plan A: Data Model & Resolver Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `admin|member` enum with a full RBAC3 data model (roles, hierarchy, SoD constraints, sessions) plus a pure resolver + rewritten enforcement middleware, so every downstream API/UI can resolve permissions through roles.

**Architecture:** Rename `groups*` tables → `roles*` in place via one forward migration, add hierarchy/constraint/session tables, seed two system roles per workspace, drop `users.role`. A new pure `apps/api/src/lib/rbac/` module computes role closure, resolution, and constraint checks; `middleware/permission.ts` is rewritten to use it. The permission registry gains sub-feature grouping and an Administration namespace.

**Tech Stack:** TypeScript (strict), Kysely, PostgreSQL, Express, Vitest, `@vencore/db`, `@vencore/modules`.

## Global Constraints

- TypeScript strict mode; no `any`; no `console.log` in production paths (use existing logger).
- All DB access through Kysely; migrations use the `up`/`down` + `sql` template pattern (see `packages/db/migrations/20260713_001_infra_module_merge.ts`). Never edit an existing migration file.
- Every authenticated query scoped by `workspace_id`.
- Grant-only permission model: a `role_permissions` row means granted; there are no deny rows.
- System roles: **Administrator** (`grants_all=true`), **Member** (`is_default=true`) — immutable (no rename/delete, cannot strip their flags).
- Spec: `docs/superpowers/specs/2026-07-14-permissions-rbac3-rework-design.md`.
- Branch: `feat/permissions-rbac3`. Commit after every task.
- Migration is one-way in production; the migration must be idempotent-safe via `on conflict do nothing` where seeding.

---

## File Structure

- `packages/db/migrations/20260714_001_rbac3.ts` — forward/`down` migration (rename, new tables, seed, drop enum).
- `packages/db/migrations/20260714_001_rbac3.helpers.ts` — pure helpers (legacy-key mapping, seed-permission computation) unit-tested separately.
- `packages/db/migrations/20260714_001_rbac3.test.ts` — helper unit tests.
- `packages/db/src/schema.ts` — table interface edits (rename group→role tables, add columns/tables, drop `users.role`).
- `packages/modules/src/types.ts` — add `permissionGroups`, `PermissionDef.group`.
- `packages/modules/src/admin/index.ts` — new Administration permission namespace module.
- `packages/modules/src/projects/index.ts` — fine-grained PM permission keys + groups.
- `packages/modules/src/index.ts` — register admin module; add `LEGACY_PERMISSION_MAP`, `expandLegacyPermission`.
- `packages/modules/src/index.test.ts` — registry + legacy-map tests.
- `apps/api/src/lib/rbac/closure.ts` — `authorizedRoleClosure`, `wouldCreateCycle`.
- `apps/api/src/lib/rbac/constraints.ts` — `checkSSD`, `checkDSD`, `checkCardinality`.
- `apps/api/src/lib/rbac/resolve.ts` — `resolveRolePermissions`.
- `apps/api/src/lib/rbac/*.test.ts` — pure unit tests for each.
- `apps/api/src/middleware/permission.ts` — rewritten resolver + `requirePermission` + cache.
- `apps/api/src/middleware/permission.test.ts` — rewritten to the role model.
- `apps/api/src/middleware/auth.ts` — attach `isAdmin` + resolved perms to request.
- ~50 call sites converting `user.role === 'admin'` → `req.isAdmin` / `requirePermission('x:manage')` (enumerated in Task 12).

---

### Task 1: RBAC registry types + Administration namespace

**Files:**
- Modify: `packages/modules/src/types.ts`
- Create: `packages/modules/src/admin/index.ts`
- Modify: `packages/modules/src/index.ts`
- Test: `packages/modules/src/index.test.ts`

**Interfaces:**
- Consumes: existing `ModuleDefinition`, `PermissionDef`.
- Produces: `ModuleDefinition.permissionGroups?: { id: string; label: string }[]`; `PermissionDef.group?: string`; `ADMIN_MODULE: ModuleDefinition` with id `'admin'`; keys `workspace:manage`, `users:manage`, `roles:manage`, `modules:manage`, `plugins:manage`, `apikeys:manage`, `integrations:manage`, `billing:manage`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/modules/src/index.test.ts (add)
import { describe, it, expect } from 'vitest';
import { MODULE_REGISTRY, getModuleForPermission } from './index';

describe('admin namespace', () => {
  it('registers roles:manage under the admin module', () => {
    expect(getModuleForPermission('roles:manage')).toBe('admin');
    expect(getModuleForPermission('users:manage')).toBe('admin');
  });
  it('admin module is in the registry', () => {
    expect(MODULE_REGISTRY.some(m => m.id === 'admin')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/modules test -- index.test.ts`
Expected: FAIL — `getModuleForPermission('roles:manage')` returns `null`.

- [ ] **Step 3: Add the type fields**

```ts
// packages/modules/src/types.ts — extend interfaces
export interface PermissionDef {
  key: string;
  label: string;
  defaultRoles: UserRole[];
  group?: string; // references a ModuleDefinition.permissionGroups[].id; undefined => "General"
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  permissions: PermissionDef[];
  permissionGroups?: { id: string; label: string }[];
  nav: NavItem[];
  apiPrefixes: string[];
  workers: string[];
  emitsActivity?: boolean;
  emitsAlerts?: boolean;
}
```

- [ ] **Step 4: Create the admin module**

```ts
// packages/modules/src/admin/index.ts
import type { ModuleDefinition } from '../types';

// Administration namespace: workspace-management permissions that were
// previously gated by the admin/member enum. `defaultEnabled` is true and
// this module is never workspace-toggleable in the modules UI (it has no nav).
export const ADMIN_MODULE: ModuleDefinition = {
  id: 'admin',
  name: 'Administration',
  description: 'Workspace administration and access control.',
  icon: 'ShieldCheck',
  defaultEnabled: true,
  permissionGroups: [
    { id: 'access', label: 'Access control' },
    { id: 'workspace', label: 'Workspace' },
  ],
  permissions: [
    { key: 'users:manage',        label: 'Manage users',        defaultRoles: ['admin'], group: 'access' },
    { key: 'roles:manage',        label: 'Manage roles',        defaultRoles: ['admin'], group: 'access' },
    { key: 'workspace:manage',    label: 'Manage workspace',    defaultRoles: ['admin'], group: 'workspace' },
    { key: 'modules:manage',      label: 'Manage modules',      defaultRoles: ['admin'], group: 'workspace' },
    { key: 'plugins:manage',      label: 'Manage plugins',      defaultRoles: ['admin'], group: 'workspace' },
    { key: 'apikeys:manage',      label: 'Manage API keys',     defaultRoles: ['admin'], group: 'workspace' },
    { key: 'integrations:manage', label: 'Manage integrations', defaultRoles: ['admin'], group: 'workspace' },
    { key: 'billing:manage',      label: 'Manage billing',      defaultRoles: ['admin'], group: 'workspace' },
  ],
  nav: [],
  apiPrefixes: [],
  workers: [],
};
```

- [ ] **Step 5: Register it**

```ts
// packages/modules/src/index.ts — add import + registry entry
import { ADMIN_MODULE } from './admin';
export * from './admin';

export const MODULE_REGISTRY: ModuleDefinition[] = [
  DASHBOARD_MODULE,
  CRM_MODULE,
  INFRA_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
  PROJECTS_MODULE,
  MESSAGING_MODULE,
  ADMIN_MODULE,
];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @vencore/modules test -- index.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/modules/src/types.ts packages/modules/src/admin packages/modules/src/index.ts packages/modules/src/index.test.ts
git commit -m "feat(modules): add Administration permission namespace and sub-feature grouping"
```

---

### Task 2: Project Management fine-grained permissions + legacy map

**Files:**
- Modify: `packages/modules/src/projects/index.ts`
- Modify: `packages/modules/src/index.ts` (add `LEGACY_PERMISSION_MAP`, `expandLegacyPermission`)
- Test: `packages/modules/src/index.test.ts`

**Interfaces:**
- Produces: `expandLegacyPermission(key: string): string[]` — maps a legacy PM key to its new granular keys (returns `[key]` if not legacy). `LEGACY_PERMISSION_MAP: Record<string, string[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/modules/src/index.test.ts (add)
import { expandLegacyPermission, getModuleForPermission } from './index';

describe('PM fine-graining', () => {
  it('maps legacy projects:manage to granular write keys', () => {
    const out = expandLegacyPermission('projects:manage');
    expect(out).toContain('projects:create');
    expect(out).toContain('pm.sprints:manage');
    expect(out).not.toContain('projects:view'); // view is separate
  });
  it('passes through non-legacy keys unchanged', () => {
    expect(expandLegacyPermission('projects:view')).toEqual(['projects:view']);
    expect(expandLegacyPermission('contacts:delete')).toEqual(['contacts:delete']);
  });
  it('registers new granular PM keys under projects', () => {
    expect(getModuleForPermission('pm.sprints:manage')).toBe('projects');
    expect(getModuleForPermission('pm.time:log')).toBe('projects');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/modules test -- index.test.ts`
Expected: FAIL — `expandLegacyPermission` undefined.

- [ ] **Step 3: Rewrite PROJECTS_MODULE permissions**

```ts
// packages/modules/src/projects/index.ts — replace permissions + add groups
export const PROJECTS_MODULE: ModuleDefinition = {
  id: 'projects',
  name: 'Project Management',
  description: 'Projects, tasks, sprints, automations, and client portals.',
  icon: 'FolderKanban',
  defaultEnabled: true,
  permissionGroups: [
    { id: 'projects',   label: 'Projects' },
    { id: 'tasks',      label: 'Tasks' },
    { id: 'sprints',    label: 'Sprints' },
    { id: 'milestones', label: 'Milestones' },
    { id: 'time',       label: 'Time tracking' },
    { id: 'automation', label: 'Automations' },
    { id: 'portal',     label: 'Client portal' },
    { id: 'docs',       label: 'Docs' },
    { id: 'settings',   label: 'Settings' },
  ],
  permissions: [
    { key: 'projects:view',        label: 'View projects',    defaultRoles: ['admin', 'member'], group: 'projects' },
    { key: 'projects:create',      label: 'Create projects',  defaultRoles: ['admin'],           group: 'projects' },
    { key: 'projects:edit',        label: 'Edit projects',    defaultRoles: ['admin'],           group: 'projects' },
    { key: 'projects:archive',     label: 'Archive projects', defaultRoles: ['admin'],           group: 'projects' },
    { key: 'projects:delete',      label: 'Delete projects',  defaultRoles: ['admin'],           group: 'projects' },
    { key: 'pm.tasks:view',        label: 'View tasks',       defaultRoles: ['admin', 'member'], group: 'tasks' },
    { key: 'pm.tasks:create',      label: 'Create tasks',     defaultRoles: ['admin', 'member'], group: 'tasks' },
    { key: 'pm.tasks:edit',        label: 'Edit tasks',       defaultRoles: ['admin', 'member'], group: 'tasks' },
    { key: 'pm.tasks:assign',      label: 'Assign tasks',     defaultRoles: ['admin'],           group: 'tasks' },
    { key: 'pm.tasks:delete',      label: 'Delete tasks',     defaultRoles: ['admin'],           group: 'tasks' },
    { key: 'pm.sprints:view',      label: 'View sprints',     defaultRoles: ['admin', 'member'], group: 'sprints' },
    { key: 'pm.sprints:manage',    label: 'Manage sprints',   defaultRoles: ['admin'],           group: 'sprints' },
    { key: 'pm.milestones:view',   label: 'View milestones',  defaultRoles: ['admin', 'member'], group: 'milestones' },
    { key: 'pm.milestones:manage', label: 'Manage milestones',defaultRoles: ['admin'],           group: 'milestones' },
    { key: 'pm.time:log',          label: 'Log time',         defaultRoles: ['admin', 'member'], group: 'time' },
    { key: 'pm.time:view_all',     label: 'View all time',    defaultRoles: ['admin'],           group: 'time' },
    { key: 'pm.automations:manage',label: 'Manage automations',defaultRoles: ['admin'],          group: 'automation' },
    { key: 'pm.portal:manage',     label: 'Manage client portal', defaultRoles: ['admin'],       group: 'portal' },
    { key: 'pm.approvals:respond', label: 'Respond to approvals', defaultRoles: ['admin', 'member'], group: 'portal' },
    { key: 'pm.docs:view',         label: 'View docs',        defaultRoles: ['admin', 'member'], group: 'docs' },
    { key: 'pm.docs:edit',         label: 'Edit docs',        defaultRoles: ['admin'],           group: 'docs' },
    { key: 'projects:admin',       label: 'Project settings', defaultRoles: ['admin'],           group: 'settings' },
  ],
  nav: [{ label: 'Projects', path: '/projects', icon: 'FolderKanban' }],
  apiPrefixes: ['/projects', '/pm'],
  workers: ['due-date-alerts', 'overdue-scan', 'health-recalc', 'sprint-rollover'],
  emitsActivity: true,
  emitsAlerts: true,
};
```

- [ ] **Step 4: Add the legacy map**

```ts
// packages/modules/src/index.ts (add)
export const LEGACY_PERMISSION_MAP: Record<string, string[]> = {
  'projects:manage': [
    'projects:create', 'projects:edit', 'projects:archive',
    'pm.tasks:assign', 'pm.tasks:delete',
    'pm.sprints:manage', 'pm.milestones:manage',
    'pm.automations:manage', 'pm.portal:manage', 'pm.docs:edit',
  ],
  'projects:view': ['projects:view', 'pm.tasks:view', 'pm.sprints:view', 'pm.milestones:view', 'pm.docs:view'],
};

export function expandLegacyPermission(key: string): string[] {
  return LEGACY_PERMISSION_MAP[key] ?? [key];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vencore/modules test -- index.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/modules/src/projects/index.ts packages/modules/src/index.ts packages/modules/src/index.test.ts
git commit -m "feat(modules): fine-grained PM permissions with legacy key mapping"
```

---

### Task 3: Migration pure helpers

**Files:**
- Create: `packages/db/migrations/20260714_001_rbac3.helpers.ts`
- Test: `packages/db/migrations/20260714_001_rbac3.test.ts`

**Interfaces:**
- Produces: `memberSeedPermissions(): string[]` — the granular keys the Member system role is seeded with (member `defaultRoles`, expanded through legacy map, deduped). `mapLegacyRolePermission(key: string): string[]` — re-export of `expandLegacyPermission` for existing `group_permissions` rows.

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/migrations/20260714_001_rbac3.test.ts
import { describe, it, expect } from 'vitest';
import { memberSeedPermissions, mapLegacyRolePermission } from './20260714_001_rbac3.helpers';

describe('memberSeedPermissions', () => {
  it('includes baseline member keys and excludes admin-only keys', () => {
    const perms = memberSeedPermissions();
    expect(perms).toContain('contacts:view');
    expect(perms).toContain('pm.tasks:create');
    expect(perms).not.toContain('projects:delete');
    expect(perms).not.toContain('roles:manage');
  });
  it('is deduped', () => {
    const perms = memberSeedPermissions();
    expect(new Set(perms).size).toBe(perms.length);
  });
});

describe('mapLegacyRolePermission', () => {
  it('expands projects:manage', () => {
    expect(mapLegacyRolePermission('projects:manage')).toContain('pm.sprints:manage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/db test -- 20260714_001_rbac3.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

```ts
// packages/db/migrations/20260714_001_rbac3.helpers.ts
import { getAllPermissions, expandLegacyPermission } from '@vencore/modules';

// Permissions the seeded Member system role receives: every registry
// permission whose defaultRoles includes 'member'. Keys are already granular
// (Task 2), so no legacy expansion is needed for the seed itself.
export function memberSeedPermissions(): string[] {
  const keys = getAllPermissions()
    .filter(p => p.defaultRoles.includes('member'))
    .map(p => p.key);
  return [...new Set(keys)];
}

// For existing group_permissions rows that used legacy coarse keys.
export function mapLegacyRolePermission(key: string): string[] {
  return expandLegacyPermission(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vencore/db test -- 20260714_001_rbac3.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/20260714_001_rbac3.helpers.ts packages/db/migrations/20260714_001_rbac3.test.ts
git commit -m "feat(db): rbac3 migration seed helpers"
```

---

### Task 4: The RBAC3 migration (`up`/`down`)

**Files:**
- Create: `packages/db/migrations/20260714_001_rbac3.ts`

**Interfaces:**
- Consumes: `memberSeedPermissions`, `mapLegacyRolePermission` from Task 3.
- Produces: renamed/added tables per spec §4.1; system roles per workspace.

- [ ] **Step 1: Write the migration**

```ts
// packages/db/migrations/20260714_001_rbac3.ts
import { type Kysely, sql } from 'kysely';
import { memberSeedPermissions, mapLegacyRolePermission } from './20260714_001_rbac3.helpers';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Rename groups* -> roles* in place (preserves FK data).
  await sql`alter table groups rename to roles`.execute(db);
  await sql`alter table group_members rename to user_roles`.execute(db);
  await sql`alter table group_members_id_seq rename to user_roles_id_seq`.execute(db).catch(() => {});
  await sql`alter table user_roles rename column group_id to role_id`.execute(db);
  await sql`alter table group_permissions rename to role_permissions`.execute(db);
  await sql`alter table role_permissions rename column group_id to role_id`.execute(db);
  await sql`alter table dashboard_group_assignments rename column group_id to role_id`.execute(db);

  // 2. New columns on roles.
  await sql`alter table roles add column is_system boolean not null default false`.execute(db);
  await sql`alter table roles add column grants_all boolean not null default false`.execute(db);
  await sql`alter table roles add column is_default boolean not null default false`.execute(db);
  await sql`alter table roles add column max_members integer`.execute(db);
  await sql`alter table roles add column rank integer not null default 0`.execute(db);

  // 3. Grant-only: drop deny rows, then the granted column.
  await sql`delete from role_permissions where granted = false`.execute(db);
  await sql`alter table role_permissions drop column granted`.execute(db);

  // 3b. Expand any legacy coarse keys in existing role_permissions.
  const legacyRows = await sql<{ role_id: string; permission: string }>`
    select role_id, permission from role_permissions
    where permission in ('projects:manage', 'projects:view')
  `.execute(db);
  for (const row of legacyRows.rows) {
    for (const expanded of mapLegacyRolePermission(row.permission)) {
      await sql`
        insert into role_permissions (workspace_id, role_id, permission)
        select workspace_id, role_id, ${expanded} from role_permissions
        where role_id = ${row.role_id} and permission = ${row.permission}
        on conflict (role_id, permission) do nothing
      `.execute(db);
    }
  }
  await sql`delete from role_permissions where permission = 'projects:manage'`.execute(db);

  // 4. Hierarchy / constraint / session / invite / report tables.
  await sql`
    create table role_inheritance (
      parent_role_id uuid not null references roles(id) on delete cascade,
      child_role_id  uuid not null references roles(id) on delete cascade,
      primary key (parent_role_id, child_role_id)
    )`.execute(db);
  await sql`
    create table ssd_sets (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references workspaces(id) on delete cascade,
      name text not null,
      cardinality integer not null check (cardinality >= 2)
    )`.execute(db);
  await sql`
    create table ssd_set_roles (
      set_id uuid not null references ssd_sets(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      primary key (set_id, role_id)
    )`.execute(db);
  await sql`
    create table dsd_sets (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references workspaces(id) on delete cascade,
      name text not null,
      cardinality integer not null check (cardinality >= 2)
    )`.execute(db);
  await sql`
    create table dsd_set_roles (
      set_id uuid not null references dsd_sets(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      primary key (set_id, role_id)
    )`.execute(db);
  await sql`
    create table user_session_roles (
      user_id uuid not null references users(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      active boolean not null default true,
      primary key (user_id, role_id)
    )`.execute(db);
  await sql`
    create table invite_roles (
      invite_id uuid not null references invites(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      primary key (invite_id, role_id)
    )`.execute(db);
  await sql`
    create table migration_discarded_grants (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      user_id uuid not null,
      permission text not null,
      discarded_at timestamptz not null default now()
    )`.execute(db);

  // 5. Seed system roles per workspace.
  const seedPerms = memberSeedPermissions();
  const workspaces = await sql<{ id: string }>`select id from workspaces`.execute(db);
  for (const ws of workspaces.rows) {
    const admin = await sql<{ id: string }>`
      insert into roles (workspace_id, name, description, color, is_system, grants_all, rank)
      values (${ws.id}, 'Administrator', 'Full access to everything.', '#1e3a8a', true, true, 100)
      returning id`.execute(db);
    const adminId = admin.rows[0]!.id;
    const member = await sql<{ id: string }>`
      insert into roles (workspace_id, name, description, color, is_system, is_default, rank)
      values (${ws.id}, 'Member', 'Baseline access.', '#2d6a4f', true, true, 0)
      returning id`.execute(db);
    const memberId = member.rows[0]!.id;

    for (const perm of seedPerms) {
      await sql`
        insert into role_permissions (workspace_id, role_id, permission)
        values (${ws.id}, ${memberId}, ${perm})
        on conflict (role_id, permission) do nothing`.execute(db);
    }

    // Assign existing users to their system role by current enum.
    await sql`
      insert into user_roles (workspace_id, role_id, user_id)
      select ${ws.id}, ${adminId}, id from users where workspace_id = ${ws.id} and role = 'admin'
      on conflict (role_id, user_id) do nothing`.execute(db);
    await sql`
      insert into user_roles (workspace_id, role_id, user_id)
      select ${ws.id}, ${memberId}, id from users where workspace_id = ${ws.id} and role = 'member'
      on conflict (role_id, user_id) do nothing`.execute(db);

    // Activate all assigned roles by default.
    await sql`
      insert into user_session_roles (user_id, role_id, active)
      select ur.user_id, ur.role_id, true from user_roles ur where ur.workspace_id = ${ws.id}
      on conflict (user_id, role_id) do nothing`.execute(db);
  }

  // 6. Migrate invites.role -> invite_roles (map admin/member to system roles).
  await sql`
    insert into invite_roles (invite_id, role_id)
    select i.id, r.id from invites i
    join roles r on r.workspace_id = i.workspace_id and r.is_system = true
      and ((i.role = 'admin' and r.grants_all = true) or (i.role <> 'admin' and r.is_default = true))
    on conflict do nothing`.execute(db);

  // 7. record_type_permissions.role enum -> role_id FK (map to system roles).
  await sql`alter table record_type_permissions add column role_id uuid references roles(id) on delete cascade`.execute(db);
  await sql`
    update record_type_permissions rtp set role_id = r.id
    from record_types rt
    join roles r on r.workspace_id = rt.workspace_id and r.is_system = true
    where rtp.record_type_id = rt.id
      and ((rtp.role = 'admin' and r.grants_all = true) or (rtp.role <> 'admin' and r.is_default = true))`.execute(db);
  await sql`alter table record_type_permissions drop column role`.execute(db);

  // 8. Move per-user overrides to the discarded-grants report, then drop them.
  await sql`
    insert into migration_discarded_grants (workspace_id, user_id, permission)
    select workspace_id, user_id, permission from user_permissions where granted = true`.execute(db);
  await sql`delete from user_permissions`.execute(db);

  // 9. Drop the enum column.
  await sql`alter table users drop column role`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Best-effort reverse: restore enum from grants_all membership, then undo renames.
  await sql`alter table users add column role text not null default 'member'`.execute(db);
  await sql`
    update users u set role = 'admin'
    from user_roles ur join roles r on r.id = ur.role_id
    where ur.user_id = u.id and r.grants_all = true`.execute(db);

  await sql`alter table record_type_permissions add column role text`.execute(db);
  await sql`
    update record_type_permissions rtp set role =
      case when r.grants_all then 'admin' else 'member' end
    from roles r where r.id = rtp.role_id`.execute(db);
  await sql`alter table record_type_permissions drop column role_id`.execute(db);

  await sql`drop table if exists migration_discarded_grants`.execute(db);
  await sql`drop table if exists invite_roles`.execute(db);
  await sql`drop table if exists user_session_roles`.execute(db);
  await sql`drop table if exists dsd_set_roles`.execute(db);
  await sql`drop table if exists dsd_sets`.execute(db);
  await sql`drop table if exists ssd_set_roles`.execute(db);
  await sql`drop table if exists ssd_sets`.execute(db);
  await sql`drop table if exists role_inheritance`.execute(db);

  await sql`delete from user_roles ur using roles r where ur.role_id = r.id and r.is_system = true`.execute(db);
  await sql`delete from role_permissions rp using roles r where rp.role_id = r.id and r.is_system = true`.execute(db);
  await sql`delete from roles where is_system = true`.execute(db);

  await sql`alter table roles drop column is_system`.execute(db);
  await sql`alter table roles drop column grants_all`.execute(db);
  await sql`alter table roles drop column is_default`.execute(db);
  await sql`alter table roles drop column max_members`.execute(db);
  await sql`alter table roles drop column rank`.execute(db);
  await sql`alter table role_permissions add column granted boolean not null default true`.execute(db);
  await sql`alter table dashboard_group_assignments rename column role_id to group_id`.execute(db);
  await sql`alter table role_permissions rename column role_id to group_id`.execute(db);
  await sql`alter table role_permissions rename to group_permissions`.execute(db);
  await sql`alter table user_roles rename column role_id to group_id`.execute(db);
  await sql`alter table user_roles rename to group_members`.execute(db);
  await sql`alter table roles rename to groups`.execute(db);
}
```

- [ ] **Step 2: Run the DB test suite (migration applies cleanly)**

Run: `pnpm --filter @vencore/db test`
Expected: PASS (helper tests green; migration compiles).

- [ ] **Step 3: Apply migration against a scratch database**

Run: `pnpm --filter @vencore/db migrate` (against a disposable local DB with seed data)
Expected: completes; `\d roles` shows new columns; `select name from roles where is_system` returns Administrator + Member per workspace.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260714_001_rbac3.ts
git commit -m "feat(db): rbac3 migration — roles, hierarchy, constraints, sessions"
```

---

### Task 5: Update `schema.ts` table interfaces

**Files:**
- Modify: `packages/db/src/schema.ts`

**Interfaces:**
- Produces: `RoleTable`, `UserRoleTable`, `RolePermissionTable`, `RoleInheritanceTable`, `SsdSetTable`, `SsdSetRoleTable`, `DsdSetTable`, `DsdSetRoleTable`, `UserSessionRoleTable`, `InviteRoleTable`, `MigrationDiscardedGrantTable`; `UserTable` without `role`; `RecordTypePermissionTable` with `role_id` not `role`; `Database` map updated (rename `groups`→`roles`, `group_members`→`user_roles`, `group_permissions`→`role_permissions`; add new tables).

- [ ] **Step 1: Edit interfaces**

```ts
// packages/db/src/schema.ts

// UserTable: remove the `role` line entirely.
// export interface UserTable { ... (no role field) ... }

export interface RoleTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  description: string | null;
  color: Generated<string>;
  is_system: Generated<boolean>;
  grants_all: Generated<boolean>;
  is_default: Generated<boolean>;
  max_members: number | null;
  rank: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
export interface UserRoleTable {
  id: Generated<string>;
  workspace_id: string;
  role_id: string;
  user_id: string;
  created_at: Generated<Date>;
}
export interface RolePermissionTable {
  id: Generated<string>;
  workspace_id: string;
  role_id: string;
  permission: string;
  created_at: Generated<Date>;
}
export interface RoleInheritanceTable { parent_role_id: string; child_role_id: string; }
export interface SsdSetTable { id: Generated<string>; workspace_id: string; name: string; cardinality: number; }
export interface SsdSetRoleTable { set_id: string; role_id: string; }
export interface DsdSetTable { id: Generated<string>; workspace_id: string; name: string; cardinality: number; }
export interface DsdSetRoleTable { set_id: string; role_id: string; }
export interface UserSessionRoleTable { user_id: string; role_id: string; active: Generated<boolean>; }
export interface InviteRoleTable { invite_id: string; role_id: string; }
export interface MigrationDiscardedGrantTable {
  id: Generated<string>; workspace_id: string; user_id: string; permission: string; discarded_at: Generated<Date>;
}
```

```ts
// RecordTypePermissionTable: replace `role: 'admin' | 'member'` with:
  role_id: string;
```

```ts
// Database interface: replace group entries and add new tables
  roles: RoleTable;
  user_roles: UserRoleTable;
  role_permissions: RolePermissionTable;
  role_inheritance: RoleInheritanceTable;
  ssd_sets: SsdSetTable;
  ssd_set_roles: SsdSetRoleTable;
  dsd_sets: DsdSetTable;
  dsd_set_roles: DsdSetRoleTable;
  user_session_roles: UserSessionRoleTable;
  invite_roles: InviteRoleTable;
  migration_discarded_grants: MigrationDiscardedGrantTable;
// remove: groups, group_members, group_permissions
```

Also update the convenience exports: replace `Group`/`GroupMember`/`GroupPermission` with `Role`/`UserRole`/`RolePermission` (`Selectable<...>`), and remove `role` from any hand-written `User` usage.

- [ ] **Step 2: Typecheck the db package**

Run: `pnpm --filter @vencore/db exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): schema types for rbac3 tables; drop users.role"
```

---

### Task 6: RBAC closure + cycle detection

**Files:**
- Create: `apps/api/src/lib/rbac/closure.ts`
- Test: `apps/api/src/lib/rbac/closure.test.ts`

**Interfaces:**
- Produces:
  - `type InheritanceEdge = { parent: string; child: string }`
  - `authorizedRoleClosure(roleIds: string[], edges: InheritanceEdge[]): Set<string>` — roleIds plus all transitive children (descendants).
  - `wouldCreateCycle(edges: InheritanceEdge[], newEdge: InheritanceEdge): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/rbac/closure.test.ts
import { describe, it, expect } from 'vitest';
import { authorizedRoleClosure, wouldCreateCycle } from './closure';

const edges = [{ parent: 'A', child: 'B' }, { parent: 'B', child: 'C' }];

describe('authorizedRoleClosure', () => {
  it('includes transitive descendants', () => {
    expect([...authorizedRoleClosure(['A'], edges)].sort()).toEqual(['A', 'B', 'C']);
  });
  it('a leaf resolves to just itself', () => {
    expect([...authorizedRoleClosure(['C'], edges)]).toEqual(['C']);
  });
  it('handles diamonds without duplication', () => {
    const d = [{ parent: 'A', child: 'B' }, { parent: 'A', child: 'C' }, { parent: 'B', child: 'D' }, { parent: 'C', child: 'D' }];
    expect([...authorizedRoleClosure(['A'], d)].sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('wouldCreateCycle', () => {
  it('detects a direct back-edge', () => {
    expect(wouldCreateCycle(edges, { parent: 'C', child: 'A' })).toBe(true);
  });
  it('allows a safe edge', () => {
    expect(wouldCreateCycle(edges, { parent: 'A', child: 'C' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/api test -- rbac/closure.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/lib/rbac/closure.ts
export type InheritanceEdge = { parent: string; child: string };

export function authorizedRoleClosure(roleIds: string[], edges: InheritanceEdge[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = childrenOf.get(e.parent) ?? [];
    list.push(e.child);
    childrenOf.set(e.parent, list);
  }
  const seen = new Set<string>();
  const stack = [...roleIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return seen;
}

// Adding parent->child forms a cycle iff parent is already reachable from child.
export function wouldCreateCycle(edges: InheritanceEdge[], newEdge: InheritanceEdge): boolean {
  return authorizedRoleClosure([newEdge.child], edges).has(newEdge.parent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vencore/api test -- rbac/closure.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/rbac/closure.ts apps/api/src/lib/rbac/closure.test.ts
git commit -m "feat(api): rbac role closure + cycle detection"
```

---

### Task 7: Constraint checks (SSD, DSD, cardinality)

**Files:**
- Create: `apps/api/src/lib/rbac/constraints.ts`
- Test: `apps/api/src/lib/rbac/constraints.test.ts`

**Interfaces:**
- Consumes: `authorizedRoleClosure`, `InheritanceEdge` from Task 6.
- Produces:
  - `type ConstraintSet = { id: string; name: string; cardinality: number; roleIds: string[] }`
  - `checkSSD(authorizedRoleIds: Set<string>, sets: ConstraintSet[]): { setId: string; name: string }[]` — returns violated sets (≥ cardinality authorized roles from a set). Empty = OK.
  - `checkDSD(activeRoleIds: Set<string>, sets: ConstraintSet[]): { setId: string; name: string }[]`.
  - `checkCardinality(role: { id: string; max_members: number | null }, currentMemberCount: number): boolean` — true if a new assignment is allowed.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/rbac/constraints.test.ts
import { describe, it, expect } from 'vitest';
import { checkSSD, checkDSD, checkCardinality, type ConstraintSet } from './constraints';

const set: ConstraintSet = { id: 's1', name: 'Finance SoD', cardinality: 2, roleIds: ['pay', 'approve'] };

describe('checkSSD', () => {
  it('flags holding both mutually-exclusive roles', () => {
    expect(checkSSD(new Set(['pay', 'approve']), [set])).toEqual([{ setId: 's1', name: 'Finance SoD' }]);
  });
  it('passes when only one is held', () => {
    expect(checkSSD(new Set(['pay']), [set])).toEqual([]);
  });
});

describe('checkDSD', () => {
  it('flags activating both together', () => {
    expect(checkDSD(new Set(['pay', 'approve']), [set])).toHaveLength(1);
  });
});

describe('checkCardinality', () => {
  it('blocks assignment at the cap', () => {
    expect(checkCardinality({ id: 'r', max_members: 3 }, 3)).toBe(false);
  });
  it('allows under the cap and when uncapped', () => {
    expect(checkCardinality({ id: 'r', max_members: 3 }, 2)).toBe(true);
    expect(checkCardinality({ id: 'r', max_members: null }, 99)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/api test -- rbac/constraints.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/lib/rbac/constraints.ts
export type ConstraintSet = { id: string; name: string; cardinality: number; roleIds: string[] };

function violated(roleIds: Set<string>, sets: ConstraintSet[]): { setId: string; name: string }[] {
  const out: { setId: string; name: string }[] = [];
  for (const s of sets) {
    const held = s.roleIds.filter(r => roleIds.has(r)).length;
    if (held >= s.cardinality) out.push({ setId: s.id, name: s.name });
  }
  return out;
}

// Caller passes the AUTHORIZED closure (assigned + inherited descendants).
export function checkSSD(authorizedRoleIds: Set<string>, sets: ConstraintSet[]) {
  return violated(authorizedRoleIds, sets);
}

// Caller passes the ACTIVE closure (activated + inherited descendants).
export function checkDSD(activeRoleIds: Set<string>, sets: ConstraintSet[]) {
  return violated(activeRoleIds, sets);
}

export function checkCardinality(role: { id: string; max_members: number | null }, currentMemberCount: number): boolean {
  return role.max_members === null || currentMemberCount < role.max_members;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vencore/api test -- rbac/constraints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/rbac/constraints.ts apps/api/src/lib/rbac/constraints.test.ts
git commit -m "feat(api): rbac SSD/DSD/cardinality checks"
```

---

### Task 8: Pure permission resolution

**Files:**
- Create: `apps/api/src/lib/rbac/resolve.ts`
- Test: `apps/api/src/lib/rbac/resolve.test.ts`

**Interfaces:**
- Consumes: `authorizedRoleClosure`, `InheritanceEdge`.
- Produces:
  - `type RoleResolveInput = { activeRoleIds: string[]; edges: InheritanceEdge[]; grantsAllRoleIds: Set<string>; rolePermissions: Map<string, string[]>; enabledModuleIds: Set<string>; moduleOf: (perm: string) => string | null }`
  - `resolveRolePermissions(input: RoleResolveInput): { superuser: boolean; permissions: Set<string> }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/rbac/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRolePermissions } from './resolve';

const moduleOf = (p: string) => (p.startsWith('contacts') ? 'crm' : p.startsWith('pm.') ? 'projects' : null);

describe('resolveRolePermissions', () => {
  it('short-circuits for a grants_all role', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['admin'], edges: [], grantsAllRoleIds: new Set(['admin']),
      rolePermissions: new Map(), enabledModuleIds: new Set(), moduleOf,
    });
    expect(r.superuser).toBe(true);
  });
  it('unions permissions across active + inherited roles', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['senior'],
      edges: [{ parent: 'senior', child: 'junior' }],
      grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['senior', ['contacts:edit']], ['junior', ['contacts:view']]]),
      enabledModuleIds: new Set(['crm']), moduleOf,
    });
    expect(r.superuser).toBe(false);
    expect(r.permissions.has('contacts:view')).toBe(true);
    expect(r.permissions.has('contacts:edit')).toBe(true);
  });
  it('filters permissions whose module is disabled', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['x'], edges: [], grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['x', ['contacts:view', 'pm.tasks:view']]]),
      enabledModuleIds: new Set(['crm']), moduleOf,
    });
    expect(r.permissions.has('contacts:view')).toBe(true);
    expect(r.permissions.has('pm.tasks:view')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/api test -- rbac/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/lib/rbac/resolve.ts
import { authorizedRoleClosure, type InheritanceEdge } from './closure';

export type RoleResolveInput = {
  activeRoleIds: string[];
  edges: InheritanceEdge[];
  grantsAllRoleIds: Set<string>;
  rolePermissions: Map<string, string[]>;
  enabledModuleIds: Set<string>;
  moduleOf: (perm: string) => string | null;
};

export function resolveRolePermissions(input: RoleResolveInput): { superuser: boolean; permissions: Set<string> } {
  if (input.activeRoleIds.some(id => input.grantsAllRoleIds.has(id))) {
    return { superuser: true, permissions: new Set() };
  }
  const roles = authorizedRoleClosure(input.activeRoleIds, input.edges);
  const perms = new Set<string>();
  for (const roleId of roles) {
    for (const perm of input.rolePermissions.get(roleId) ?? []) {
      const mod = input.moduleOf(perm);
      if (mod === null || input.enabledModuleIds.has(mod)) perms.add(perm);
    }
  }
  return { superuser: false, permissions: perms };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vencore/api test -- rbac/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/rbac/resolve.ts apps/api/src/lib/rbac/resolve.test.ts
git commit -m "feat(api): pure role permission resolver"
```

---

### Task 9: DB-backed resolver in `permission.ts`

**Files:**
- Modify: `apps/api/src/middleware/permission.ts`
- Test: `apps/api/src/middleware/permission.test.ts` (rewrite)

**Interfaces:**
- Consumes: `resolveRolePermissions`, `authorizedRoleClosure`, `getModuleForPermission` (from `@vencore/modules`).
- Produces:
  - `resolveUserPermissions(db, userId, workspaceId, enabledModuleIds): Promise<{ superuser: boolean; permissions: Set<string> }>` — loads active roles, inheritance edges, grants_all set, and role_permissions from DB, then delegates to `resolveRolePermissions`. Cached per user with TTL.
  - `userIsSuperuser(db, userId, workspaceId): Promise<boolean>`.
  - `userHasPermission(db, user: { id: string }, workspaceId, permission): Promise<boolean>` (signature loses `role`).
  - `createRequirePermission(db)` unchanged signature; internally superuser bypass.
  - `invalidatePermissionCache`, `invalidateWorkspacePermissionCache`, `invalidateRoleMemberCaches(db, workspaceId, roleId)`, `__clearPermCacheForTesting` retained.

- [ ] **Step 1: Rewrite the middleware**

```ts
// apps/api/src/middleware/permission.ts
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from './auth';
import { getModuleForPermission } from '@vencore/modules';
import { resolveRolePermissions } from '../lib/rbac/resolve';
import type { InheritanceEdge } from '../lib/rbac/closure';

const permCache = new Map<string, { value: { superuser: boolean; permissions: Set<string> }; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getEnabledModuleIds(db: Kysely<Database>, workspaceId: string): Promise<string[]> {
  const rows = await db.selectFrom('workspace_modules')
    .where('workspace_id', '=', workspaceId).where('enabled', '=', true)
    .select('module_id').execute();
  return rows.map(r => r.module_id);
}

export async function resolveUserPermissions(
  db: Kysely<Database>, userId: string, workspaceId: string, enabledModuleIds: string[],
): Promise<{ superuser: boolean; permissions: Set<string> }> {
  const cacheKey = `${workspaceId}:${userId}`;
  const cached = permCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const activeRows = await db.selectFrom('user_session_roles')
    .where('user_id', '=', userId).where('active', '=', true).select('role_id').execute();
  const activeRoleIds = activeRows.map(r => r.role_id);

  const grantsAllRows = await db.selectFrom('roles')
    .where('workspace_id', '=', workspaceId).where('grants_all', '=', true).select('id').execute();
  const grantsAllRoleIds = new Set(grantsAllRows.map(r => r.id));

  const edgeRows = await db.selectFrom('role_inheritance').selectAll().execute();
  const edges: InheritanceEdge[] = edgeRows.map(e => ({ parent: e.parent_role_id, child: e.child_role_id }));

  const permRows = await db.selectFrom('role_permissions')
    .where('workspace_id', '=', workspaceId).select(['role_id', 'permission']).execute();
  const rolePermissions = new Map<string, string[]>();
  for (const r of permRows) {
    const list = rolePermissions.get(r.role_id) ?? [];
    list.push(r.permission);
    rolePermissions.set(r.role_id, list);
  }

  const value = resolveRolePermissions({
    activeRoleIds, edges, grantsAllRoleIds, rolePermissions,
    enabledModuleIds: new Set(enabledModuleIds), moduleOf: getModuleForPermission,
  });
  permCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function userIsSuperuser(db: Kysely<Database>, userId: string, workspaceId: string): Promise<boolean> {
  const enabled = await getEnabledModuleIds(db, workspaceId);
  return (await resolveUserPermissions(db, userId, workspaceId, enabled)).superuser;
}

export async function userHasPermission(
  db: Kysely<Database>, user: { id: string }, workspaceId: string, permission: string,
): Promise<boolean> {
  const enabled = await getEnabledModuleIds(db, workspaceId);
  const resolved = await resolveUserPermissions(db, user.id, workspaceId, enabled);
  if (resolved.superuser) return true;
  const mod = getModuleForPermission(permission);
  if (mod !== null && !enabled.includes(mod)) return false;
  return resolved.permissions.has(permission);
}

export function invalidatePermissionCache(workspaceId: string, userId: string): void {
  permCache.delete(`${workspaceId}:${userId}`);
}
export function invalidateWorkspacePermissionCache(workspaceId: string): void {
  for (const key of permCache.keys()) if (key.startsWith(`${workspaceId}:`)) permCache.delete(key);
}
export function __clearPermCacheForTesting(): void { permCache.clear(); }

export async function invalidateRoleMemberCaches(db: Kysely<Database>, workspaceId: string, roleId: string): Promise<void> {
  const members = await db.selectFrom('user_roles')
    .where('role_id', '=', roleId).where('workspace_id', '=', workspaceId).select('user_id').execute();
  for (const m of members) invalidatePermissionCache(workspaceId, m.user_id);
}

export function createRequirePermission(db: Kysely<Database>) {
  return function requirePermission(permission: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user, workspace } = req as AuthenticatedRequest;
        const enabled = await getEnabledModuleIds(db, workspace.id);
        const resolved = await resolveUserPermissions(db, user.id, workspace.id, enabled);
        if (resolved.superuser || resolved.permissions.has(permission)) return next();
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
      } catch (err) { next(err); }
    };
  };
}
```

- [ ] **Step 2: Rewrite the test to the role model**

```ts
// apps/api/src/middleware/permission.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveRolePermissions } from '../lib/rbac/resolve';

// The DB wiring is integration-tested in Plan B; here we assert the pure
// resolver contract the middleware relies on.
beforeEach(() => {});

describe('resolver contract used by permission middleware', () => {
  const moduleOf = (p: string) => (p.startsWith('contacts') ? 'crm' : null);
  it('superuser bypasses everything', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['a'], edges: [], grantsAllRoleIds: new Set(['a']),
      rolePermissions: new Map(), enabledModuleIds: new Set(), moduleOf,
    });
    expect(r.superuser).toBe(true);
  });
  it('member gets only granted role perms in enabled modules', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['m'], edges: [], grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['m', ['contacts:view']]]),
      enabledModuleIds: new Set(['crm']), moduleOf,
    });
    expect(r.permissions.has('contacts:view')).toBe(true);
    expect(r.permissions.has('contacts:delete')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @vencore/api test -- middleware/permission.test.ts rbac/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/middleware/permission.ts apps/api/src/middleware/permission.test.ts
git commit -m "feat(api): role-based permission resolver + middleware"
```

---

### Task 10: Auth middleware attaches `isAdmin` + resolved perms

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`

**Interfaces:**
- Consumes: `resolveUserPermissions`.
- Produces: `AuthenticatedRequest` gains `isAdmin: boolean` and `permissions: Set<string>`; `user` type no longer has `role`.

- [ ] **Step 1: Read the current auth middleware to find where `user`/`workspace` are attached**

Run: `sed -n '1,120p' apps/api/src/middleware/auth.ts` (locate the request-augmentation block and the `AuthenticatedRequest` interface).

- [ ] **Step 2: Edit `AuthenticatedRequest` and attach resolved perms**

```ts
// apps/api/src/middleware/auth.ts — in the interface, replace any `role` on user with nothing, and add:
export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; /* no role */ };
  workspace: { id: string };
  isAdmin: boolean;
  permissions: Set<string>;
}

// After user + workspace are resolved in the auth handler, before next():
const enabled = await getEnabledModuleIds(db, workspace.id);
const resolved = await resolveUserPermissions(db, user.id, workspace.id, enabled);
(req as AuthenticatedRequest).isAdmin = resolved.superuser;
(req as AuthenticatedRequest).permissions = resolved.permissions;
```

Add imports: `import { getEnabledModuleIds, resolveUserPermissions } from './permission';`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vencore/api exec tsc --noEmit`
Expected: many errors in call sites that read `user.role` — that's Task 12. Auth file itself compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/middleware/auth.ts
git commit -m "feat(api): attach isAdmin + resolved permissions to authenticated requests"
```

---

### Task 11: Purge `getDefaultPermissionsForRole` from live paths

**Files:**
- Modify: `packages/modules/src/index.ts`

**Interfaces:**
- Produces: `getDefaultPermissionsForRole` retained but marked `@deprecated` (used only by migration seed helper + role-create template). No runtime resolve path calls it.

- [ ] **Step 1: Grep for live callers**

Run: `rg "getDefaultPermissionsForRole" apps packages --type ts`
Expected: only `packages/db/migrations/20260714_001_rbac3.helpers.ts` and (later) the role-create endpoint template. Any `apps/api` route still calling it is a leftover — note it for Task 12.

- [ ] **Step 2: Annotate**

```ts
// packages/modules/src/index.ts
/** @deprecated Roles are explicit DB permission sets now. Use only for seeding/templates. */
export function getDefaultPermissionsForRole(role: UserRole): string[] {
  return getAllPermissions().filter(p => p.defaultRoles.includes(role)).map(p => p.key);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/modules/src/index.ts
git commit -m "chore(modules): deprecate getDefaultPermissionsForRole (seed/template only)"
```

---

### Task 12: Convert `role === 'admin'` / `isAdmin` call sites

**Files (from the session grep — verify with the command in Step 1):**
- API (superuser → `req.isAdmin`, or feature gate → `requirePermission('x:manage')`):
  `apps/api/src/routes/hub-settings.ts`, `hub-providers.ts`, `hooks.ts`, `invites.ts`, `infra-databases.ts`, `dashboards.ts`, `me.ts`, `module-event-settings.ts`, `notification-preferences.ts`, `messaging/messages.ts`, `messaging/channels.ts`, `workspace-modules.ts`, `users.ts`, `tasks.ts`, `tasks-unified.ts`, `lib/record-type-permission.ts`.
- Web (reads `user.role`/`isAdmin` — will be replaced by `hasPermission` in Plan C; here just make them compile against the new `User` type):
  `apps/web/store/auth-slice.ts`, `apps/web/modules/shared/lib/AuthContext.tsx`.

**Interfaces:**
- Consumes: `req.isAdmin`, `createRequirePermission(db)('<key>')`.
- Produces: zero references to `user.role`/`req.user.role` in `apps/api`; `@vencore/db` `User` type has no `role`.

- [ ] **Step 1: Enumerate remaining references**

Run: `rg "\.role\s*(===|!==)\s*['\"]admin['\"]|user\.role|req\.user\.role" apps/api --type ts -n`
Expected: a concrete list. Each becomes either `req.isAdmin` (genuine superuser check) or a `requirePermission('<x>:manage')` route guard.

- [ ] **Step 2: Convert superuser checks**

For each occurrence that means "only admins can do this workspace action", pick the mapping:
```ts
// BEFORE
if (user.role !== 'admin') { res.status(403)...; return; }
// AFTER — superuser-only action
if (!(req as AuthenticatedRequest).isAdmin) { res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } }); return; }
```
```ts
// BETTER — grantable workspace-management action, mount the guard on the route
const requirePermission = createRequirePermission(db);
router.post('/', requirePermission('modules:manage'), async (req, res, next) => { ... });
```
Mapping per file: `workspace-modules.ts` → `modules:manage`; `invites.ts`/`users.ts` → `users:manage`; `hub-settings.ts`/`hub-providers.ts`/`hooks.ts` → `integrations:manage`; `dashboards.ts` (mutations) → `workspace:manage`; `notification-preferences.ts`/`module-event-settings.ts` → `workspace:manage`; `infra-databases.ts` admin-only ops → keep `req.isAdmin` unless a finer infra key exists. `me.ts` → return `{ isAdmin, permissions: [...] }` instead of `role` (Step 4).

- [ ] **Step 3: Convert `lib/record-type-permission.ts`**

```ts
// resolve per active+inherited role_id: op allowed if any granting row exists.
// Replace the `role === 'admin'` branch with an isAdmin/superuser short-circuit,
// then check record_type_permissions rows for the user's authorized role_ids.
export async function canOnRecordType(
  db: Kysely<Database>, args: { userId: string; workspaceId: string; recordTypeId: string; op: 'view'|'create'|'edit'|'delete' },
): Promise<boolean> {
  if (await userIsSuperuser(db, args.userId, args.workspaceId)) return true;
  const roleRows = await db.selectFrom('user_roles')
    .where('user_id', '=', args.userId).where('workspace_id', '=', args.workspaceId).select('role_id').execute();
  const roleIds = roleRows.map(r => r.role_id);
  if (roleIds.length === 0) return false;
  const col = ({ view: 'can_view', create: 'can_create', edit: 'can_edit', delete: 'can_delete' } as const)[args.op];
  const row = await db.selectFrom('record_type_permissions')
    .where('record_type_id', '=', args.recordTypeId).where('role_id', 'in', roleIds).where(col, '=', true)
    .select('role_id').executeTakeFirst();
  return !!row;
}
```
(Adjust to the file's existing exported function name and signature discovered in Step 1.)

- [ ] **Step 4: Update `me.ts`**

```ts
// GET /api/me returns identity + resolved access instead of role.
res.json({ data: {
  user: { id: user.id, name: user.name, email: user.email },
  workspace,
  isAdmin: (req as AuthenticatedRequest).isAdmin,
  permissions: [...(req as AuthenticatedRequest).permissions],
}, error: null });
```

- [ ] **Step 5: Make web types compile**

In `apps/web/store/auth-slice.ts` and `apps/web/modules/shared/lib/AuthContext.tsx`, remove `role` from the user type and add `isAdmin: boolean; permissions: string[]` sourced from `/api/me`. Full gating logic lands in Plan C — here only fix the types so the workspace builds.

- [ ] **Step 6: Typecheck the whole workspace**

Run: `pnpm -w exec tsc --noEmit` (or `pnpm -r exec tsc --noEmit`)
Expected: PASS — zero `user.role` references remain.

- [ ] **Step 7: Run the API test suite**

Run: `pnpm --filter @vencore/api test`
Expected: PASS (update any test that constructed a `user` with `role`; assert new gates instead).

- [ ] **Step 8: Commit**

```bash
git add apps/api apps/web/store/auth-slice.ts apps/web/modules/shared/lib/AuthContext.tsx
git commit -m "refactor: replace admin/member enum checks with isAdmin + permission guards"
```

---

### Task 13: Phase A verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm -r exec tsc --noEmit`
Expected: PASS across all packages.

- [ ] **Step 2: Full test suites touched by Plan A**

Run: `pnpm --filter @vencore/modules test && pnpm --filter @vencore/db test && pnpm --filter @vencore/api test`
Expected: PASS.

- [ ] **Step 3: Migration round-trip on a scratch DB**

Run: apply `up`, confirm `roles`/`user_roles`/`role_permissions` + new tables exist, system roles seeded, `users.role` gone, `migration_discarded_grants` populated from prior overrides; then apply `down` and confirm `groups*` restored.
Expected: both directions succeed.

- [ ] **Step 4: Update the knowledge graph**

Run: `graphify update .`

- [ ] **Step 5: Commit any test fixups**

```bash
git add -A
git commit -m "test(rbac3): phase A verification green"
```

---

## Self-Review

- **Spec coverage (§4 data model):** Tasks 4–5 create every table incl. hierarchy/constraints/sessions/invite_roles/discarded-grants; drop `users.role`; migrate invites + record_type_permissions. ✓
- **§5 registry/fine-graining:** Tasks 1–2 (groups, PM keys, Administration namespace, legacy map). ✓
- **§6 resolution/enforcement:** Tasks 6, 8, 9, 10, 12 (closure, resolve, DB resolver, isAdmin attach, ~50-site conversion). ✓
- **§7 constraints engine:** Task 7 (SSD/DSD/cardinality) + Task 6 cycle detection. API wiring of constraints on mutations is Plan B (endpoints don't exist yet). ✓ (noted)
- **Overrides discarded + report (§3/§9):** Task 4 step 8. ✓
- **Placeholder scan:** every code step shows real code; per-file mapping in Task 12 is explicit. ✓
- **Type consistency:** `resolveRolePermissions` / `authorizedRoleClosure` / `ConstraintSet` / `resolveUserPermissions` signatures match across tasks 6–10, 12. ✓

**Deferred to Plan B by design:** applying `checkSSD`/`checkDSD`/`checkCardinality` on assignment/activation endpoints (endpoints created in Plan B); the discarded-grants read endpoint; roles/constraints CRUD.
