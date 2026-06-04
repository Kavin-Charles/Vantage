# Permission System + Modules Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a module-driven permission system where each API action requires a permission string defined by its module, with role defaults and per-user overrides managed through an admin UI.

**Architecture:** A new `packages/modules` shared package defines all modules and their permissions. A `user_permissions` DB table stores per-user overrides over role defaults. Express middleware resolves effective permissions (admin bypass → role defaults → filter by enabled modules → apply overrides) and gates individual API routes. An admin UI in settings lets workspace admins toggle per-user permissions.

**Tech Stack:** TypeScript strict, Node.js/Express, Kysely (PostgreSQL), Vitest, Next.js App Router, React Query, `@vencore/api-client` pattern (`apiFetch`).

---

## File Map

**Create:**
- `packages/modules/package.json`
- `packages/modules/tsconfig.json`
- `packages/modules/src/types.ts`
- `packages/modules/src/contacts.ts`
- `packages/modules/src/companies.ts`
- `packages/modules/src/pipelines.ts`
- `packages/modules/src/tasks.ts`
- `packages/modules/src/websites.ts`
- `packages/modules/src/servers.ts`
- `packages/modules/src/analytics.ts`
- `packages/modules/src/activity.ts`
- `packages/modules/src/index.ts`
- `packages/db/migrations/20260602_001_user_permissions.ts`
- `apps/api/src/middleware/permission.ts`
- `apps/api/src/middleware/permission.test.ts`
- `apps/api/src/routes/user-permissions.ts`
- `packages/api-client/src/user-permissions.ts`
- `apps/web/app/(dashboard)/settings/team/[userId]/permissions/page.tsx`
- `apps/web/components/settings/UserPermissionsEditor.tsx`

**Modify:**
- `packages/db/src/schema.ts` — add `UserPermissionTable`, add to `Database`
- `apps/api/src/modules/manifests.ts` — re-export from `@vencore/modules`
- `apps/api/src/modules/registry.ts` — re-export from `@vencore/modules`
- `apps/api/src/routes/contacts.ts` — add `requirePermission` param + per-route gates
- `apps/api/src/routes/companies.ts` — same
- `apps/api/src/routes/deals.ts` — same
- `apps/api/src/routes/tasks.ts` — same
- `apps/api/src/routes/activity.ts` — same
- `apps/api/src/routes/websites.ts` — same
- `apps/api/src/routes/servers.ts` — same
- `apps/api/src/routes/analytics.ts` — same
- `apps/api/src/index.ts` — create `requirePermission`, pass to routers, add user-permissions route
- `apps/api/package.json` — add `@vencore/modules: workspace:*`
- `apps/web/package.json` — add `@vencore/modules: workspace:*`
- `packages/api-client/src/index.ts` — export user-permissions
- `apps/web/app/(dashboard)/settings/team/page.tsx` — add user list with links to permissions

---

## Task 1: `packages/modules` — Types + Module Definitions

**Files:**
- Create: `packages/modules/package.json`
- Create: `packages/modules/tsconfig.json`
- Create: `packages/modules/src/types.ts`
- Create: `packages/modules/src/contacts.ts`
- Create: `packages/modules/src/companies.ts`
- Create: `packages/modules/src/pipelines.ts`
- Create: `packages/modules/src/tasks.ts`
- Create: `packages/modules/src/websites.ts`
- Create: `packages/modules/src/servers.ts`
- Create: `packages/modules/src/analytics.ts`
- Create: `packages/modules/src/activity.ts`
- Create: `packages/modules/src/index.ts`

- [ ] **Step 1: Create `packages/modules/package.json`**

```json
{
  "name": "@vencore/modules",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/modules/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/modules/src/types.ts`**

```typescript
export type UserRole = 'admin' | 'member';

export interface PermissionDef {
  key: string;
  label: string;
  defaultRoles: UserRole[];
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  permissions: PermissionDef[];
  nav: NavItem[];
  apiPrefixes: string[];
  workers: string[];
}
```

- [ ] **Step 4: Create all 8 module definition files**

`packages/modules/src/contacts.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const CONTACTS_MODULE: ModuleDefinition = {
  id: 'contacts',
  name: 'Contacts',
  description: 'Contact management, profiles, and history.',
  icon: 'Users',
  defaultEnabled: true,
  permissions: [
    { key: 'contacts:view',   label: 'View contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:create', label: 'Create contacts', defaultRoles: ['admin', 'member'] },
    { key: 'contacts:edit',   label: 'Edit contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:delete', label: 'Delete contacts', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Contacts', path: '/contacts', icon: 'Users' }],
  apiPrefixes: ['/contacts'],
  workers: [],
};
```

`packages/modules/src/companies.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const COMPANIES_MODULE: ModuleDefinition = {
  id: 'companies',
  name: 'Companies',
  description: 'Company records and relationships.',
  icon: 'Building2',
  defaultEnabled: true,
  permissions: [
    { key: 'companies:view',   label: 'View companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:create', label: 'Create companies', defaultRoles: ['admin', 'member'] },
    { key: 'companies:edit',   label: 'Edit companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:delete', label: 'Delete companies', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Companies', path: '/companies', icon: 'Building2' }],
  apiPrefixes: ['/companies'],
  workers: [],
};
```

`packages/modules/src/pipelines.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const PIPELINES_MODULE: ModuleDefinition = {
  id: 'pipelines',
  name: 'Pipelines',
  description: 'Deals pipeline, pipeline views, items, and conversions.',
  icon: 'Kanban',
  defaultEnabled: true,
  permissions: [
    { key: 'pipelines:view',   label: 'View pipelines & deals',   defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:create', label: 'Create deals & records',   defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:edit',   label: 'Edit deals & records',     defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:delete', label: 'Delete deals & records',   defaultRoles: ['admin'] },
  ],
  nav: [
    { label: 'Pipeline', path: '/pipeline', icon: 'Kanban' },
    { label: 'Items', path: '/items', icon: 'Package' },
  ],
  apiPrefixes: ['/deals', '/pipelines', '/stages', '/items', '/item-groups', '/conversions', '/record-types', '/records'],
  workers: [],
};
```

`packages/modules/src/tasks.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const TASKS_MODULE: ModuleDefinition = {
  id: 'tasks',
  name: 'Tasks',
  description: 'Task management and due date tracking.',
  icon: 'CheckSquare',
  defaultEnabled: true,
  permissions: [
    { key: 'tasks:view',   label: 'View tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:create', label: 'Create tasks', defaultRoles: ['admin', 'member'] },
    { key: 'tasks:edit',   label: 'Edit tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:delete', label: 'Delete tasks', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Tasks', path: '/tasks', icon: 'CheckSquare' }],
  apiPrefixes: ['/tasks'],
  workers: ['task-due-notifier'],
};
```

`packages/modules/src/websites.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const WEBSITES_MODULE: ModuleDefinition = {
  id: 'websites',
  name: 'Websites',
  description: 'Website uptime monitoring, response times, and SSL expiry.',
  icon: 'Globe',
  defaultEnabled: true,
  permissions: [
    { key: 'websites:view',   label: 'View websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:create', label: 'Add websites',    defaultRoles: ['admin', 'member'] },
    { key: 'websites:edit',   label: 'Edit websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:delete', label: 'Delete websites', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Websites', path: '/websites', icon: 'Globe' }],
  apiPrefixes: ['/websites'],
  workers: ['website-checker'],
};
```

`packages/modules/src/servers.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const SERVERS_MODULE: ModuleDefinition = {
  id: 'servers',
  name: 'Servers',
  description: 'Server monitoring and agent heartbeats.',
  icon: 'Server',
  defaultEnabled: true,
  permissions: [
    { key: 'servers:view',   label: 'View servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:create', label: 'Add servers',    defaultRoles: ['admin', 'member'] },
    { key: 'servers:edit',   label: 'Edit servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:delete', label: 'Delete servers', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Servers', path: '/servers', icon: 'Server' }],
  apiPrefixes: ['/servers', '/deployments', '/agent', '/ssh'],
  workers: [],
};
```

`packages/modules/src/analytics.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const ANALYTICS_MODULE: ModuleDefinition = {
  id: 'analytics',
  name: 'Analytics',
  description: 'Revenue, pipeline stats, and team leaderboard.',
  icon: 'BarChart2',
  defaultEnabled: true,
  permissions: [
    { key: 'analytics:view', label: 'View analytics', defaultRoles: ['admin', 'member'] },
  ],
  nav: [{ label: 'Analytics', path: '/analytics', icon: 'BarChart2' }],
  apiPrefixes: ['/analytics'],
  workers: [],
};
```

`packages/modules/src/activity.ts`:
```typescript
import type { ModuleDefinition } from './types';

export const ACTIVITY_MODULE: ModuleDefinition = {
  id: 'activity',
  name: 'Activity',
  description: 'Unified activity feed across all workspace records.',
  icon: 'Activity',
  defaultEnabled: true,
  permissions: [
    { key: 'activity:view',   label: 'View activity feed', defaultRoles: ['admin', 'member'] },
    { key: 'activity:create', label: 'Log activity',       defaultRoles: ['admin', 'member'] },
  ],
  nav: [{ label: 'Activity', path: '/activity', icon: 'Activity' }],
  apiPrefixes: ['/activity'],
  workers: [],
};
```

- [ ] **Step 5: Create `packages/modules/src/index.ts`**

```typescript
export * from './types';
export * from './contacts';
export * from './companies';
export * from './pipelines';
export * from './tasks';
export * from './websites';
export * from './servers';
export * from './analytics';
export * from './activity';

import { CONTACTS_MODULE } from './contacts';
import { COMPANIES_MODULE } from './companies';
import { PIPELINES_MODULE } from './pipelines';
import { TASKS_MODULE } from './tasks';
import { WEBSITES_MODULE } from './websites';
import { SERVERS_MODULE } from './servers';
import { ANALYTICS_MODULE } from './analytics';
import { ACTIVITY_MODULE } from './activity';
import type { ModuleDefinition, PermissionDef, UserRole } from './types';

export const MODULE_REGISTRY: ModuleDefinition[] = [
  CONTACTS_MODULE,
  COMPANIES_MODULE,
  PIPELINES_MODULE,
  TASKS_MODULE,
  WEBSITES_MODULE,
  SERVERS_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
];

export const MODULE_IDS: string[] = MODULE_REGISTRY.map(m => m.id);

export function getAllPermissions(): PermissionDef[] {
  return MODULE_REGISTRY.flatMap(m => m.permissions);
}

export function getDefaultPermissionsForRole(role: UserRole): string[] {
  return getAllPermissions()
    .filter(p => p.defaultRoles.includes(role))
    .map(p => p.key);
}

export function getModuleForPermission(key: string): string | null {
  const mod = MODULE_REGISTRY.find(m => m.permissions.some(p => p.key === key));
  return mod?.id ?? null;
}
```

- [ ] **Step 6: Write unit tests for the helpers**

Create `packages/modules/src/index.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  getDefaultPermissionsForRole,
  getModuleForPermission,
  getAllPermissions,
  MODULE_REGISTRY,
} from './index';

describe('getDefaultPermissionsForRole', () => {
  it('admin gets all permissions', () => {
    const all = getAllPermissions().map(p => p.key);
    const adminPerms = getDefaultPermissionsForRole('admin');
    expect(adminPerms).toEqual(expect.arrayContaining(all));
    expect(adminPerms.length).toBe(all.length);
  });

  it('member does not get delete permissions', () => {
    const memberPerms = getDefaultPermissionsForRole('member');
    const deletePerms = memberPerms.filter(p => p.endsWith(':delete'));
    expect(deletePerms).toHaveLength(0);
  });

  it('member gets view, create, edit for contacts', () => {
    const memberPerms = getDefaultPermissionsForRole('member');
    expect(memberPerms).toContain('contacts:view');
    expect(memberPerms).toContain('contacts:create');
    expect(memberPerms).toContain('contacts:edit');
    expect(memberPerms).not.toContain('contacts:delete');
  });
});

describe('getModuleForPermission', () => {
  it('returns correct moduleId for known permission', () => {
    expect(getModuleForPermission('contacts:create')).toBe('contacts');
    expect(getModuleForPermission('servers:delete')).toBe('servers');
    expect(getModuleForPermission('analytics:view')).toBe('analytics');
  });

  it('returns null for unknown permission', () => {
    expect(getModuleForPermission('unknown:action')).toBeNull();
  });
});

describe('MODULE_REGISTRY', () => {
  it('has 8 modules', () => {
    expect(MODULE_REGISTRY).toHaveLength(8);
  });

  it('every module has at least one permission', () => {
    for (const mod of MODULE_REGISTRY) {
      expect(mod.permissions.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 7: Run tests**

```bash
cd packages/modules && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/modules
git commit -m "feat: add @vencore/modules shared package with permission definitions"
```

---

## Task 2: DB — `user_permissions` Table

**Files:**
- Create: `packages/db/migrations/20260602_001_user_permissions.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Create migration file**

Create `packages/db/migrations/20260602_001_user_permissions.ts`:
```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_permissions')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('permission', sql`varchar(255)`, col => col.notNull())
    .addColumn('granted', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('user_permissions_unique_idx')
    .on('user_permissions')
    .columns(['workspace_id', 'user_id', 'permission'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_permissions').execute();
}
```

- [ ] **Step 2: Add `UserPermissionTable` to `packages/db/src/schema.ts`**

Add this interface after `WorkspaceModuleTable` (around line 588):
```typescript
export interface UserPermissionTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  permission: string;
  granted: Generated<boolean>;
  created_at: Generated<Date>;
}
```

Add to the `Database` interface (after `workspace_modules: WorkspaceModuleTable;`):
```typescript
  user_permissions: UserPermissionTable;
```

Add convenience types at the bottom of the file (after `WorkspaceModule` types):
```typescript
export type UserPermission = Selectable<UserPermissionTable>;
export type NewUserPermission = Insertable<UserPermissionTable>;
export type UserPermissionUpdate = Updateable<UserPermissionTable>;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/db && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260602_001_user_permissions.ts packages/db/src/schema.ts
git commit -m "feat: add user_permissions table migration and schema"
```

---

## Task 3: Update Manifests + Registry to Re-export from `@vencore/modules`

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/modules/manifests.ts`
- Modify: `apps/api/src/modules/registry.ts`

- [ ] **Step 1: Add `@vencore/modules` to `apps/api/package.json`**

In `apps/api/package.json`, add to `dependencies`:
```json
"@vencore/modules": "workspace:*",
```

- [ ] **Step 2: Replace `apps/api/src/modules/manifests.ts`**

Replace the entire file content:
```typescript
export type { ModuleDefinition as ModuleManifest, ModuleDefinition, PermissionDef, NavItem, UserRole } from '@vencore/modules';
export {
  CONTACTS_MODULE,
  COMPANIES_MODULE,
  PIPELINES_MODULE,
  TASKS_MODULE,
  WEBSITES_MODULE,
  SERVERS_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
} from '@vencore/modules';
```

- [ ] **Step 3: Replace `apps/api/src/modules/registry.ts`**

Replace the entire file content:
```typescript
export {
  MODULE_REGISTRY,
  MODULE_IDS,
  getDefaultPermissionsForRole,
  getModuleForPermission,
  getAllPermissions,
  type ModuleDefinition,
  type ModuleDefinition as ModuleManifest,
} from '@vencore/modules';
```

- [ ] **Step 4: Build `@vencore/modules` so it can be imported**

```bash
cd packages/modules && npm run build
```

Expected: `packages/modules/dist/` created with `.js` and `.d.ts` files.

- [ ] **Step 5: Verify API still compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/manifests.ts apps/api/src/modules/registry.ts packages/modules/dist
git commit -m "feat: wire manifests and registry to re-export from @vencore/modules"
```

---

## Task 4: Permission Middleware

**Files:**
- Create: `apps/api/src/middleware/permission.ts`
- Create: `apps/api/src/middleware/permission.test.ts`

- [ ] **Step 1: Write failing tests for `resolvePermissions`**

Create `apps/api/src/middleware/permission.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePermissions, __clearPermCacheForTesting } from './permission';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

function buildMockDb(overrides: { permission: string; granted: boolean }[]) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom', 'select', 'where']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(overrides);
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
  } as unknown as Kysely<Database>;
}

beforeEach(() => {
  __clearPermCacheForTesting();
});

describe('resolvePermissions', () => {
  it('returns all permissions for admin (bypasses DB)', async () => {
    const db = buildMockDb([]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'admin', []);
    // admin sentinel: always returns true for has()
    expect(result.has('contacts:delete')).toBe(true);
    expect(result.has('anything:random')).toBe(true);
  });

  it('returns role-default permissions for member', async () => {
    const db = buildMockDb([]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['contacts', 'companies', 'pipelines', 'tasks', 'websites', 'servers', 'analytics', 'activity']);
    expect(result.has('contacts:view')).toBe(true);
    expect(result.has('contacts:create')).toBe(true);
    expect(result.has('contacts:delete')).toBe(false);
  });

  it('applies granted override', async () => {
    const db = buildMockDb([{ permission: 'contacts:delete', granted: true }]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['contacts', 'companies', 'pipelines', 'tasks', 'websites', 'servers', 'analytics', 'activity']);
    expect(result.has('contacts:delete')).toBe(true);
  });

  it('applies denied override', async () => {
    const db = buildMockDb([{ permission: 'contacts:create', granted: false }]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['contacts', 'companies', 'pipelines', 'tasks', 'websites', 'servers', 'analytics', 'activity']);
    expect(result.has('contacts:create')).toBe(false);
  });

  it('blocks permissions from disabled modules', async () => {
    const db = buildMockDb([]);
    // contacts module disabled
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['companies']);
    expect(result.has('contacts:view')).toBe(false);
    expect(result.has('companies:view')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/middleware/permission.test.ts
```

Expected: FAIL — `./permission` module not found.

- [ ] **Step 3: Create `apps/api/src/middleware/permission.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from './auth';
import { getDefaultPermissionsForRole, getModuleForPermission, MODULE_IDS } from '@vencore/modules';

const ADMIN_SENTINEL = new Proxy(new Set<string>(), {
  get(target, prop) {
    if (prop === 'has') return () => true;
    return Reflect.get(target, prop);
  },
});

const permCache = new Map<string, { perms: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getEnabledModuleIds(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('workspace_modules')
    .where('workspace_id', '=', workspaceId)
    .where('enabled', '=', true)
    .select('module_id')
    .execute();
  return rows.map(r => r.module_id);
}

export async function resolvePermissions(
  db: Kysely<Database>,
  userId: string,
  workspaceId: string,
  role: 'admin' | 'member',
  enabledModuleIds: string[],
): Promise<Set<string>> {
  if (role === 'admin') return ADMIN_SENTINEL as unknown as Set<string>;

  const cacheKey = `${workspaceId}:${userId}`;
  const cached = permCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.perms;

  const defaults = new Set(
    getDefaultPermissionsForRole('member').filter(key => {
      const modId = getModuleForPermission(key);
      return modId !== null && enabledModuleIds.includes(modId);
    }),
  );

  const overrides = await db
    .selectFrom('user_permissions')
    .select(['permission', 'granted'])
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .execute();

  for (const o of overrides) {
    if (o.granted) defaults.add(o.permission);
    else defaults.delete(o.permission);
  }

  permCache.set(cacheKey, { perms: defaults, expiresAt: Date.now() + CACHE_TTL_MS });
  return defaults;
}

export function invalidatePermissionCache(workspaceId: string, userId: string): void {
  permCache.delete(`${workspaceId}:${userId}`);
}

export function invalidateWorkspacePermissionCache(workspaceId: string): void {
  for (const key of permCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) permCache.delete(key);
  }
}

export function __clearPermCacheForTesting(): void {
  permCache.clear();
}

export function createRequirePermission(db: Kysely<Database>) {
  return function requirePermission(permission: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user, workspace } = req as AuthenticatedRequest;
        if (user.role === 'admin') return next();
        const enabledModuleIds = await getEnabledModuleIds(db, workspace.id);
        const perms = await resolvePermissions(db, user.id, workspace.id, user.role, enabledModuleIds);
        if (!perms.has(permission)) {
          res.status(403).json({
            data: null,
            error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' },
          });
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run src/middleware/permission.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/permission.ts apps/api/src/middleware/permission.test.ts
git commit -m "feat: add permission resolution middleware with role defaults, module gating, and per-user overrides"
```

---

## Task 5: User Permissions API Route

**Files:**
- Create: `apps/api/src/routes/user-permissions.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create `apps/api/src/routes/user-permissions.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidatePermissionCache } from '../middleware/permission';
import { MODULE_REGISTRY, getDefaultPermissionsForRole, getModuleForPermission } from '@vencore/modules';

const upsertSchema = z.object({
  permission: z.string().min(1),
  granted: z.boolean(),
});

export function createUserPermissionsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true });

  // GET /api/users/:id/permissions
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const { id: userId } = req.params as { id: string };

      const targetUser = await db
        .selectFrom('users')
        .where('id', '=', userId)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'role'])
        .executeTakeFirst();

      if (!targetUser) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const enabledModules = await db
        .selectFrom('workspace_modules')
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .select('module_id')
        .execute();
      const enabledModuleIds = new Set(enabledModules.map(r => r.module_id));

      const overrides = await db
        .selectFrom('user_permissions')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', userId)
        .select(['permission', 'granted'])
        .execute();
      const overrideMap = new Map(overrides.map(o => [o.permission, o.granted]));

      const roleDefaults = new Set(getDefaultPermissionsForRole(targetUser.role));

      const permissions = MODULE_REGISTRY.flatMap(mod =>
        mod.permissions.map(p => {
          const moduleEnabled = enabledModuleIds.has(mod.id);
          const roleDefault = roleDefaults.has(p.key);
          const override = overrideMap.get(p.key);
          const effectivelyGranted =
            targetUser.role === 'admin'
              ? true
              : override !== undefined
              ? override
              : roleDefault;

          return {
            key: p.key,
            label: p.label,
            moduleId: mod.id,
            moduleName: mod.name,
            effectivelyGranted,
            isOverride: override !== undefined,
            moduleEnabled,
          };
        }),
      );

      res.json({ data: { permissions }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/users/:id/permissions
  router.put('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const { id: userId } = req.params as { id: string };

      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
        return;
      }

      const targetUser = await db
        .selectFrom('users')
        .where('id', '=', userId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!targetUser) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const moduleId = getModuleForPermission(parsed.data.permission);
      if (!moduleId) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION' } });
        return;
      }

      await db
        .insertInto('user_permissions')
        .values({
          workspace_id: workspace.id,
          user_id: userId,
          permission: parsed.data.permission,
          granted: parsed.data.granted,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'user_id', 'permission']).doUpdateSet({
            granted: parsed.data.granted,
          }),
        )
        .execute();

      invalidatePermissionCache(workspace.id, userId);
      res.json({ data: { permission: parsed.data.permission, granted: parsed.data.granted }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/users/:id/permissions/:permission
  router.delete('/:permission', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const { id: userId, permission } = req.params as { id: string; permission: string };

      await db
        .deleteFrom('user_permissions')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', userId)
        .where('permission', '=', permission)
        .execute();

      invalidatePermissionCache(workspace.id, userId);
      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Wire into `apps/api/src/index.ts`**

In `apps/api/src/index.ts`, add the import at the top with other route imports:
```typescript
import { createUserPermissionsRouter } from './routes/user-permissions';
```

Add the import for `createRequirePermission`:
```typescript
import { createRequirePermission } from './middleware/permission';
```

After `const requireModule = createRequireModule(db);`, add:
```typescript
const requirePermission = createRequirePermission(db);
```

After the existing users route:
```typescript
app.use('/api/users', requireAuth, requireAdmin, createUsersRouter(db));
```
Add:
```typescript
app.use('/api/users/:id/permissions', requireAuth, requireAdmin, createUserPermissionsRouter(db));
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/user-permissions.ts apps/api/src/index.ts
git commit -m "feat: add user permissions API route (GET/PUT/DELETE)"
```

---

## Task 6: Wire `requirePermission` into Contacts, Companies, Deals Routes

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`
- Modify: `apps/api/src/routes/companies.ts`
- Modify: `apps/api/src/routes/deals.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update `contacts.ts` router signature and add permission gates**

In `apps/api/src/routes/contacts.ts`, change the function signature from:
```typescript
export function createContactsRouter(db: Kysely<Database>): ExpressRouter {
```
to:
```typescript
export function createContactsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Add permission middleware to each route inside the router. Find the `router.get('/export', ...)` and all other route definitions and add the gate as the first argument after the path:

```typescript
// GET /export
router.get('/export', requirePermission('contacts:view'), async (req, res, next) => { ... });

// GET / (list)
router.get('/', requirePermission('contacts:view'), async (req, res, next) => { ... });

// POST / (create)
router.post('/', requirePermission('contacts:create'), async (req, res, next) => { ... });

// POST /import
router.post('/import', requirePermission('contacts:create'), async (req, res, next) => { ... });

// GET /:id
router.get('/:id', requirePermission('contacts:view'), async (req, res, next) => { ... });

// PATCH /:id
router.patch('/:id', requirePermission('contacts:edit'), async (req, res, next) => { ... });

// DELETE /:id
router.delete('/:id', requirePermission('contacts:delete'), async (req, res, next) => { ... });
```

- [ ] **Step 2: Update `companies.ts` router signature and add permission gates**

Same pattern as contacts. Change signature:
```typescript
export function createCompaniesRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Add gates:
```typescript
router.get('/', requirePermission('companies:view'), async ...);
router.post('/', requirePermission('companies:create'), async ...);
router.get('/:id', requirePermission('companies:view'), async ...);
router.patch('/:id', requirePermission('companies:edit'), async ...);
router.delete('/:id', requirePermission('companies:delete'), async ...);
```

- [ ] **Step 3: Update `deals.ts` router signature and add permission gates**

Change signature to:
```typescript
export function createDealsRouter(requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```
(Note: deals router currently takes no `db` param — check its actual signature before editing.)

Add gates:
```typescript
router.get('/', requirePermission('pipelines:view'), async ...);
router.post('/', requirePermission('pipelines:create'), async ...);
router.get('/:id', requirePermission('pipelines:view'), async ...);
router.patch('/:id', requirePermission('pipelines:edit'), async ...);
router.delete('/:id', requirePermission('pipelines:delete'), async ...);
```

- [ ] **Step 4: Update `apps/api/src/index.ts` to pass `requirePermission`**

Find these lines and update:
```typescript
// BEFORE:
app.use('/api/contacts', requireAuth, requireModule('contacts'), createContactsRouter(db));
app.use('/api/companies', requireAuth, requireModule('companies'), createCompaniesRouter(db));
app.use('/api/deals', requireAuth, requireModule('pipelines'), createDealsRouter());

// AFTER:
app.use('/api/contacts', requireAuth, requireModule('contacts'), createContactsRouter(db, requirePermission));
app.use('/api/companies', requireAuth, requireModule('companies'), createCompaniesRouter(db, requirePermission));
app.use('/api/deals', requireAuth, requireModule('pipelines'), createDealsRouter(requirePermission));
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/contacts.ts apps/api/src/routes/companies.ts apps/api/src/routes/deals.ts apps/api/src/index.ts
git commit -m "feat: wire requirePermission into contacts, companies, deals routes"
```

---

## Task 7: Wire `requirePermission` into Tasks, Activity, Websites Routes

**Files:**
- Modify: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/routes/activity.ts`
- Modify: `apps/api/src/routes/websites.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update `tasks.ts`**

Change signature:
```typescript
export function createTasksRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Add gates:
```typescript
router.get('/', requirePermission('tasks:view'), async ...);
router.post('/', requirePermission('tasks:create'), async ...);
router.get('/:id', requirePermission('tasks:view'), async ...);
router.patch('/:id', requirePermission('tasks:edit'), async ...);
router.delete('/:id', requirePermission('tasks:delete'), async ...);
```

- [ ] **Step 2: Update `activity.ts`**

Change signature:
```typescript
export function createActivityRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Add gates:
```typescript
router.get('/', requirePermission('activity:view'), async ...);
router.post('/', requirePermission('activity:create'), async ...);
```

- [ ] **Step 3: Update `websites.ts`**

Change signature (it takes `db` and `cronSecret`):
```typescript
export function createWebsitesRouter(db: Kysely<Database>, cronSecret: string, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Add gates:
```typescript
router.get('/', requirePermission('websites:view'), async ...);
router.post('/', requirePermission('websites:create'), async ...);
router.get('/:id', requirePermission('websites:view'), async ...);
router.patch('/:id', requirePermission('websites:edit'), async ...);
router.delete('/:id', requirePermission('websites:delete'), async ...);
```

- [ ] **Step 4: Update `apps/api/src/index.ts`**

```typescript
// BEFORE:
app.use('/api/tasks', requireAuth, requireModule('tasks'), createTasksRouter(db));
app.use('/api/activity', requireAuth, requireModule('activity'), createActivityRouter(db));
app.use('/api/websites', requireAuth, requireModule('websites'), createWebsitesRouter(db, env.CRON_SECRET));

// AFTER:
app.use('/api/tasks', requireAuth, requireModule('tasks'), createTasksRouter(db, requirePermission));
app.use('/api/activity', requireAuth, requireModule('activity'), createActivityRouter(db, requirePermission));
app.use('/api/websites', requireAuth, requireModule('websites'), createWebsitesRouter(db, env.CRON_SECRET, requirePermission));
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/tasks.ts apps/api/src/routes/activity.ts apps/api/src/routes/websites.ts apps/api/src/index.ts
git commit -m "feat: wire requirePermission into tasks, activity, websites routes"
```

---

## Task 8: Wire `requirePermission` into Servers + Analytics Routes

**Files:**
- Modify: `apps/api/src/routes/servers.ts`
- Modify: `apps/api/src/routes/analytics.ts`
- Modify: `apps/api/src/routes/pipelines.ts` (for stages/pipelines endpoints)
- Modify: `apps/api/src/routes/record-types.ts`
- Modify: `apps/api/src/routes/records.ts`
- Modify: `apps/api/src/routes/items.ts`
- Modify: `apps/api/src/routes/item-groups.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update `servers.ts`**

Change signature:
```typescript
export function createServersRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Add gates:
```typescript
router.get('/', requirePermission('servers:view'), async ...);
router.post('/', requirePermission('servers:create'), async ...);
router.get('/:id', requirePermission('servers:view'), async ...);
router.patch('/:id', requirePermission('servers:edit'), async ...);
router.delete('/:id', requirePermission('servers:delete'), async ...);
```

- [ ] **Step 2: Update `analytics.ts`**

Change signature:
```typescript
export function createAnalyticsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Add gate to all analytics routes:
```typescript
router.get('/pipeline', requirePermission('analytics:view'), async ...);
router.get('/revenue', requirePermission('analytics:view'), async ...);
router.get('/team', requirePermission('analytics:view'), async ...);
// (gate any other GET routes in analytics.ts with analytics:view)
```

- [ ] **Step 3: Update pipelines, record-types, records, items, item-groups**

Each of these belongs to the `pipelines` module. Read each file first, then apply the same pattern used in `contacts.ts`: add `requirePermission` as the last parameter and insert the correct gate on each route:
- GET routes → `requirePermission('pipelines:view')`
- POST routes → `requirePermission('pipelines:create')`
- PATCH / PUT routes → `requirePermission('pipelines:edit')`
- DELETE routes → `requirePermission('pipelines:delete')`

For `createPipelinesRouter` and `createStageFieldsRouter` (both in `apps/api/src/routes/pipelines.ts`):
```typescript
export function createPipelinesRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```
```typescript
export function createStageFieldsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
```

Apply the same signature change to `createRecordTypesRouter`, `createRecordsRouter`, `createItemGroupsRouter`, `createItemsRouter`.

- [ ] **Step 4: Update `apps/api/src/index.ts`**

```typescript
// BEFORE:
app.use('/api/pipelines', requireAuth, requireModule('pipelines'), createPipelinesRouter(db));
app.use('/api/stages', requireAuth, requireModule('pipelines'), createStageFieldsRouter(db));
app.use('/api/record-types', requireAuth, requireModule('pipelines'), createRecordTypesRouter(db));
app.use('/api/records', requireAuth, requireModule('pipelines'), createRecordsRouter(db));
app.use('/api/item-groups', requireAuth, requireModule('pipelines'), createItemGroupsRouter(db));
app.use('/api/items', requireAuth, requireModule('pipelines'), createItemsRouter(db));
app.use('/api/analytics', requireAuth, requireModule('analytics'), createAnalyticsRouter(db));
app.use('/api/servers', requireAuth, requireModule('servers'), createServersRouter(db));

// AFTER:
app.use('/api/pipelines', requireAuth, requireModule('pipelines'), createPipelinesRouter(db, requirePermission));
app.use('/api/stages', requireAuth, requireModule('pipelines'), createStageFieldsRouter(db, requirePermission));
app.use('/api/record-types', requireAuth, requireModule('pipelines'), createRecordTypesRouter(db, requirePermission));
app.use('/api/records', requireAuth, requireModule('pipelines'), createRecordsRouter(db, requirePermission));
app.use('/api/item-groups', requireAuth, requireModule('pipelines'), createItemGroupsRouter(db, requirePermission));
app.use('/api/items', requireAuth, requireModule('pipelines'), createItemsRouter(db, requirePermission));
app.use('/api/analytics', requireAuth, requireModule('analytics'), createAnalyticsRouter(db, requirePermission));
app.use('/api/servers', requireAuth, requireModule('servers'), createServersRouter(db, requirePermission));
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/servers.ts apps/api/src/routes/analytics.ts apps/api/src/routes/pipelines.ts apps/api/src/routes/record-types.ts apps/api/src/routes/records.ts apps/api/src/routes/items.ts apps/api/src/routes/item-groups.ts apps/api/src/index.ts
git commit -m "feat: wire requirePermission into servers, analytics, pipelines module routes"
```

---

## Task 9: `@vencore/api-client` — User Permissions Functions

**Files:**
- Create: `packages/api-client/src/user-permissions.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Create `packages/api-client/src/user-permissions.ts`**

```typescript
import { apiFetch } from './core';

export interface PermissionEntry {
  key: string;
  label: string;
  moduleId: string;
  moduleName: string;
  effectivelyGranted: boolean;
  isOverride: boolean;
  moduleEnabled: boolean;
}

export interface UserPermissionsResponse {
  data: { permissions: PermissionEntry[] };
  error: null;
}

export async function getUserPermissions(
  token: string,
  userId: string,
): Promise<UserPermissionsResponse> {
  return apiFetch(`/api/users/${userId}/permissions`, { token });
}

export async function setUserPermission(
  token: string,
  userId: string,
  permission: string,
  granted: boolean,
): Promise<{ data: { permission: string; granted: boolean }; error: null }> {
  return apiFetch(`/api/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permission, granted }),
    token,
  });
}

export async function deleteUserPermissionOverride(
  token: string,
  userId: string,
  permission: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/users/${userId}/permissions/${encodeURIComponent(permission)}`, {
    method: 'DELETE',
    token,
  });
}
```

- [ ] **Step 2: Add export to `packages/api-client/src/index.ts`**

Add at the end of the file:
```typescript
export * from './user-permissions';
```

- [ ] **Step 3: Build api-client**

```bash
cd packages/api-client && npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src/user-permissions.ts packages/api-client/src/index.ts packages/api-client/dist
git commit -m "feat: add user-permissions API client functions"
```

---

## Task 10: Frontend — User Permissions Admin UI

**Files:**
- Create: `apps/web/app/(dashboard)/settings/team/[userId]/permissions/page.tsx`
- Create: `apps/web/components/settings/UserPermissionsEditor.tsx`
- Modify: `apps/web/app/(dashboard)/settings/team/page.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add `@vencore/modules` to `apps/web/package.json`**

Add to `dependencies`:
```json
"@vencore/modules": "workspace:*",
```

- [ ] **Step 2: Create `apps/web/components/settings/UserPermissionsEditor.tsx`**

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import type { PermissionEntry } from '@vencore/api-client';
import { MODULE_REGISTRY } from '@vencore/modules';

interface Props {
  userId: string;
  isAdmin: boolean;
}

export function UserPermissionsEditor({ userId, isAdmin }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: async () =>
      apiFetch<{ data: { permissions: PermissionEntry[] }; error: null }>(
        `/api/users/${userId}/permissions`,
        { token: await getToken() },
      ),
  });

  const mutation = useMutation({
    mutationFn: async ({ permission, granted }: { permission: string; granted: boolean }) => {
      const token = await getToken();
      return apiFetch(`/api/users/${userId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission, granted }),
        token,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
    },
  });

  if (isAdmin) {
    return (
      <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text2)' }}>
        Admin users have full access to all permissions.
      </div>
    );
  }

  if (isLoading || !data) {
    return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading permissions…</div>;
  }

  const permsByModule = new Map<string, PermissionEntry[]>();
  for (const p of data.data.permissions) {
    const arr = permsByModule.get(p.moduleId) ?? [];
    arr.push(p);
    permsByModule.set(p.moduleId, arr);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {MODULE_REGISTRY.map(mod => {
        const perms = permsByModule.get(mod.id) ?? [];
        if (perms.length === 0) return null;
        const moduleEnabled = perms[0]?.moduleEnabled ?? false;

        return (
          <div key={mod.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{mod.name}</span>
              {!moduleEnabled && (
                <span style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text3)', padding: '2px 6px', borderRadius: 4 }}>
                  Module disabled
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {perms.map(p => (
                <div
                  key={p.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    opacity: moduleEnabled ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{p.label}</span>
                    {p.isOverride && (
                      <span style={{ fontSize: 10, background: 'var(--amber-bg)', color: 'var(--amber)', padding: '1px 5px', borderRadius: 3 }}>
                        Override
                      </span>
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: moduleEnabled ? 'pointer' : 'not-allowed' }}>
                    <input
                      type="checkbox"
                      checked={p.effectivelyGranted}
                      disabled={!moduleEnabled || mutation.isPending}
                      onChange={e => mutation.mutate({ permission: p.key, granted: e.target.checked })}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/settings/team/[userId]/permissions/page.tsx`**

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@vencore/types';
import { UserPermissionsEditor } from '@/components/settings/UserPermissionsEditor';

export default function UserPermissionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const getToken = useApiToken();

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const user = usersData?.data?.find(u => u.id === userId);

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Link href="/settings/team" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>
          ← Team
        </Link>
        {user && (
          <>
            <span style={{ color: 'var(--text3)' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          </>
        )}
      </div>

      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Permissions</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Manage what this user can do. Overrides apply on top of their role defaults.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : !user ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>User not found.</div>
      ) : (
        <UserPermissionsEditor userId={userId} isAdmin={user.role === 'admin'} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `apps/web/app/(dashboard)/settings/team/page.tsx` to list users with permission links**

Read the current file, then add a user list section. After the existing workspace card content, before the "Team invitations coming soon" paragraph, add a user listing that maps users and links to their permissions page.

Find the section with `apiFetch<{ data: { user: User; workspace: ... } }>('/api/me', ...)` and add a second query:

```typescript
const { data: usersData } = useQuery({
  queryKey: ['users'],
  queryFn: async () =>
    apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
});
const users = usersData?.data ?? [];
```

Then render the user list (replace "Team invitations and multi-seat management coming soon." paragraph):

```typescript
{users.length > 0 && (
  <div style={card}>
    <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Team Members</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {users.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{u.email}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'capitalize' }}>{u.role}</span>
            {currentUser?.role === 'admin' && (
              <a
                href={`/settings/team/${u.id}/permissions`}
                style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}
              >
                Permissions
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Build modules package and verify web compiles**

```bash
cd packages/modules && npm run build
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/settings/team apps/web/components/settings/UserPermissionsEditor.tsx apps/web/package.json
git commit -m "feat: add user permissions editor UI in settings/team"
```

---

## Task 11: Run Migration + Browser Verification

**Files:** none (runtime verification)

- [ ] **Step 1: Run DB migration**

```bash
cd packages/db && npm run db:migrate
```

Expected: migration `20260602_001_user_permissions` runs successfully.

- [ ] **Step 2: Start API**

```bash
cd apps/api && npm run dev
```

Expected: starts without errors.

- [ ] **Step 3: Start web**

```bash
cd apps/web && npm run dev
```

Expected: starts on `http://localhost:3000`.

- [ ] **Step 4: Test permission gate in browser**

1. Log in as a **member** user
2. Navigate to `/contacts` — should load (has `contacts:view`)
3. Try to delete a contact via the UI — should get 403 FORBIDDEN response
4. Log in as **admin** user
5. Navigate to `/settings/team` — should see user list with "Permissions" links
6. Click "Permissions" for a member — should show the permissions editor
7. Toggle `contacts:delete` ON for that member
8. Log back in as that member
9. Try to delete a contact — should succeed now

- [ ] **Step 5: Test module-disabled permission blocking**

1. As admin, go to `/settings/modules` and disable the `Contacts` module
2. Log in as a member
3. `GET /api/contacts` should return 403 (module disabled by `requireModule`) — not a permission issue
4. Re-enable Contacts module
5. Verify member can access contacts again

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify permission system end-to-end"
```
