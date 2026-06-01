# Module Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Vantage into a two-tier architecture where 8 built-in feature modules can be enabled/disabled per workspace by admins, with backend route gating and frontend UI gating.

**Architecture:** A `workspace_modules` table tracks enabled state per workspace per module. A `requireModule(moduleId)` middleware (with in-memory cache, 60s TTL) gates API routes. The frontend reads enabled modules via `GET /api/workspace/modules` and renders the sidebar + pages conditionally via `ModuleProvider` and `ModuleGuard`.

**Tech Stack:** Node.js + Express + Kysely (backend), Next.js 14 App Router + React Context (frontend), Vitest (tests), TypeScript strict.

---

## Branch Setup

Work on branch `feat/module-registry`. Create it before starting Task 1:

```bash
git checkout -b feat/module-registry
```

---

## Files Overview

**Create:**
- `packages/db/migrations/20260531_003_workspace_modules.ts`
- `apps/api/src/modules/manifests.ts`
- `apps/api/src/modules/registry.ts`
- `apps/api/src/middleware/module.ts`
- `apps/api/src/routes/workspace-modules.ts`
- `apps/api/src/__tests__/workspace-modules.test.ts`
- `apps/web/src/contexts/modules.tsx`
- `apps/web/src/components/ModuleGuard.tsx`
- `apps/web/src/app/(app)/settings/modules/page.tsx`

**Modify:**
- `packages/db/src/schema.ts` — add `WorkspaceModuleTable`
- `apps/api/src/index.ts` — register new route + add `requireModule` to 8 route registrations
- `apps/api/src/routes/setup.ts` — seed modules on workspace creation
- `apps/web/src/app/(app)/layout.tsx` — wrap with `ModuleProvider`
- Sidebar component (find with: `grep -r 'sidebar\|nav.*items\|navItems' apps/web/src --include="*.tsx" -l`)
- Each module's root page — add `ModuleGuard`

---

## Task 1: DB Migration — workspace_modules table

**Files:**
- Create: `packages/db/migrations/20260531_003_workspace_modules.ts`

- [ ] **Step 1: Write the migration**

```typescript
// packages/db/migrations/20260531_003_workspace_modules.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_modules')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('module_id', 'varchar(64)', col => col.notNull())
    .addColumn('enabled', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('updated_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_by', 'uuid', col =>
      col.references('users.id').onDelete('set null'),
    )
    .addUniqueConstraint('workspace_modules_workspace_module_unique', [
      'workspace_id',
      'module_id',
    ])
    .execute();

  await db.schema
    .createIndex('workspace_modules_workspace_idx')
    .on('workspace_modules')
    .columns(['workspace_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('workspace_modules_workspace_idx').execute();
  await db.schema.dropTable('workspace_modules').execute();
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && pnpm db:migrate
```

Expected output includes: `✓ 20260531_003_workspace_modules`

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/20260531_003_workspace_modules.ts
git commit -m "feat(db): add workspace_modules migration"
```

---

## Task 2: Add WorkspaceModuleTable to DB schema

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Read the current schema file** to find where to add the new table interface. Open `packages/db/src/schema.ts`.

- [ ] **Step 2: Add the table interface** — insert after the last table interface, before the `Database` interface:

```typescript
export interface WorkspaceModuleTable {
  id: Generated<string>;
  workspace_id: string;
  module_id: string;
  enabled: Generated<boolean>;
  updated_at: Generated<Date>;
  updated_by: string | null;
}
```

- [ ] **Step 3: Add to the Database interface** — find the `Database` interface and add:

```typescript
workspace_modules: WorkspaceModuleTable;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd packages/db && pnpm build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add WorkspaceModuleTable type"
```

---

## Task 3: Module Manifests + Registry

**Files:**
- Create: `apps/api/src/modules/manifests.ts`
- Create: `apps/api/src/modules/registry.ts`

- [ ] **Step 1: Create manifests file**

```typescript
// apps/api/src/modules/manifests.ts
export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  nav: { label: string; path: string; icon: string }[];
  apiPrefixes: string[];
  workers: string[];
}

export const CONTACTS_MODULE: ModuleManifest = {
  id: 'contacts',
  name: 'Contacts',
  description: 'Contact management, profiles, and history.',
  icon: 'Users',
  defaultEnabled: true,
  nav: [{ label: 'Contacts', path: '/contacts', icon: 'Users' }],
  apiPrefixes: ['/contacts'],
  workers: [],
};

export const COMPANIES_MODULE: ModuleManifest = {
  id: 'companies',
  name: 'Companies',
  description: 'Company records and relationships.',
  icon: 'Building2',
  defaultEnabled: true,
  nav: [{ label: 'Companies', path: '/companies', icon: 'Building2' }],
  apiPrefixes: ['/companies'],
  workers: [],
};

export const PIPELINES_MODULE: ModuleManifest = {
  id: 'pipelines',
  name: 'Pipelines',
  description: 'Deals pipeline, pipeline views, items, and conversions.',
  icon: 'Kanban',
  defaultEnabled: true,
  nav: [
    { label: 'Pipeline', path: '/pipeline', icon: 'Kanban' },
    { label: 'Items', path: '/items', icon: 'Package' },
  ],
  apiPrefixes: [
    '/deals',
    '/pipelines',
    '/stages',
    '/items',
    '/item-groups',
    '/conversions',
    '/record-types',
    '/records',
  ],
  workers: [],
};

export const TASKS_MODULE: ModuleManifest = {
  id: 'tasks',
  name: 'Tasks',
  description: 'Task management and due date tracking.',
  icon: 'CheckSquare',
  defaultEnabled: true,
  nav: [{ label: 'Tasks', path: '/tasks', icon: 'CheckSquare' }],
  apiPrefixes: ['/tasks'],
  workers: ['task-due-notifier'],
};

export const WEBSITES_MODULE: ModuleManifest = {
  id: 'websites',
  name: 'Websites',
  description: 'Website uptime monitoring, response times, and SSL expiry.',
  icon: 'Globe',
  defaultEnabled: true,
  nav: [{ label: 'Websites', path: '/websites', icon: 'Globe' }],
  apiPrefixes: ['/websites'],
  workers: ['website-checker'],
};

export const SERVERS_MODULE: ModuleManifest = {
  id: 'servers',
  name: 'Servers',
  description: 'Server monitoring and agent heartbeats.',
  icon: 'Server',
  defaultEnabled: true,
  nav: [{ label: 'Servers', path: '/servers', icon: 'Server' }],
  apiPrefixes: ['/servers', '/deployments', '/agent', '/ssh'],
  workers: [],
};

export const ANALYTICS_MODULE: ModuleManifest = {
  id: 'analytics',
  name: 'Analytics',
  description: 'Revenue, pipeline stats, and team leaderboard.',
  icon: 'BarChart2',
  defaultEnabled: true,
  nav: [{ label: 'Analytics', path: '/analytics', icon: 'BarChart2' }],
  apiPrefixes: ['/analytics'],
  workers: [],
};

export const ACTIVITY_MODULE: ModuleManifest = {
  id: 'activity',
  name: 'Activity',
  description: 'Unified activity feed across all workspace records.',
  icon: 'Activity',
  defaultEnabled: true,
  nav: [{ label: 'Activity', path: '/activity', icon: 'Activity' }],
  apiPrefixes: ['/activity'],
  workers: [],
};
```

- [ ] **Step 2: Create registry file**

```typescript
// apps/api/src/modules/registry.ts
import {
  CONTACTS_MODULE,
  COMPANIES_MODULE,
  PIPELINES_MODULE,
  TASKS_MODULE,
  WEBSITES_MODULE,
  SERVERS_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
  type ModuleManifest,
} from './manifests';

export { type ModuleManifest };

export const MODULE_REGISTRY: ModuleManifest[] = [
  CONTACTS_MODULE,
  COMPANIES_MODULE,
  PIPELINES_MODULE,
  TASKS_MODULE,
  WEBSITES_MODULE,
  SERVERS_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
];

export const MODULE_IDS = MODULE_REGISTRY.map(m => m.id);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/
git commit -m "feat(modules): add module manifests and registry"
```

---

## Task 4: requireModule Middleware

**Files:**
- Create: `apps/api/src/middleware/module.ts`
- Create: `apps/api/src/__tests__/module-middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/__tests__/module-middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { createRequireModule } from '../middleware/module';
import type { AuthenticatedRequest } from '../middleware/auth';

function mockReq(workspaceId: string): Partial<AuthenticatedRequest> {
  return { workspace: { id: workspaceId } as any };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireModule middleware', () => {
  let db: Partial<Kysely<Database>>;

  beforeEach(() => {
    db = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ enabled: true }),
      }),
    } as any;
  });

  it('calls next() when module is enabled', async () => {
    const requireModule = createRequireModule(db as Kysely<Database>);
    const middleware = requireModule('contacts');
    const next = vi.fn();
    await middleware(mockReq('ws-1') as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when module is disabled', async () => {
    (db.selectFrom as any).mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ enabled: false }),
    });
    const requireModule = createRequireModule(db as Kysely<Database>);
    const middleware = requireModule('contacts');
    const next = vi.fn();
    const res = mockRes();
    await middleware(mockReq('ws-1') as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: { code: 'MODULE_DISABLED', message: 'contacts module is disabled for this workspace.' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when module row does not exist', async () => {
    (db.selectFrom as any).mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    });
    const requireModule = createRequireModule(db as Kysely<Database>);
    const middleware = requireModule('contacts');
    const next = vi.fn();
    const res = mockRes();
    await middleware(mockReq('ws-1') as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && pnpm test __tests__/module-middleware.test.ts
```

Expected: FAIL — `createRequireModule` not found.

- [ ] **Step 3: Implement the middleware**

```typescript
// apps/api/src/middleware/module.ts
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from './auth';

// In-memory cache: key = `{workspaceId}:{moduleId}`, value = { enabled, expiresAt }
const moduleCache = new Map<string, { enabled: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function isModuleEnabled(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
): Promise<boolean> {
  const cacheKey = `${workspaceId}:${moduleId}`;
  const cached = moduleCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.enabled;
  }

  const row = await db
    .selectFrom('workspace_modules')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', moduleId)
    .select('enabled')
    .executeTakeFirst();

  const enabled = row?.enabled ?? false;
  moduleCache.set(cacheKey, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
  return enabled;
}

export function invalidateModuleCache(workspaceId: string, moduleId: string): void {
  moduleCache.delete(`${workspaceId}:${moduleId}`);
}

export function createRequireModule(db: Kysely<Database>) {
  return function requireModule(moduleId: string) {
    return async function (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      const { workspace } = req as AuthenticatedRequest;
      const enabled = await isModuleEnabled(db, workspace.id, moduleId);
      if (!enabled) {
        res.status(403).json({
          data: null,
          error: {
            code: 'MODULE_DISABLED',
            message: `${moduleId} module is disabled for this workspace.`,
          },
        });
        return;
      }
      next();
    };
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && pnpm test __tests__/module-middleware.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/module.ts apps/api/src/__tests__/module-middleware.test.ts
git commit -m "feat(api): add requireModule middleware with in-memory cache"
```

---

## Task 5: workspace-modules Route (GET + PATCH)

**Files:**
- Create: `apps/api/src/routes/workspace-modules.ts`
- Create: `apps/api/src/__tests__/workspace-modules.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/workspace-modules.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { createWorkspaceModulesRouter } from '../routes/workspace-modules';

function buildApp(db: Partial<Kysely<Database>>, role: 'admin' | 'member' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1', role };
    next();
  });
  app.use('/api/workspace/modules', createWorkspaceModulesRouter(db as Kysely<Database>));
  return app;
}

const mockModuleRows = [
  { module_id: 'contacts', enabled: true },
  { module_id: 'companies', enabled: true },
  { module_id: 'pipelines', enabled: false },
];

describe('GET /api/workspace/modules', () => {
  it('returns all modules with enabled status', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        selectAll: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(mockModuleRows),
      }),
    };
    const res = await request(buildApp(db)).get('/api/workspace/modules');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toMatchObject({ module_id: 'contacts', enabled: true });
  });
});

describe('PATCH /api/workspace/modules/:moduleId', () => {
  it('toggles module enabled status (admin)', async () => {
    const updateResult = { numUpdatedRows: BigInt(1) };
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(updateResult),
      }),
    };
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/contacts')
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ module_id: 'contacts', enabled: false });
  });

  it('returns 403 for non-admin', async () => {
    const db: any = {};
    const res = await request(buildApp(db, 'member'))
      .patch('/api/workspace/modules/contacts')
      .send({ enabled: false });
    expect(res.status).toBe(403);
  });

  it('returns 400 for unknown moduleId', async () => {
    const db: any = {};
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/unknown-module')
      .send({ enabled: false });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && pnpm test __tests__/workspace-modules.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

```typescript
// apps/api/src/routes/workspace-modules.ts
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { MODULE_IDS } from '../modules/registry';
import { invalidateModuleCache } from '../middleware/module';

const patchSchema = z.object({
  enabled: z.boolean(),
});

export function createWorkspaceModulesRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/workspace/modules — list all modules with enabled status
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const rows = await db
        .selectFrom('workspace_modules')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .execute();
      res.json({ data: rows, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/workspace/modules/:moduleId — toggle (admin only)
  router.patch('/:moduleId', async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;

      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const { moduleId } = req.params;
      if (!MODULE_IDS.includes(moduleId)) {
        res.status(400).json({
          data: null,
          error: { code: 'INVALID_MODULE', message: `Unknown module: ${moduleId}` },
        });
        return;
      }

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY' } });
        return;
      }

      await db
        .updateTable('workspace_modules')
        .set({
          enabled: parsed.data.enabled,
          updated_at: new Date(),
          updated_by: user.id,
        })
        .where('workspace_id', '=', workspace.id)
        .where('module_id', '=', moduleId)
        .executeTakeFirst();

      // Invalidate cache so next request re-reads from DB
      invalidateModuleCache(workspace.id, moduleId);

      res.json({ data: { module_id: moduleId, enabled: parsed.data.enabled }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/api && pnpm test __tests__/workspace-modules.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/workspace-modules.ts apps/api/src/__tests__/workspace-modules.test.ts
git commit -m "feat(api): add workspace modules GET/PATCH endpoints"
```

---

## Task 6: Register Route + Wire requireModule into index.ts

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Read `apps/api/src/index.ts`** to find the exact location to add imports and route registrations.

- [ ] **Step 2: Add imports** — after existing middleware imports, add:

```typescript
import { createRequireModule } from './middleware/module';
import { createWorkspaceModulesRouter } from './routes/workspace-modules';
```

- [ ] **Step 3: Create requireModule instance** — after `const requireAuth = createRequireAuth(db, env.JWT_SECRET);` add:

```typescript
const requireModule = createRequireModule(db);
```

- [ ] **Step 4: Register workspace-modules route** — add before or after the `app.use('/api/me', ...)` line:

```typescript
app.use('/api/workspace/modules', requireAuth, createWorkspaceModulesRouter(db));
```

- [ ] **Step 5: Add requireModule guards to existing routes** — update the 8 module routes. Find each `app.use` line and insert `requireModule('...')` as middleware:

```typescript
// Replace these 8 lines (find them in index.ts):
app.use('/api/contacts', requireAuth, createContactsRouter(db));
app.use('/api/companies', requireAuth, createCompaniesRouter(db));
app.use('/api/deals', requireAuth, createDealsRouter());
app.use('/api/record-types', requireAuth, createRecordTypesRouter(db));
app.use('/api/records', requireAuth, createRecordsRouter(db));
app.use('/api', requireAuth, createConversionsRouter(db));   // conversions
app.use('/api/pipelines', requireAuth, createPipelinesRouter(db));
app.use('/api/stages', requireAuth, createStageFieldsRouter(db));
app.use('/api/items', requireAuth, createItemsRouter(db));
app.use('/api/item-groups', requireAuth, createItemGroupsRouter(db));
app.use('/api/tasks', requireAuth, createTasksRouter(db));
app.use('/api/calendar/events', requireAuth, createCalendarRouter(db)); // leave as-is (plugin)
app.use('/api/activity', requireAuth, createActivityRouter(db));
app.use('/api/servers', requireAuth, createServersRouter(db));
app.use('/api/deployments', requireAuth, createDeploymentsRouter(db));
app.use('/api/websites', requireAuth, createWebsitesRouter(db, env.CRON_SECRET));
app.use('/api/analytics', requireAuth, createAnalyticsRouter(db));

// With:
app.use('/api/contacts', requireAuth, requireModule('contacts'), createContactsRouter(db));
app.use('/api/companies', requireAuth, requireModule('companies'), createCompaniesRouter(db));
app.use('/api/deals', requireAuth, requireModule('pipelines'), createDealsRouter());
app.use('/api/record-types', requireAuth, requireModule('pipelines'), createRecordTypesRouter(db));
app.use('/api/records', requireAuth, requireModule('pipelines'), createRecordsRouter(db));
app.use('/api', requireAuth, requireModule('pipelines'), createConversionsRouter(db));
app.use('/api/pipelines', requireAuth, requireModule('pipelines'), createPipelinesRouter(db));
app.use('/api/stages', requireAuth, requireModule('pipelines'), createStageFieldsRouter(db));
app.use('/api/items', requireAuth, requireModule('pipelines'), createItemsRouter(db));
app.use('/api/item-groups', requireAuth, requireModule('pipelines'), createItemGroupsRouter(db));
app.use('/api/tasks', requireAuth, requireModule('tasks'), createTasksRouter(db));
app.use('/api/activity', requireAuth, requireModule('activity'), createActivityRouter(db));
app.use('/api/servers', requireAuth, requireModule('servers'), createServersRouter(db));
app.use('/api/deployments', requireAuth, requireModule('servers'), createDeploymentsRouter(db));
app.use('/api/websites', requireAuth, requireModule('websites'), createWebsitesRouter(db, env.CRON_SECRET));
app.use('/api/analytics', requireAuth, requireModule('analytics'), createAnalyticsRouter(db));
```

- [ ] **Step 6: Build to verify no TypeScript errors**

```bash
cd apps/api && pnpm build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): wire requireModule guards into route registrations"
```

---

## Task 7: Seed workspace_modules on Creation + Backfill Existing

**Files:**
- Modify: `apps/api/src/routes/setup.ts` (or wherever workspace creation happens — check `apps/api/src/routes/auth.ts` and `apps/api/src/routes/setup.ts`)
- Create: `apps/api/src/scripts/backfill-modules.ts`

- [ ] **Step 1: Create seedModules helper** — add this function to `apps/api/src/lib/seed-modules.ts`:

```typescript
// apps/api/src/lib/seed-modules.ts
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { MODULE_REGISTRY } from '../modules/registry';

export async function seedWorkspaceModules(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<void> {
  const rows = MODULE_REGISTRY.map(m => ({
    workspace_id: workspaceId,
    module_id: m.id,
    enabled: m.defaultEnabled,
  }));

  // Insert all 8, skip conflicts (idempotent)
  await db
    .insertInto('workspace_modules')
    .values(rows)
    .onConflict(oc => oc.columns(['workspace_id', 'module_id']).doNothing())
    .execute();
}
```

- [ ] **Step 2: Find workspace creation** — read `apps/api/src/routes/setup.ts` and `apps/api/src/routes/auth.ts`. Search for where a new workspace row is inserted (`insertInto('workspaces')`). Add `await seedWorkspaceModules(db, newWorkspaceId)` immediately after the insert.

- [ ] **Step 3: Create backfill script** for existing workspaces:

```typescript
// apps/api/src/scripts/backfill-modules.ts
import { createDb } from '@vantage/db';
import { seedWorkspaceModules } from '../lib/seed-modules';

async function main() {
  const db = createDb(process.env['DATABASE_URL']!);

  const workspaces = await db
    .selectFrom('workspaces')
    .select('id')
    .execute();

  console.log(`Backfilling ${workspaces.length} workspaces...`);

  for (const ws of workspaces) {
    await seedWorkspaceModules(db, ws.id);
    console.log(`  ✓ ${ws.id}`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run backfill against the DB**

```bash
cd apps/api && DATABASE_URL="<your-db-url>" npx tsx src/scripts/backfill-modules.ts
```

Expected: `Backfilling N workspaces... ✓ <id>... Done.`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/seed-modules.ts apps/api/src/scripts/backfill-modules.ts apps/api/src/routes/setup.ts
git commit -m "feat(api): seed workspace_modules on workspace creation, backfill script"
```

---

## Task 8: Frontend — ModuleProvider + useModules Hook

**Files:**
- Create: `apps/web/src/contexts/modules.tsx`

- [ ] **Step 1: Create the context**

```typescript
// apps/web/src/contexts/modules.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface ModuleRow {
  module_id: string;
  enabled: boolean;
}

interface ModulesContextValue {
  modules: ModuleRow[];
  isEnabled: (moduleId: string) => boolean;
  setEnabled: (moduleId: string, enabled: boolean) => void;
  isLoading: boolean;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/workspace/modules', { credentials: 'include' })
      .then(r => r.json())
      .then(body => {
        if (body.data) setModules(body.data);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function isEnabled(moduleId: string): boolean {
    const row = modules.find(m => m.module_id === moduleId);
    return row?.enabled ?? false;
  }

  function setEnabled(moduleId: string, enabled: boolean) {
    setModules(prev =>
      prev.map(m => (m.module_id === moduleId ? { ...m, enabled } : m)),
    );
  }

  return (
    <ModulesContext.Provider value={{ modules, isEnabled, setEnabled, isLoading }}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be used inside ModuleProvider');
  return ctx;
}
```

- [ ] **Step 2: Wrap root layout** — open `apps/web/src/app/(app)/layout.tsx`. Import `ModuleProvider` and wrap the children:

```typescript
import { ModuleProvider } from '@/contexts/modules';
// ...
// Inside the layout, wrap children:
<ModuleProvider>
  {children}
</ModuleProvider>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/contexts/modules.tsx apps/web/src/app/(app)/layout.tsx
git commit -m "feat(web): add ModuleProvider and useModules hook"
```

---

## Task 9: Frontend — Sidebar Refactor

**Files:**
- Modify: Sidebar component (find it: `grep -r "href.*contacts\|href.*companies\|href.*pipeline" apps/web/src --include="*.tsx" -l`)

- [ ] **Step 1: Find the sidebar component** using the grep command above. It will be the file containing all the nav links.

- [ ] **Step 2: Import useModules** at the top of the sidebar file:

```typescript
import { useModules } from '@/contexts/modules';
```

- [ ] **Step 3: Use isEnabled to conditionally render nav items** — inside the sidebar component, call `const { isEnabled } = useModules()` then wrap each module's nav item with `{isEnabled('contacts') && <NavItem ... />}`. Repeat for all 8 modules.

  Example pattern for each nav item:
  ```typescript
  const { isEnabled } = useModules();
  // ...
  {isEnabled('contacts') && (
    <NavItem href="/contacts" icon={Users} label="Contacts" />
  )}
  {isEnabled('companies') && (
    <NavItem href="/companies" icon={Building2} label="Companies" />
  )}
  {isEnabled('pipelines') && (
    <NavItem href="/pipeline" icon={Kanban} label="Pipeline" />
  )}
  {isEnabled('pipelines') && (
    <NavItem href="/items" icon={Package} label="Items" />
  )}
  {isEnabled('tasks') && (
    <NavItem href="/tasks" icon={CheckSquare} label="Tasks" />
  )}
  {isEnabled('servers') && (
    <NavItem href="/servers" icon={Server} label="Servers" />
  )}
  {isEnabled('websites') && (
    <NavItem href="/websites" icon={Globe} label="Websites" />
  )}
  {isEnabled('analytics') && (
    <NavItem href="/analytics" icon={BarChart2} label="Analytics" />
  )}
  {isEnabled('activity') && (
    <NavItem href="/activity" icon={Activity} label="Activity" />
  )}
  ```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): hide disabled module nav items in sidebar"
```

---

## Task 10: Frontend — ModuleGuard Component + Page Guards

**Files:**
- Create: `apps/web/src/components/ModuleGuard.tsx`
- Modify: Root page for each of the 8 module routes

- [ ] **Step 1: Create ModuleGuard**

```typescript
// apps/web/src/components/ModuleGuard.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useModules } from '@/contexts/modules';

interface ModuleGuardProps {
  moduleId: string;
  children: React.ReactNode;
}

export function ModuleGuard({ moduleId, children }: ModuleGuardProps) {
  const { isEnabled, isLoading } = useModules();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isEnabled(moduleId)) {
      router.replace('/dashboard');
    }
  }, [isLoading, moduleId, isEnabled, router]);

  if (isLoading) return null;
  if (!isEnabled(moduleId)) return null;

  return <>{children}</>;
}
```

- [ ] **Step 2: Add ModuleGuard to each module's root page** — find the root page for each module (e.g. `apps/web/src/app/(app)/contacts/page.tsx`) and wrap the page content:

```typescript
import { ModuleGuard } from '@/components/ModuleGuard';

export default function ContactsPage() {
  return (
    <ModuleGuard moduleId="contacts">
      {/* existing page content */}
    </ModuleGuard>
  );
}
```

Repeat for: contacts, companies, pipeline/deals, tasks, servers, websites, analytics, activity root pages.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ModuleGuard.tsx apps/web/src/app/
git commit -m "feat(web): add ModuleGuard, protect module root pages"
```

---

## Task 11: Frontend — /settings/modules Page

**Files:**
- Create: `apps/web/src/app/(app)/settings/modules/page.tsx`

- [ ] **Step 1: Create the settings page**

```typescript
// apps/web/src/app/(app)/settings/modules/page.tsx
'use client';

import { useState } from 'react';
import { useModules } from '@/contexts/modules';

const MODULE_META: { id: string; name: string; description: string; icon: string }[] = [
  { id: 'contacts', name: 'Contacts', description: 'Contact management, profiles, and history.', icon: '👤' },
  { id: 'companies', name: 'Companies', description: 'Company records and relationships.', icon: '🏢' },
  { id: 'pipelines', name: 'Pipelines', description: 'Deals pipeline, items, and conversions.', icon: '📊' },
  { id: 'tasks', name: 'Tasks', description: 'Task management and due date tracking.', icon: '✅' },
  { id: 'websites', name: 'Websites', description: 'Website uptime monitoring and SSL expiry.', icon: '🌐' },
  { id: 'servers', name: 'Servers', description: 'Server monitoring and agent heartbeats.', icon: '🖥️' },
  { id: 'analytics', name: 'Analytics', description: 'Revenue, pipeline stats, and team leaderboard.', icon: '📈' },
  { id: 'activity', name: 'Activity', description: 'Unified activity feed across all workspace records.', icon: '⚡' },
];

export default function ModulesSettingsPage() {
  const { isEnabled, setEnabled } = useModules();
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(moduleId: string) {
    const next = !isEnabled(moduleId);
    setPending(moduleId);
    try {
      const res = await fetch(`/api/workspace/modules/${moduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setEnabled(moduleId, next);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold mb-2">Modules</h1>
      <p className="text-sm text-[var(--text2)] mb-8">
        Enable or disable features for your workspace.
      </p>
      <div className="space-y-3">
        {MODULE_META.map(mod => (
          <div
            key={mod.id}
            className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{mod.icon}</span>
              <div>
                <p className="font-medium text-sm">{mod.name}</p>
                <p className="text-xs text-[var(--text3)]">{mod.description}</p>
              </div>
            </div>
            <button
              disabled={pending === mod.id}
              onClick={() => toggle(mod.id)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                isEnabled(mod.id) ? 'bg-[var(--green)]' : 'bg-[var(--border)]'
              } disabled:opacity-50`}
              aria-label={`${isEnabled(mod.id) ? 'Disable' : 'Enable'} ${mod.name}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled(mod.id) ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add link to modules settings** — find the settings navigation (likely in `apps/web/src/app/(app)/settings/layout.tsx` or a settings sidebar component) and add a link to `/settings/modules`.

- [ ] **Step 3: Verify page renders** — start the web dev server and navigate to `/settings/modules`. All 8 modules should appear with toggle switches.

```bash
cd apps/web && pnpm dev
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(app)/settings/modules/
git commit -m "feat(web): add /settings/modules admin page"
```

---

## Task 12: End-to-End Smoke Test

- [ ] **Step 1: Start the full stack** (`pnpm dev` from root or start API + web separately)

- [ ] **Step 2: Log in as an admin**

- [ ] **Step 3: Navigate to `/settings/modules`** — verify all 8 modules show as enabled

- [ ] **Step 4: Disable the `contacts` module** — toggle it off

- [ ] **Step 5: Verify**:
  - Contacts nav item disappears from sidebar
  - Navigating to `/contacts` redirects to `/dashboard`
  - `GET /api/contacts` returns `403 MODULE_DISABLED`

- [ ] **Step 6: Re-enable `contacts`** — toggle it back on. Verify contacts reappear.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: module registry — workspace-level enable/disable for 8 built-in modules"
```
