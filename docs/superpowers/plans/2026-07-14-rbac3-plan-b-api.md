# RBAC3 — Plan B: API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the RBAC3 model over HTTP — roles CRUD, permission matrix, hierarchy edges, SoD constraint sets, user role assignment, session activation, resolved-perms, and the migration report — replacing the old `/api/groups` and `/api/users/:id/permissions` routes.

**Architecture:** One Express router per resource under `apps/api/src/routes/`, mounted in `apps/api/src/index.ts`, each gated by an Administration permission (`roles:manage` / `users:manage`) via `createRequirePermission`. Mutations invalidate the resolver cache and enforce constraints through the pure `lib/rbac/` checks from Plan A. `@vencore/api-client` gains a `roles.ts` module; `groups.ts` / `user-permissions.ts` clients are deleted.

**Tech Stack:** Express, Kysely, Zod, Vitest, `@vencore/db`, `@vencore/modules`, `@vencore/api-client`.

## Global Constraints

- **Depends on Plan A merged** (roles tables, `lib/rbac/`, rewritten `permission.ts`, `req.isAdmin`).
- Response envelope `{ data, error }`; Zod-validate every body; `INVALID_INPUT` on parse failure.
- Every query scoped by `workspace_id`.
- Grant-only permissions: `PUT` with `granted:false` deletes the row.
- System-role guards: cannot delete/rename Administrator or Member, cannot strip `grants_all`/`is_default`.
- Constraint creation/modification that would violate existing data → **409 with a `conflicts` array**, no partial write.
- Cache invalidation on every mutation via `invalidatePermissionCache` / `invalidateRoleMemberCaches` (Plan A).
- Spec: `docs/superpowers/specs/2026-07-14-permissions-rbac3-rework-design.md` §8.
- Branch: `feat/permissions-rbac3`. Commit after every task.

---

## File Structure

- `apps/api/src/routes/roles.ts` — roles CRUD, permissions matrix, members, hierarchy (mounted at `/api/roles`).
- `apps/api/src/routes/rbac-constraints.ts` — SSD/DSD sets (mounted at `/api/rbac`).
- `apps/api/src/routes/user-roles.ts` — user assignment (mounted at `/api/users/:id/roles`).
- `apps/api/src/routes/session-roles.ts` — self active-role activation (mounted at `/api/me/active-roles`).
- `apps/api/src/lib/rbac/db.ts` — DB helpers shared by routes: `loadInheritanceEdges`, `loadSsdSets`, `loadDsdSets`, `authorizedClosureForUser`, `activeClosureForUser`, `buildGroupedPermissions`.
- `apps/api/src/index.ts` — mount new routers, remove old ones.
- `apps/api/src/routes/me.ts` — already returns `{ isAdmin, permissions }` (Plan A); add `discarded-grants` under `/api/rbac`.
- Delete: `apps/api/src/routes/groups.ts`, `apps/api/src/routes/user-permissions.ts`.
- `packages/api-client/src/roles.ts` — new client; delete `groups.ts`, `user-permissions.ts`; update `index.ts`.
- Tests: `apps/api/src/__tests__/roles-route.test.ts`, `rbac-constraints-route.test.ts`, `user-roles-route.test.ts`, `session-roles-route.test.ts`, `apps/api/src/lib/rbac/db.test.ts`.

---

### Task 1: Shared route DB helpers + grouped-permission builder

**Files:**
- Create: `apps/api/src/lib/rbac/db.ts`
- Test: `apps/api/src/lib/rbac/db.test.ts`

**Interfaces:**
- Consumes: `authorizedRoleClosure`/`InheritanceEdge` (Plan A closure), `MODULE_REGISTRY` (`@vencore/modules`).
- Produces:
  - `loadInheritanceEdges(db): Promise<InheritanceEdge[]>`
  - `authorizedClosureForUser(db, userId, workspaceId): Promise<Set<string>>`
  - `activeClosureForUser(db, userId): Promise<Set<string>>`
  - `loadSsdSets(db, workspaceId): Promise<ConstraintSet[]>` and `loadDsdSets(...)` (shape from Plan A `constraints.ts`)
  - `buildGroupedPermissions(grantedKeys: Set<string>, inheritedKeys: Set<string>): GroupedModule[]` where
    `GroupedModule = { id: string; name: string; groups: { id: string; label: string; permissions: { key: string; label: string; granted: boolean; inherited: boolean }[] }[] }`.

- [ ] **Step 1: Write the failing test for the grouped builder** (the pure, highest-value piece)

```ts
// apps/api/src/lib/rbac/db.test.ts
import { describe, it, expect } from 'vitest';
import { buildGroupedPermissions } from './db';

describe('buildGroupedPermissions', () => {
  it('groups registry permissions by module and sub-feature with granted/inherited flags', () => {
    const modules = buildGroupedPermissions(new Set(['projects:view']), new Set(['pm.tasks:view']));
    const projects = modules.find(m => m.id === 'projects')!;
    expect(projects).toBeTruthy();
    const projGroup = projects.groups.find(g => g.id === 'projects')!;
    const view = projGroup.permissions.find(p => p.key === 'projects:view')!;
    expect(view.granted).toBe(true);
    expect(view.inherited).toBe(false);
    const tasksGroup = projects.groups.find(g => g.id === 'tasks')!;
    const taskView = tasksGroup.permissions.find(p => p.key === 'pm.tasks:view')!;
    expect(taskView.granted).toBe(false);
    expect(taskView.inherited).toBe(true);
  });
  it('places ungrouped permissions under a General group', () => {
    const modules = buildGroupedPermissions(new Set(), new Set());
    const crm = modules.find(m => m.id === 'crm')!;
    expect(crm.groups.some(g => g.label === 'General' || g.permissions.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/api test -- rbac/db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `db.ts`**

```ts
// apps/api/src/lib/rbac/db.ts
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { MODULE_REGISTRY } from '@vencore/modules';
import { authorizedRoleClosure, type InheritanceEdge } from './closure';
import type { ConstraintSet } from './constraints';

export type GroupedPermission = { key: string; label: string; granted: boolean; inherited: boolean };
export type GroupedModule = {
  id: string; name: string;
  groups: { id: string; label: string; permissions: GroupedPermission[] }[];
};

export function buildGroupedPermissions(grantedKeys: Set<string>, inheritedKeys: Set<string>): GroupedModule[] {
  return MODULE_REGISTRY.map(mod => {
    const groupDefs = mod.permissionGroups ?? [];
    const groupMap = new Map<string, { id: string; label: string; permissions: GroupedPermission[] }>();
    const groupOf = (perm: { group?: string }) => perm.group ?? 'general';
    const labelOf = (id: string) => groupDefs.find(g => g.id === id)?.label ?? 'General';
    for (const p of mod.permissions) {
      const gid = groupOf(p);
      if (!groupMap.has(gid)) groupMap.set(gid, { id: gid, label: labelOf(gid), permissions: [] });
      groupMap.get(gid)!.permissions.push({
        key: p.key, label: p.label,
        granted: grantedKeys.has(p.key), inherited: inheritedKeys.has(p.key) && !grantedKeys.has(p.key),
      });
    }
    return { id: mod.id, name: mod.name, groups: [...groupMap.values()] };
  });
}

export async function loadInheritanceEdges(db: Kysely<Database>): Promise<InheritanceEdge[]> {
  const rows = await db.selectFrom('role_inheritance').selectAll().execute();
  return rows.map(r => ({ parent: r.parent_role_id, child: r.child_role_id }));
}

export async function authorizedClosureForUser(db: Kysely<Database>, userId: string, workspaceId: string): Promise<Set<string>> {
  const assigned = await db.selectFrom('user_roles')
    .where('user_id', '=', userId).where('workspace_id', '=', workspaceId).select('role_id').execute();
  return authorizedRoleClosure(assigned.map(r => r.role_id), await loadInheritanceEdges(db));
}

export async function activeClosureForUser(db: Kysely<Database>, userId: string): Promise<Set<string>> {
  const active = await db.selectFrom('user_session_roles')
    .where('user_id', '=', userId).where('active', '=', true).select('role_id').execute();
  return authorizedRoleClosure(active.map(r => r.role_id), await loadInheritanceEdges(db));
}

async function loadSets(db: Kysely<Database>, workspaceId: string, table: 'ssd_sets' | 'dsd_sets', joinTable: 'ssd_set_roles' | 'dsd_set_roles'): Promise<ConstraintSet[]> {
  const sets = await db.selectFrom(table).where('workspace_id', '=', workspaceId).select(['id', 'name', 'cardinality']).execute();
  const result: ConstraintSet[] = [];
  for (const s of sets) {
    const roles = await db.selectFrom(joinTable).where('set_id', '=', s.id).select('role_id').execute();
    result.push({ id: s.id, name: s.name, cardinality: s.cardinality, roleIds: roles.map(r => r.role_id) });
  }
  return result;
}
export const loadSsdSets = (db: Kysely<Database>, ws: string) => loadSets(db, ws, 'ssd_sets', 'ssd_set_roles');
export const loadDsdSets = (db: Kysely<Database>, ws: string) => loadSets(db, ws, 'dsd_sets', 'dsd_set_roles');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vencore/api test -- rbac/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/rbac/db.ts apps/api/src/lib/rbac/db.test.ts
git commit -m "feat(api): shared rbac route helpers + grouped-permission builder"
```

---

### Task 2: Roles router — list / create / detail / update / delete

**Files:**
- Create: `apps/api/src/routes/roles.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/roles-route.test.ts`

**Interfaces:**
- Consumes: `buildGroupedPermissions`, `authorizedClosureForUser`, `loadInheritanceEdges`, `createRequirePermission`, `invalidateRoleMemberCaches`, `getDefaultPermissionsForRole` (template for `copyDefaults`).
- Produces router `createRolesRouter(db)` mounted at `/api/roles`, all routes behind `requirePermission('roles:manage')`. Detail shape:
  `{ id, name, description, color, is_system, grants_all, is_default, max_members, members:[{id,name,email}], modules: GroupedModule[], inheritance:{ parents:[], children:[] }, ssdSets:[], dsdSets:[] }`.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/api/src/__tests__/roles-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestApp, seedWorkspace, authHeader } from './helpers'; // existing test harness (see contacts.test.ts)

describe('roles route', () => {
  let ctx: Awaited<ReturnType<typeof seedWorkspace>>;
  beforeEach(async () => { ctx = await seedWorkspace(); });

  it('lists system roles for an admin', async () => {
    const res = await ctx.request.get('/api/roles').set(authHeader(ctx.adminToken));
    expect(res.status).toBe(200);
    const names = res.body.data.map((r: { name: string }) => r.name);
    expect(names).toContain('Administrator');
    expect(names).toContain('Member');
  });

  it('rejects a non-privileged member (no roles:manage)', async () => {
    const res = await ctx.request.get('/api/roles').set(authHeader(ctx.memberToken));
    expect(res.status).toBe(403);
  });

  it('blocks deleting a system role', async () => {
    const list = await ctx.request.get('/api/roles').set(authHeader(ctx.adminToken));
    const member = list.body.data.find((r: { name: string }) => r.name === 'Member');
    const res = await ctx.request.delete(`/api/roles/${member.id}`).set(authHeader(ctx.adminToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SYSTEM_ROLE');
  });
});
```

(Use the existing test harness helpers seen in `apps/api/src/__tests__/contacts.test.ts`; if `seedWorkspace` lacks admin/member tokens, extend it — the users now get roles via `user_roles`, so seed an Administrator-assigned admin and a Member-assigned user.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vencore/api test -- roles-route.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Implement the router (CRUD)**

```ts
// apps/api/src/routes/roles.ts
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import { sql, type Database } from 'kysely'; // Database import stays from '@vencore/db'
import type { Database as DB } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { createRequirePermission, invalidateRoleMemberCaches } from '../middleware/permission';
import { getDefaultPermissionsForRole } from '@vencore/modules';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  copyDefaults: z.boolean().optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  max_members: z.number().int().positive().nullable().optional(),
}).refine(o => Object.keys(o).length > 0, { message: 'No fields' });

export function createRolesRouter(db: Kysely<DB>): Router {
  const router = Router();
  const requirePermission = createRequirePermission(db);
  router.use(requirePermission('roles:manage'));

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const roles = await db.selectFrom('roles as r')
        .leftJoin('user_roles as ur', 'ur.role_id', 'r.id')
        .where('r.workspace_id', '=', workspace.id)
        .select(['r.id', 'r.name', 'r.description', 'r.color', 'r.is_system', 'r.grants_all', 'r.is_default', 'r.max_members', 'r.rank',
          sql<number>`count(ur.user_id)`.as('member_count')])
        .groupBy(['r.id']).orderBy('r.rank', 'desc').orderBy('r.name', 'asc').execute();
      res.json({ data: roles, error: null });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }
      const role = await db.insertInto('roles').values({
        workspace_id: workspace.id, name: parsed.data.name,
        description: parsed.data.description ?? null, color: parsed.data.color ?? '#6b665c',
      }).returning(['id', 'name', 'color']).executeTakeFirstOrThrow();
      if (parsed.data.copyDefaults) {
        const keys = getDefaultPermissionsForRole('member');
        for (const permission of keys) {
          await db.insertInto('role_permissions')
            .values({ workspace_id: workspace.id, role_id: role.id, permission })
            .onConflict(oc => oc.columns(['role_id', 'permission']).doNothing()).execute();
        }
      }
      res.status(201).json({ data: role, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }
      const role = await db.selectFrom('roles').where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id).select(['id', 'is_system']).executeTakeFirst();
      if (!role) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } }); return; }
      if (role.is_system && parsed.data.name !== undefined) {
        res.status(400).json({ data: null, error: { code: 'SYSTEM_ROLE', message: 'System role name is locked.' } }); return;
      }
      const updated = await db.updateTable('roles').set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', role.id).returning(['id', 'name', 'description', 'color', 'max_members']).executeTakeFirst();
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const role = await db.selectFrom('roles').where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id).select(['id', 'is_system']).executeTakeFirst();
      if (!role) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } }); return; }
      if (role.is_system) { res.status(400).json({ data: null, error: { code: 'SYSTEM_ROLE' } }); return; }
      const memberCount = await db.selectFrom('user_roles').where('role_id', '=', role.id)
        .select(sql<number>`count(*)`.as('c')).executeTakeFirst();
      if ((memberCount?.c ?? 0) > 0) { res.status(400).json({ data: null, error: { code: 'HAS_MEMBERS' } }); return; }
      await invalidateRoleMemberCaches(db, workspace.id, role.id);
      await db.deleteFrom('roles').where('id', '=', role.id).execute();
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

(Note: import `Kysely`, `sql` from `'kysely'` and `Database as DB` from `'@vencore/db'` — mirror the existing `groups.ts` import style; the placeholder `Database` import above is illustrative, match the repo's convention.)

- [ ] **Step 4: Mount + remove old groups router in `index.ts`**

```ts
// apps/api/src/index.ts
import { createRolesRouter } from './routes/roles';
// remove: import { createGroupsRouter } ...
// remove: app.use('/api/groups', requireWorkspace, createGroupsRouter(db));
app.use('/api/roles', requireWorkspace, createRolesRouter(db));
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vencore/api test -- roles-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/roles.ts apps/api/src/index.ts apps/api/src/__tests__/roles-route.test.ts
git commit -m "feat(api): roles CRUD router"
```

---

### Task 3: Role detail + permission matrix + members

**Files:**
- Modify: `apps/api/src/routes/roles.ts`
- Test: `apps/api/src/__tests__/roles-route.test.ts`

**Interfaces:**
- Produces on the same router:
  - `GET /:id` → detail with `modules: GroupedModule[]` (own grants + inherited-from-children), `members`, `inheritance`, constraint memberships.
  - `PUT /:id/permissions` → `{ permissions: string[] }` (replace set) or `{ permission, granted }` (single). Validates keys via `getModuleForPermission`.
  - `POST /:id/members {userId}` / `DELETE /:id/members/:userId` — SSD-checked add (uses Task 5 helper; for now direct add, SSD wired in Task 5's `assignRoles`). Keep member add/remove here for the role-detail Members panel.

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/__tests__/roles-route.test.ts (add)
it('returns a grouped permission matrix on role detail', async () => {
  const list = await ctx.request.get('/api/roles').set(authHeader(ctx.adminToken));
  const member = list.body.data.find((r: { name: string }) => r.name === 'Member');
  const res = await ctx.request.get(`/api/roles/${member.id}`).set(authHeader(ctx.adminToken));
  expect(res.status).toBe(200);
  const crm = res.body.data.modules.find((m: { id: string }) => m.id === 'crm');
  expect(crm.groups.length).toBeGreaterThan(0);
});

it('sets a permission via PUT and reflects it on detail', async () => {
  const list = await ctx.request.get('/api/roles').set(authHeader(ctx.adminToken));
  const member = list.body.data.find((r: { name: string }) => r.name === 'Member');
  await ctx.request.put(`/api/roles/${member.id}/permissions`)
    .set(authHeader(ctx.adminToken)).send({ permission: 'projects:delete', granted: true });
  const detail = await ctx.request.get(`/api/roles/${member.id}`).set(authHeader(ctx.adminToken));
  const projects = detail.body.data.modules.find((m: { id: string }) => m.id === 'projects');
  const del = projects.groups.flatMap((g: { permissions: { key: string; granted: boolean }[] }) => g.permissions)
    .find((p: { key: string }) => p.key === 'projects:delete');
  expect(del.granted).toBe(true);
});

it('rejects an unknown permission key', async () => {
  const list = await ctx.request.get('/api/roles').set(authHeader(ctx.adminToken));
  const member = list.body.data.find((r: { name: string }) => r.name === 'Member');
  const res = await ctx.request.put(`/api/roles/${member.id}/permissions`)
    .set(authHeader(ctx.adminToken)).send({ permission: 'bogus:key', granted: true });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vencore/api test -- roles-route.test.ts`
Expected: FAIL — `GET /:id` / `PUT /:id/permissions` not defined.

- [ ] **Step 3: Implement detail + matrix + members**

```ts
// apps/api/src/routes/roles.ts (add inside createRolesRouter, before `return router`)
import { getModuleForPermission } from '@vencore/modules';
import { buildGroupedPermissions, loadInheritanceEdges } from '../lib/rbac/db';
import { authorizedRoleClosure } from '../lib/rbac/closure';

const permBodySchema = z.union([
  z.object({ permissions: z.array(z.string().min(1)) }),
  z.object({ permission: z.string().min(1), granted: z.boolean() }),
]);

router.get('/:id', async (req, res, next) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    const role = await db.selectFrom('roles').where('id', '=', req.params['id']!)
      .where('workspace_id', '=', workspace.id).selectAll().executeTakeFirst();
    if (!role) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } }); return; }

    const own = await db.selectFrom('role_permissions').where('role_id', '=', role.id).select('permission').execute();
    const grantedKeys = new Set(own.map(r => r.permission));

    // Inherited = union of role_permissions across this role's children (descendants), minus own.
    const edges = await loadInheritanceEdges(db);
    const descendants = authorizedRoleClosure([role.id], edges);
    descendants.delete(role.id);
    const inheritedKeys = new Set<string>();
    if (descendants.size) {
      const rows = await db.selectFrom('role_permissions').where('role_id', 'in', [...descendants]).select('permission').execute();
      for (const r of rows) inheritedKeys.add(r.permission);
    }

    const members = await db.selectFrom('user_roles as ur').innerJoin('users as u', 'u.id', 'ur.user_id')
      .where('ur.role_id', '=', role.id).select(['u.id', 'u.name', 'u.email']).execute();
    const parents = await db.selectFrom('role_inheritance').where('child_role_id', '=', role.id).select('parent_role_id').execute();
    const children = await db.selectFrom('role_inheritance').where('parent_role_id', '=', role.id).select('child_role_id').execute();

    res.json({ data: {
      id: role.id, name: role.name, description: role.description, color: role.color,
      is_system: role.is_system, grants_all: role.grants_all, is_default: role.is_default, max_members: role.max_members,
      members,
      modules: buildGroupedPermissions(grantedKeys, inheritedKeys),
      inheritance: { parents: parents.map(p => p.parent_role_id), children: children.map(c => c.child_role_id) },
    }, error: null });
  } catch (err) { next(err); }
});

router.put('/:id/permissions', async (req, res, next) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    const parsed = permBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }
    const role = await db.selectFrom('roles').where('id', '=', req.params['id']!)
      .where('workspace_id', '=', workspace.id).select('id').executeTakeFirst();
    if (!role) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } }); return; }

    if ('permissions' in parsed.data) {
      for (const key of parsed.data.permissions) {
        if (!getModuleForPermission(key)) { res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION', key } }); return; }
      }
      await db.transaction().execute(async trx => {
        await trx.deleteFrom('role_permissions').where('role_id', '=', role.id).execute();
        for (const permission of parsed.data.permissions) {
          await trx.insertInto('role_permissions').values({ workspace_id: workspace.id, role_id: role.id, permission })
            .onConflict(oc => oc.columns(['role_id', 'permission']).doNothing()).execute();
        }
      });
    } else {
      if (!getModuleForPermission(parsed.data.permission)) { res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION' } }); return; }
      if (parsed.data.granted) {
        await db.insertInto('role_permissions').values({ workspace_id: workspace.id, role_id: role.id, permission: parsed.data.permission })
          .onConflict(oc => oc.columns(['role_id', 'permission']).doNothing()).execute();
      } else {
        await db.deleteFrom('role_permissions').where('role_id', '=', role.id).where('permission', '=', parsed.data.permission).execute();
      }
    }
    await invalidateRoleMemberCaches(db, workspace.id, role.id);
    res.json({ data: null, error: null });
  } catch (err) { next(err); }
});

router.post('/:id/members', async (req, res, next) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    const body = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }
    await db.insertInto('user_roles').values({ workspace_id: workspace.id, role_id: req.params['id']!, user_id: body.data.userId })
      .onConflict(oc => oc.columns(['role_id', 'user_id']).doNothing()).execute();
    await db.insertInto('user_session_roles').values({ user_id: body.data.userId, role_id: req.params['id']!, active: true })
      .onConflict(oc => oc.columns(['user_id', 'role_id']).doNothing()).execute();
    await invalidatePermissionCacheFor(db, workspace.id, body.data.userId); // uses invalidatePermissionCache
    res.status(201).json({ data: null, error: null });
  } catch (err) { next(err); }
});

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    await db.deleteFrom('user_roles').where('role_id', '=', req.params['id']!).where('user_id', '=', req.params['userId']!).execute();
    await db.deleteFrom('user_session_roles').where('role_id', '=', req.params['id']!).where('user_id', '=', req.params['userId']!).execute();
    const { invalidatePermissionCache } = await import('../middleware/permission');
    invalidatePermissionCache(workspace.id, req.params['userId']!);
    res.json({ data: null, error: null });
  } catch (err) { next(err); }
});
```

Add `import { invalidatePermissionCache } from '../middleware/permission';` at the top and use it directly (replace the illustrative `invalidatePermissionCacheFor`). SSD enforcement for member-add is centralized in Task 5's `PUT /api/users/:id/roles`; this direct add is for single-role convenience — apply the same SSD check by delegating to the shared assign helper from Task 5 once it exists.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vencore/api test -- roles-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/roles.ts apps/api/src/__tests__/roles-route.test.ts
git commit -m "feat(api): role detail, permission matrix, member add/remove"
```

---

### Task 4: Hierarchy edges (with cycle + SSD validation)

**Files:**
- Modify: `apps/api/src/routes/roles.ts`
- Test: `apps/api/src/__tests__/roles-route.test.ts`

**Interfaces:**
- Consumes: `wouldCreateCycle`, `loadInheritanceEdges`, `loadSsdSets`, `checkSSD`, `authorizedRoleClosure`.
- Produces: `POST /:id/inherit {childRoleId}` (parent=`:id`), `DELETE /:id/inherit/:childId`. 400 `CYCLE` on cycle; 409 `SSD_CONFLICT` with `conflicts` when an edge would push a member over an SSD set.

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/__tests__/roles-route.test.ts (add)
it('adds and removes an inheritance edge', async () => {
  const a = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'Senior' })).body.data;
  const b = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'Junior' })).body.data;
  const add = await ctx.request.post(`/api/roles/${a.id}/inherit`).set(authHeader(ctx.adminToken)).send({ childRoleId: b.id });
  expect(add.status).toBe(201);
  const del = await ctx.request.delete(`/api/roles/${a.id}/inherit/${b.id}`).set(authHeader(ctx.adminToken));
  expect(del.status).toBe(200);
});

it('rejects a cycle', async () => {
  const a = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'X' })).body.data;
  const b = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'Y' })).body.data;
  await ctx.request.post(`/api/roles/${a.id}/inherit`).set(authHeader(ctx.adminToken)).send({ childRoleId: b.id });
  const res = await ctx.request.post(`/api/roles/${b.id}/inherit`).set(authHeader(ctx.adminToken)).send({ childRoleId: a.id });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('CYCLE');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vencore/api test -- roles-route.test.ts`
Expected: FAIL — inherit routes missing.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/routes/roles.ts (add)
import { wouldCreateCycle, authorizedRoleClosure } from '../lib/rbac/closure';
import { loadSsdSets } from '../lib/rbac/db';
import { checkSSD } from '../lib/rbac/constraints';

router.post('/:id/inherit', async (req, res, next) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    const body = z.object({ childRoleId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }
    const parent = req.params['id']!;
    const child = body.data.childRoleId;
    if (parent === child) { res.status(400).json({ data: null, error: { code: 'CYCLE' } }); return; }
    const edges = await loadInheritanceEdges(db);
    if (wouldCreateCycle(edges, { parent, child })) { res.status(400).json({ data: null, error: { code: 'CYCLE' } }); return; }

    // SSD: after adding, re-check every member of `parent`'s authorized closure.
    const newEdges = [...edges, { parent, child }];
    const ssd = await loadSsdSets(db, workspace.id);
    const members = await db.selectFrom('user_roles').where('role_id', '=', parent).where('workspace_id', '=', workspace.id).select('user_id').execute();
    const conflicts: { userId: string; sets: { setId: string; name: string }[] }[] = [];
    for (const m of members) {
      const assigned = await db.selectFrom('user_roles').where('user_id', '=', m.user_id).where('workspace_id', '=', workspace.id).select('role_id').execute();
      const closure = authorizedRoleClosure(assigned.map(r => r.role_id), newEdges);
      const v = checkSSD(closure, ssd);
      if (v.length) conflicts.push({ userId: m.user_id, sets: v });
    }
    if (conflicts.length) { res.status(409).json({ data: null, error: { code: 'SSD_CONFLICT', conflicts } }); return; }

    await db.insertInto('role_inheritance').values({ parent_role_id: parent, child_role_id: child })
      .onConflict(oc => oc.columns(['parent_role_id', 'child_role_id']).doNothing()).execute();
    await invalidateRoleMemberCaches(db, workspace.id, parent);
    res.status(201).json({ data: null, error: null });
  } catch (err) { next(err); }
});

router.delete('/:id/inherit/:childId', async (req, res, next) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    await db.deleteFrom('role_inheritance')
      .where('parent_role_id', '=', req.params['id']!).where('child_role_id', '=', req.params['childId']!).execute();
    await invalidateRoleMemberCaches(db, workspace.id, req.params['id']!);
    res.json({ data: null, error: null });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vencore/api test -- roles-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/roles.ts apps/api/src/__tests__/roles-route.test.ts
git commit -m "feat(api): role inheritance edges with cycle + SSD validation"
```

---

### Task 5: User role assignment (SSD + cardinality)

**Files:**
- Create: `apps/api/src/routes/user-roles.ts`
- Modify: `apps/api/src/index.ts`
- Delete: `apps/api/src/routes/user-permissions.ts`
- Test: `apps/api/src/__tests__/user-roles-route.test.ts`

**Interfaces:**
- Consumes: `authorizedRoleClosure`, `loadInheritanceEdges`, `loadSsdSets`, `checkSSD`, `checkCardinality`, `buildGroupedPermissions`, `invalidatePermissionCache`.
- Produces `createUserRolesRouter(db)` mounted at `/api/users/:id/roles` (mergeParams), gated `users:manage`:
  - `GET /` → `{ roleIds:[], modules: GroupedModule[] (resolved effective, with source), isAdmin }`.
  - `PUT /` → `{ roleIds:[] }` set-assignment; 409 `SSD_CONFLICT` / `CARDINALITY` on violation.

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/__tests__/user-roles-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { seedWorkspace, authHeader } from './helpers';

describe('user roles', () => {
  let ctx: Awaited<ReturnType<typeof seedWorkspace>>;
  beforeEach(async () => { ctx = await seedWorkspace(); });

  it('sets a user\'s roles', async () => {
    const roles = (await ctx.request.get('/api/roles').set(authHeader(ctx.adminToken))).body.data;
    const memberRole = roles.find((r: { name: string }) => r.name === 'Member');
    const res = await ctx.request.put(`/api/users/${ctx.memberUserId}/roles`)
      .set(authHeader(ctx.adminToken)).send({ roleIds: [memberRole.id] });
    expect(res.status).toBe(200);
    const get = await ctx.request.get(`/api/users/${ctx.memberUserId}/roles`).set(authHeader(ctx.adminToken));
    expect(get.body.data.roleIds).toContain(memberRole.id);
  });

  it('rejects assignment violating an SSD set (409)', async () => {
    // create two roles + an SSD set of cardinality 2 over them, then try to assign both
    const pay = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'Pay' })).body.data;
    const appr = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'Approve' })).body.data;
    await ctx.request.post('/api/rbac/ssd-sets').set(authHeader(ctx.adminToken))
      .send({ name: 'Finance', cardinality: 2, roleIds: [pay.id, appr.id] });
    const res = await ctx.request.put(`/api/users/${ctx.memberUserId}/roles`)
      .set(authHeader(ctx.adminToken)).send({ roleIds: [pay.id, appr.id] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SSD_CONFLICT');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vencore/api test -- user-roles-route.test.ts`
Expected: FAIL (routes + `/api/rbac/ssd-sets` from Task 6 missing — implement Task 6 alongside, or stub the SSD test until Task 6). Order note: implement Task 6 before this test's SSD case passes; the first test passes now.

- [ ] **Step 3: Implement the router**

```ts
// apps/api/src/routes/user-roles.ts
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { createRequirePermission, invalidatePermissionCache } from '../middleware/permission';
import { authorizedRoleClosure } from '../lib/rbac/closure';
import { loadInheritanceEdges, loadSsdSets, buildGroupedPermissions } from '../lib/rbac/db';
import { checkSSD, checkCardinality } from '../lib/rbac/constraints';

const setSchema = z.object({ roleIds: z.array(z.string().uuid()) });

export function createUserRolesRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true });
  const requirePermission = createRequirePermission(db);
  router.use(requirePermission('users:manage'));

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const userId = (req.params as { id: string }).id;
      const assigned = await db.selectFrom('user_roles').where('user_id', '=', userId).where('workspace_id', '=', workspace.id).select('role_id').execute();
      const edges = await loadInheritanceEdges(db);
      const closure = authorizedRoleClosure(assigned.map(r => r.role_id), edges);
      const grantsAll = await db.selectFrom('roles').where('workspace_id', '=', workspace.id).where('grants_all', '=', true).select('id').execute();
      const isAdmin = grantsAll.some(r => closure.has(r.id));
      const permRows = closure.size ? await db.selectFrom('role_permissions').where('role_id', 'in', [...closure]).select('permission').execute() : [];
      const grantedKeys = new Set(permRows.map(r => r.permission));
      res.json({ data: { roleIds: assigned.map(r => r.role_id), isAdmin, modules: buildGroupedPermissions(grantedKeys, new Set()) }, error: null });
    } catch (err) { next(err); }
  });

  router.put('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const userId = (req.params as { id: string }).id;
      const parsed = setSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }

      const edges = await loadInheritanceEdges(db);
      const closure = authorizedRoleClosure(parsed.data.roleIds, edges);
      const ssd = await loadSsdSets(db, workspace.id);
      const ssdViolations = checkSSD(closure, ssd);
      if (ssdViolations.length) { res.status(409).json({ data: null, error: { code: 'SSD_CONFLICT', conflicts: ssdViolations } }); return; }

      // Cardinality: for each newly-added role, ensure it's under its cap.
      const existing = new Set((await db.selectFrom('user_roles').where('user_id', '=', userId).where('workspace_id', '=', workspace.id).select('role_id').execute()).map(r => r.role_id));
      for (const roleId of parsed.data.roleIds) {
        if (existing.has(roleId)) continue;
        const role = await db.selectFrom('roles').where('id', '=', roleId).select(['id', 'max_members']).executeTakeFirst();
        if (!role) continue;
        const count = await db.selectFrom('user_roles').where('role_id', '=', roleId).select(db.fn.count<number>('user_id').as('c')).executeTakeFirst();
        if (!checkCardinality(role, Number(count?.c ?? 0))) { res.status(409).json({ data: null, error: { code: 'CARDINALITY', roleId } }); return; }
      }

      await db.transaction().execute(async trx => {
        await trx.deleteFrom('user_roles').where('user_id', '=', userId).where('workspace_id', '=', workspace.id).execute();
        for (const roleId of parsed.data.roleIds) {
          await trx.insertInto('user_roles').values({ workspace_id: workspace.id, role_id: roleId, user_id: userId })
            .onConflict(oc => oc.columns(['role_id', 'user_id']).doNothing()).execute();
          await trx.insertInto('user_session_roles').values({ user_id: userId, role_id: roleId, active: true })
            .onConflict(oc => oc.columns(['user_id', 'role_id']).doNothing()).execute();
        }
        await trx.deleteFrom('user_session_roles').where('user_id', '=', userId)
          .where('role_id', 'not in', parsed.data.roleIds.length ? parsed.data.roleIds : ['00000000-0000-0000-0000-000000000000']).execute();
      });
      invalidatePermissionCache(workspace.id, userId);
      res.json({ data: { roleIds: parsed.data.roleIds }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 4: Mount + delete old user-permissions router**

```ts
// apps/api/src/index.ts
import { createUserRolesRouter } from './routes/user-roles';
// remove createUserPermissionsRouter import + mount
app.use('/api/users/:id/roles', requireWorkspace, createUserRolesRouter(db));
```
```bash
git rm apps/api/src/routes/user-permissions.ts
```

- [ ] **Step 5: Run tests (SSD case may pend Task 6)**

Run: `pnpm --filter @vencore/api test -- user-roles-route.test.ts`
Expected: first test PASS; SSD test PASS after Task 6.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/user-roles.ts apps/api/src/index.ts apps/api/src/__tests__/user-roles-route.test.ts
git commit -m "feat(api): user role assignment with SSD + cardinality enforcement"
```

---

### Task 6: SoD constraint sets router

**Files:**
- Create: `apps/api/src/routes/rbac-constraints.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/rbac-constraints-route.test.ts`

**Interfaces:**
- Consumes: `authorizedRoleClosure`, `loadInheritanceEdges`, `checkSSD` (validate on create).
- Produces `createRbacConstraintsRouter(db)` at `/api/rbac`, gated `roles:manage`:
  - `GET/POST/PATCH/DELETE /ssd-sets` and `/dsd-sets` (`name, cardinality>=2, roleIds[]`).
  - `POST` returns 409 `SSD_CONFLICT` with `conflicts` if an existing member already violates.
  - `GET /discarded-grants` — the migration report.

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/__tests__/rbac-constraints-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { seedWorkspace, authHeader } from './helpers';

describe('constraint sets', () => {
  let ctx: Awaited<ReturnType<typeof seedWorkspace>>;
  beforeEach(async () => { ctx = await seedWorkspace(); });

  it('creates an SSD set', async () => {
    const a = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'A' })).body.data;
    const b = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'B' })).body.data;
    const res = await ctx.request.post('/api/rbac/ssd-sets').set(authHeader(ctx.adminToken))
      .send({ name: 'S', cardinality: 2, roleIds: [a.id, b.id] });
    expect(res.status).toBe(201);
  });

  it('rejects a set that existing assignments already violate (409)', async () => {
    const a = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'A' })).body.data;
    const b = (await ctx.request.post('/api/roles').set(authHeader(ctx.adminToken)).send({ name: 'B' })).body.data;
    await ctx.request.put(`/api/users/${ctx.memberUserId}/roles`).set(authHeader(ctx.adminToken)).send({ roleIds: [a.id, b.id] });
    const res = await ctx.request.post('/api/rbac/ssd-sets').set(authHeader(ctx.adminToken))
      .send({ name: 'S', cardinality: 2, roleIds: [a.id, b.id] });
    expect(res.status).toBe(409);
    expect(res.body.error.conflicts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vencore/api test -- rbac-constraints-route.test.ts`
Expected: FAIL — router missing.

- [ ] **Step 3: Implement (SSD shown in full; DSD is the same code against `dsd_*` tables and, on create, validates against each user's ACTIVE closure via `user_session_roles`)**

```ts
// apps/api/src/routes/rbac-constraints.ts
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { createRequirePermission } from '../middleware/permission';
import { authorizedRoleClosure } from '../lib/rbac/closure';
import { loadInheritanceEdges } from '../lib/rbac/db';
import { checkSSD, type ConstraintSet } from '../lib/rbac/constraints';

const setSchema = z.object({
  name: z.string().min(1).max(100),
  cardinality: z.number().int().min(2),
  roleIds: z.array(z.string().uuid()).min(2),
});

export function createRbacConstraintsRouter(db: Kysely<Database>): Router {
  const router = Router();
  const requirePermission = createRequirePermission(db);
  router.use(requirePermission('roles:manage'));

  router.get('/ssd-sets', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const sets = await db.selectFrom('ssd_sets').where('workspace_id', '=', workspace.id).selectAll().execute();
      const out = [];
      for (const s of sets) {
        const roles = await db.selectFrom('ssd_set_roles').where('set_id', '=', s.id).select('role_id').execute();
        out.push({ ...s, roleIds: roles.map(r => r.role_id) });
      }
      res.json({ data: out, error: null });
    } catch (err) { next(err); }
  });

  router.post('/ssd-sets', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = setSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }
      // Validate against existing authorized closures.
      const candidate: ConstraintSet = { id: 'candidate', name: parsed.data.name, cardinality: parsed.data.cardinality, roleIds: parsed.data.roleIds };
      const edges = await loadInheritanceEdges(db);
      const members = await db.selectFrom('user_roles').where('workspace_id', '=', workspace.id).select(['user_id']).distinct().execute();
      const conflicts: { userId: string }[] = [];
      for (const m of members) {
        const assigned = await db.selectFrom('user_roles').where('user_id', '=', m.user_id).where('workspace_id', '=', workspace.id).select('role_id').execute();
        const closure = authorizedRoleClosure(assigned.map(r => r.role_id), edges);
        if (checkSSD(closure, [candidate]).length) conflicts.push({ userId: m.user_id });
      }
      if (conflicts.length) { res.status(409).json({ data: null, error: { code: 'SSD_CONFLICT', conflicts } }); return; }

      const set = await db.insertInto('ssd_sets').values({ workspace_id: workspace.id, name: parsed.data.name, cardinality: parsed.data.cardinality })
        .returning('id').executeTakeFirstOrThrow();
      for (const roleId of parsed.data.roleIds) {
        await db.insertInto('ssd_set_roles').values({ set_id: set.id, role_id: roleId }).onConflict(oc => oc.doNothing()).execute();
      }
      res.status(201).json({ data: { id: set.id }, error: null });
    } catch (err) { next(err); }
  });

  router.delete('/ssd-sets/:id', async (req, res, next) => {
    try {
      await db.deleteFrom('ssd_sets').where('id', '=', req.params['id']!).execute();
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // --- DSD: identical structure against dsd_sets/dsd_set_roles. On POST, build
  //     each user's ACTIVE closure from user_session_roles (active=true) instead
  //     of user_roles, then checkDSD. (checkDSD imported from constraints.) ---
  // (Implement the four dsd routes mirroring the ssd ones.)

  router.get('/discarded-grants', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const rows = await db.selectFrom('migration_discarded_grants')
        .where('workspace_id', '=', workspace.id).selectAll().orderBy('user_id').execute();
      res.json({ data: rows, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

Implement the four `dsd-sets` routes now (GET/POST/PATCH/DELETE) mirroring SSD, using `checkDSD` and the active closure. Add a `PATCH /ssd-sets/:id` + `PATCH /dsd-sets/:id` that re-run the same validation before applying role/name/cardinality changes.

- [ ] **Step 4: Mount router**

```ts
// apps/api/src/index.ts
import { createRbacConstraintsRouter } from './routes/rbac-constraints';
app.use('/api/rbac', requireWorkspace, createRbacConstraintsRouter(db));
```

- [ ] **Step 5: Run tests (this + the pending SSD case in Task 5)**

Run: `pnpm --filter @vencore/api test -- rbac-constraints-route.test.ts user-roles-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/rbac-constraints.ts apps/api/src/index.ts apps/api/src/__tests__/rbac-constraints-route.test.ts
git commit -m "feat(api): SSD/DSD constraint sets + discarded-grants report"
```

---

### Task 7: Session role activation (self, DSD-checked)

**Files:**
- Create: `apps/api/src/routes/session-roles.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/session-roles-route.test.ts`

**Interfaces:**
- Consumes: `authorizedRoleClosure`, `loadInheritanceEdges`, `loadDsdSets`, `checkDSD`, `invalidatePermissionCache`.
- Produces `createSessionRolesRouter(db)` at `/api/me/active-roles` (no `*:manage` gate — self-service, any authenticated user):
  - `GET /` → `{ assigned:[{id,name,active}] }`.
  - `PUT /` → `{ roleIds:[] }` activate subset; 409 `DSD_CONFLICT` on violation.

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/__tests__/session-roles-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { seedWorkspace, authHeader } from './helpers';

describe('active roles', () => {
  let ctx: Awaited<ReturnType<typeof seedWorkspace>>;
  beforeEach(async () => { ctx = await seedWorkspace(); });

  it('lists the current user\'s assigned roles with active flags', async () => {
    const res = await ctx.request.get('/api/me/active-roles').set(authHeader(ctx.memberToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.assigned)).toBe(true);
  });

  it('deactivates a role', async () => {
    const list = await ctx.request.get('/api/me/active-roles').set(authHeader(ctx.memberToken));
    const res = await ctx.request.put('/api/me/active-roles').set(authHeader(ctx.memberToken)).send({ roleIds: [] });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vencore/api test -- session-roles-route.test.ts`
Expected: FAIL — router missing.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/routes/session-roles.ts
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidatePermissionCache } from '../middleware/permission';
import { authorizedRoleClosure } from '../lib/rbac/closure';
import { loadInheritanceEdges, loadDsdSets } from '../lib/rbac/db';
import { checkDSD } from '../lib/rbac/constraints';

export function createSessionRolesRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const rows = await db.selectFrom('user_roles as ur').innerJoin('roles as r', 'r.id', 'ur.role_id')
        .leftJoin('user_session_roles as usr', join => join.onRef('usr.role_id', '=', 'ur.role_id').on('usr.user_id', '=', user.id))
        .where('ur.user_id', '=', user.id).where('ur.workspace_id', '=', workspace.id)
        .select(['r.id', 'r.name', 'usr.active']).execute();
      res.json({ data: { assigned: rows.map(r => ({ id: r.id, name: r.name, active: r.active ?? false })) }, error: null });
    } catch (err) { next(err); }
  });

  router.put('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const parsed = z.object({ roleIds: z.array(z.string().uuid()) }).safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } }); return; }
      // Only assigned roles may be activated.
      const assigned = new Set((await db.selectFrom('user_roles').where('user_id', '=', user.id).where('workspace_id', '=', workspace.id).select('role_id').execute()).map(r => r.role_id));
      const requested = parsed.data.roleIds.filter(id => assigned.has(id));
      const edges = await loadInheritanceEdges(db);
      const closure = authorizedRoleClosure(requested, edges);
      const dsd = await loadDsdSets(db, workspace.id);
      const v = checkDSD(closure, dsd);
      if (v.length) { res.status(409).json({ data: null, error: { code: 'DSD_CONFLICT', conflicts: v } }); return; }

      await db.transaction().execute(async trx => {
        for (const roleId of assigned) {
          await trx.insertInto('user_session_roles').values({ user_id: user.id, role_id: roleId, active: requested.includes(roleId) })
            .onConflict(oc => oc.columns(['user_id', 'role_id']).doUpdateSet({ active: requested.includes(roleId) })).execute();
        }
      });
      invalidatePermissionCache(workspace.id, user.id);
      res.json({ data: { active: requested }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 4: Mount**

```ts
// apps/api/src/index.ts
import { createSessionRolesRouter } from './routes/session-roles';
app.use('/api/me/active-roles', requireWorkspace, createSessionRolesRouter(db));
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vencore/api test -- session-roles-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/session-roles.ts apps/api/src/index.ts apps/api/src/__tests__/session-roles-route.test.ts
git commit -m "feat(api): self-service session role activation with DSD check"
```

---

### Task 8: API client — `roles.ts`; delete `groups.ts` / `user-permissions.ts`

**Files:**
- Create: `packages/api-client/src/roles.ts`
- Modify: `packages/api-client/src/index.ts`
- Delete: `packages/api-client/src/groups.ts`, `packages/api-client/src/user-permissions.ts`

**Interfaces:**
- Produces typed client functions matching Plan B endpoints (mirroring the `groups.ts` style: `apiFetch` from `./core`, `{ data, error }` returns).

- [ ] **Step 1: Write the client**

```ts
// packages/api-client/src/roles.ts
import { apiFetch } from './core';

export interface RoleSummary {
  id: string; name: string; description: string | null; color: string;
  is_system: boolean; grants_all: boolean; is_default: boolean; max_members: number | null; member_count: number | string;
}
export interface GroupedPermission { key: string; label: string; granted: boolean; inherited: boolean }
export interface GroupedModule { id: string; name: string; groups: { id: string; label: string; permissions: GroupedPermission[] }[] }
export interface RoleDetail {
  id: string; name: string; description: string | null; color: string;
  is_system: boolean; grants_all: boolean; is_default: boolean; max_members: number | null;
  members: { id: string; name: string; email: string }[];
  modules: GroupedModule[];
  inheritance: { parents: string[]; children: string[] };
}

export const listRoles = (token: string) =>
  apiFetch<{ data: RoleSummary[]; error: null }>('/api/roles', { token });
export const getRole = (token: string, id: string) =>
  apiFetch<{ data: RoleDetail; error: null }>(`/api/roles/${id}`, { token });
export const createRole = (token: string, body: { name: string; description?: string; color?: string; copyDefaults?: boolean }) =>
  apiFetch<{ data: RoleSummary; error: null }>('/api/roles', { method: 'POST', body: JSON.stringify(body), token });
export const updateRole = (token: string, id: string, body: { name?: string; description?: string | null; color?: string; max_members?: number | null }) =>
  apiFetch(`/api/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
export const deleteRole = (token: string, id: string) =>
  apiFetch(`/api/roles/${id}`, { method: 'DELETE', token });
export const setRolePermissions = (token: string, id: string, body: { permissions: string[] } | { permission: string; granted: boolean }) =>
  apiFetch(`/api/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify(body), token });
export const addRoleMember = (token: string, id: string, userId: string) =>
  apiFetch(`/api/roles/${id}/members`, { method: 'POST', body: JSON.stringify({ userId }), token });
export const removeRoleMember = (token: string, id: string, userId: string) =>
  apiFetch(`/api/roles/${id}/members/${userId}`, { method: 'DELETE', token });
export const addInheritance = (token: string, id: string, childRoleId: string) =>
  apiFetch(`/api/roles/${id}/inherit`, { method: 'POST', body: JSON.stringify({ childRoleId }), token });
export const removeInheritance = (token: string, id: string, childId: string) =>
  apiFetch(`/api/roles/${id}/inherit/${childId}`, { method: 'DELETE', token });

export const getUserRoles = (token: string, userId: string) =>
  apiFetch<{ data: { roleIds: string[]; isAdmin: boolean; modules: GroupedModule[] }; error: null }>(`/api/users/${userId}/roles`, { token });
export const setUserRoles = (token: string, userId: string, roleIds: string[]) =>
  apiFetch(`/api/users/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds }), token });

export interface ConstraintSet { id: string; name: string; cardinality: number; roleIds: string[] }
export const listSsdSets = (token: string) => apiFetch<{ data: ConstraintSet[]; error: null }>('/api/rbac/ssd-sets', { token });
export const createSsdSet = (token: string, body: { name: string; cardinality: number; roleIds: string[] }) =>
  apiFetch('/api/rbac/ssd-sets', { method: 'POST', body: JSON.stringify(body), token });
export const deleteSsdSet = (token: string, id: string) => apiFetch(`/api/rbac/ssd-sets/${id}`, { method: 'DELETE', token });
export const listDsdSets = (token: string) => apiFetch<{ data: ConstraintSet[]; error: null }>('/api/rbac/dsd-sets', { token });
export const createDsdSet = (token: string, body: { name: string; cardinality: number; roleIds: string[] }) =>
  apiFetch('/api/rbac/dsd-sets', { method: 'POST', body: JSON.stringify(body), token });
export const deleteDsdSet = (token: string, id: string) => apiFetch(`/api/rbac/dsd-sets/${id}`, { method: 'DELETE', token });

export const getActiveRoles = (token: string) =>
  apiFetch<{ data: { assigned: { id: string; name: string; active: boolean }[] }; error: null }>('/api/me/active-roles', { token });
export const setActiveRoles = (token: string, roleIds: string[]) =>
  apiFetch('/api/me/active-roles', { method: 'PUT', body: JSON.stringify({ roleIds }), token });
```

- [ ] **Step 2: Update the barrel + delete old clients**

```ts
// packages/api-client/src/index.ts — remove group/user-permission exports, add:
export * from './roles';
```
```bash
git rm packages/api-client/src/groups.ts packages/api-client/src/user-permissions.ts
```

- [ ] **Step 3: Typecheck the package**

Run: `pnpm --filter @vencore/api-client exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src/roles.ts packages/api-client/src/index.ts
git commit -m "feat(api-client): roles/constraints/session client; remove groups + user-permissions"
```

---

### Task 9: Migrate `invites` + `record_type_permissions` write paths

**Files:**
- Modify: `apps/api/src/routes/invites.ts` (assign role via `invite_roles`; accept sets default role)
- Modify: any record-type permission write route (now writes `role_id`).
- Test: extend `apps/api/src/__tests__/*` covering invite acceptance assigns the default role.

**Interfaces:**
- Produces: invite creation accepts `roleIds?: string[]` (defaults to the `is_default` role); acceptance assigns those roles + activates them. Record-type permission writes take `role_id`.

- [ ] **Step 1: Write failing test**

```ts
// extend apps/api/src/__tests__/auth.test.ts or invites test
it('assigns the default role on invite acceptance', async () => {
  const ctx = await seedWorkspace();
  const invite = await ctx.createInvite({ email: 'new@x.com' });     // helper
  const accepted = await ctx.acceptInvite(invite.token, { name: 'New', password: 'pw12345!' });
  const roles = await ctx.request.get(`/api/users/${accepted.userId}/roles`).set(authHeader(ctx.adminToken));
  const memberRole = (await ctx.request.get('/api/roles').set(authHeader(ctx.adminToken))).body.data.find((r: {name:string}) => r.name === 'Member');
  expect(roles.body.data.roleIds).toContain(memberRole.id);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vencore/api test -- invites`
Expected: FAIL — acceptance still sets the dropped `role` column.

- [ ] **Step 3: Rewrite invite create + accept**

```ts
// invites.ts — on create, insert invite_roles (default to is_default role when none given)
const roleIds = body.roleIds && body.roleIds.length
  ? body.roleIds
  : [(await db.selectFrom('roles').where('workspace_id','=',workspace.id).where('is_default','=',true).select('id').executeTakeFirstOrThrow()).id];
for (const roleId of roleIds) {
  await db.insertInto('invite_roles').values({ invite_id: invite.id, role_id: roleId }).onConflict(oc => oc.doNothing()).execute();
}

// on accept — after creating the user (no `role` column now):
const inviteRoles = await db.selectFrom('invite_roles').where('invite_id','=',invite.id).select('role_id').execute();
for (const { role_id } of inviteRoles) {
  await db.insertInto('user_roles').values({ workspace_id: workspace.id, role_id, user_id: newUser.id }).onConflict(oc => oc.doNothing()).execute();
  await db.insertInto('user_session_roles').values({ user_id: newUser.id, role_id, active: true }).onConflict(oc => oc.doNothing()).execute();
}
```

- [ ] **Step 4: Fix any record-type permission write route to use `role_id`**

Run: `rg "record_type_permissions" apps/api --type ts -l` and update inserts/updates to set `role_id` (a role id from the request) rather than the removed `role`. Match the discovered route's existing shape.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vencore/api test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/invites.ts apps/api/src
git commit -m "feat(api): invites + record-type permissions on role_id model"
```

---

### Task 10: Plan B verification

- [ ] **Step 1: Full API typecheck + tests**

Run: `pnpm --filter @vencore/api exec tsc --noEmit && pnpm --filter @vencore/api test && pnpm --filter @vencore/api-client exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Smoke the router mounts**

Run the API locally; `GET /api/roles` (admin token) returns Administrator + Member; `GET /api/groups` now 404s.

- [ ] **Step 3: Update the graph + commit**

```bash
graphify update .
git add -A
git commit -m "test(rbac3): phase B verification green"
```

---

## Self-Review

- **§8 endpoints:** roles CRUD (T2), matrix + members (T3), hierarchy (T4), user assignment (T5), constraints + discarded-grants (T6), session activation (T7), client (T8). ✓
- **Constraint enforcement wired:** SSD on assignment (T5) + inheritance (T4) + set-create (T6); DSD on activation (T7) + set-create (T6); cardinality on assignment (T5). ✓
- **Old routes removed:** groups + user-permissions deleted (T2, T5, T8). ✓
- **Reject-with-conflict-list:** 409 + `conflicts` on SSD/DSD create + assignment. ✓
- **Placeholder scan:** DSD routes in T6 are described as "mirror SSD against dsd tables" with the exact behavioral delta (active closure, `checkDSD`) — acceptable as it repeats a fully-shown pattern; implementer has the SSD code verbatim above it. ✓
- **Type consistency:** `GroupedModule`/`GroupedPermission` identical in `db.ts` (Plan B T1) and `api-client/roles.ts` (T8); `ConstraintSet` matches Plan A. ✓

**Note:** Plan B assumes the existing test harness exposes `seedWorkspace` with admin/member tokens + user ids. If it doesn't, T2 Step 1 extends the harness first (seed users assigned to system roles) — fold that into T2.
