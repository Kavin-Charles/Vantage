# Deployment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deployment tracking to Vantage — users log deploys from CI webhooks, the monitoring agent, or manual curl; view a filterable global feed in the dashboard.

**Architecture:** New `deployments` table in PostgreSQL. Internal dashboard routes use JWT auth (`/api/deployments`). CI/webhook callers use API key auth via the existing `/v1` router. The monitoring agent calls a new `/api/agent/deployment` endpoint. A background worker clears stale `running` records hourly.

**Tech Stack:** Kysely (DB queries), Zod (validation), Express (routes), Vitest (tests), React + TanStack Query (frontend), `@tanstack/react-query` v5.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/db/migrations/20260531_001_deployments.ts` | SQL migration — `deployments` table |
| Modify | `packages/db/src/schema.ts` | Add `DeploymentTable`, type aliases, `Database` key |
| Modify | `packages/types/src/index.ts` | Add `DeploymentStatus`, `DeploymentSource`, `Deployment` interface |
| Create | `apps/api/src/routes/deployments.ts` | Internal router (JWT auth): GET/POST/PATCH/DELETE |
| Create | `apps/api/src/__tests__/deployments.test.ts` | Vitest unit tests for the router |
| Modify | `apps/api/src/routes/agent.ts` | Add `POST /deployment` (agent token auth) |
| Modify | `apps/api/src/routes/v1/infra.ts` | Add `POST /deployments`, `PATCH /deployments/:id` (API key auth) |
| Create | `apps/api/src/workers/stale-deployments.ts` | Hourly: mark `running` deploys >24h as `cancelled` |
| Modify | `apps/api/src/index.ts` | Register router + worker |
| Create | `apps/web/lib/deployments.ts` | Web API client functions |
| Create | `apps/web/app/(dashboard)/deployments/page.tsx` | Deployments dashboard page |
| Modify | `apps/web/components/Sidebar.tsx` | Add Deployments to Infrastructure nav group |

---

## Task 1: DB Migration

**Files:**
- Create: `packages/db/migrations/20260531_001_deployments.ts`

- [ ] **Step 1: Write the migration file**

```typescript
// packages/db/migrations/20260531_001_deployments.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('deployments')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('server_id', 'uuid', col => col.references('servers.id').onDelete('set null'))
    .addColumn('name', 'varchar(255)')
    .addColumn('environment', 'varchar(100)')
    .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('pending'))
    .addColumn('source', 'varchar(20)', col => col.notNull())
    .addColumn('started_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('finished_at', 'timestamptz')
    .addColumn('duration_s', 'integer')
    .addColumn('git_commit', 'varchar(40)')
    .addColumn('git_branch', 'varchar(255)')
    .addColumn('git_tag', 'varchar(255)')
    .addColumn('git_message', 'text')
    .addColumn('git_author', 'varchar(255)')
    .addColumn('meta', 'jsonb')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for the common dashboard query: workspace + time desc
  await db.schema
    .createIndex('deployments_workspace_created_idx')
    .on('deployments')
    .columns(['workspace_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('deployments_workspace_created_idx').execute();
  await db.schema.dropTable('deployments').execute();
}
```

- [ ] **Step 2: Run the migration**

```bash
pnpm --filter @vantage/db db:migrate
```

Expected output: `✓ 20260531_001_deployments`

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/20260531_001_deployments.ts
git commit -m "feat(db): add deployments table migration"
```

---

## Task 2: DB Schema Types

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the failing type check**

```bash
pnpm --filter @vantage/db lint
```

Expected: passes (no `deployments` key yet in `Database` — this is our baseline).

- [ ] **Step 2: Add `DeploymentTable` to `packages/db/src/schema.ts`**

Add the interface after `AlertThresholdTable` (find it with: search for `AlertThresholdTable`). Add before the `Database` interface:

```typescript
export interface DeploymentTable {
  id: Generated<string>;
  workspace_id: string;
  server_id: string | null;
  name: string | null;
  environment: string | null;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  source: 'webhook' | 'agent' | 'manual';
  started_at: Generated<Date>;
  finished_at: Date | null;
  duration_s: number | null;
  git_commit: string | null;
  git_branch: string | null;
  git_tag: string | null;
  git_message: string | null;
  git_author: string | null;
  meta: Record<string, unknown> | null;
  created_at: Generated<Date>;
}

export type Deployment = Selectable<DeploymentTable>;
export type NewDeployment = Insertable<DeploymentTable>;
export type DeploymentUpdate = Updateable<DeploymentTable>;
```

Then add `deployments: DeploymentTable;` to the `Database` interface (after `alert_thresholds`):

```typescript
export interface Database {
  // ... existing entries ...
  alert_thresholds: AlertThresholdTable;
  deployments: DeploymentTable;   // ← add this line
  // ... rest of existing entries ...
}
```

- [ ] **Step 3: Add types to `packages/types/src/index.ts`**

Append to the end of the file:

```typescript
export type DeploymentStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
export type DeploymentSource = 'webhook' | 'agent' | 'manual';

export interface Deployment {
  id: UUID;
  workspace_id: UUID;
  server_id: UUID | null;
  name: string | null;
  environment: string | null;
  status: DeploymentStatus;
  source: DeploymentSource;
  started_at: Date;
  finished_at: Date | null;
  duration_s: number | null;
  git_commit: string | null;
  git_branch: string | null;
  git_tag: string | null;
  git_message: string | null;
  git_author: string | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
}
```

- [ ] **Step 4: Verify types compile**

```bash
pnpm --filter @vantage/db lint
pnpm --filter @vantage/types lint
```

Expected: both pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/types/src/index.ts
git commit -m "feat(db): add Deployment types to schema and types package"
```

---

## Task 3: Internal Deployments Router

**Files:**
- Create: `apps/api/src/routes/deployments.ts`
- Create: `apps/api/src/__tests__/deployments.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/deployments.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

function buildMockDb(rows: object[] = [], single: object | null = null) {
  const chain: Record<string, unknown> = {};
  const methods = ['selectFrom','insertInto','updateTable','deleteFrom','where','selectAll',
    'select','orderBy','limit','offset','values','set','returningAll'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(single);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: rows.length });
  return chain as unknown;
}

describe('GET /api/deployments', () => {
  it('returns deployments scoped to workspace', async () => {
    const deployment = { id: 'd1', workspace_id: 'ws1', status: 'success', source: 'webhook', name: 'api', environment: 'production', created_at: new Date() };
    const db = buildMockDb([deployment]);
    const { createDeploymentsRouter } = await import('../routes/deployments');
    const router = createDeploymentsRouter(db as never);

    const listRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/');
    const handler = listRoute!.route.stack[0]!.handle;

    const req = { query: {}, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [deployment], error: null }),
    );
  });
});

describe('POST /api/deployments', () => {
  it('creates a deployment and returns 201', async () => {
    const created = { id: 'd2', workspace_id: 'ws1', status: 'success', source: 'manual', name: 'web', environment: 'staging', created_at: new Date() };
    const db = buildMockDb([], created);
    const { createDeploymentsRouter } = await import('../routes/deployments');
    const router = createDeploymentsRouter(db as never);

    const postRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/' && s.route.stack.length > 0);
    // find the POST handler (second route registered at '/')
    const handlers = (router as unknown as { stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack
      .filter(s => s.route?.path === '/');
    const postHandler = handlers.find(s => s.route.methods['post'])?.route.stack[0]?.handle;

    const req = { body: { status: 'success', source: 'manual', name: 'web', environment: 'staging' }, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await postHandler!(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: created, error: null }));
  });
});

describe('PATCH /api/deployments/:id — 404 on missing', () => {
  it('returns 404 when deployment not in workspace', async () => {
    const db = buildMockDb([], null); // executeTakeFirst returns null
    const { createDeploymentsRouter } = await import('../routes/deployments');
    const router = createDeploymentsRouter(db as never);

    const patchRoute = (router as unknown as { stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/:id' && s.route.methods['patch']);
    const handler = patchRoute!.route.stack[0]!.handle;

    const req = { params: { id: 'nonexistent' }, body: { status: 'success' }, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @vantage/api test -- --reporter=verbose src/__tests__/deployments.test.ts
```

Expected: FAIL — `Cannot find module '../routes/deployments'`

- [ ] **Step 3: Create `apps/api/src/routes/deployments.ts`**

```typescript
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { ApiKeyRequest } from '../middleware/api-key-auth';

export const createDeploymentSchema = z.object({
  name: z.string().optional(),
  environment: z.string().optional(),
  status: z.enum(['pending', 'running', 'success', 'failed', 'cancelled']),
  source: z.enum(['webhook', 'agent', 'manual']),
  server_id: z.string().uuid().optional(),
  started_at: z.string().datetime().optional(),
  git_commit: z.string().max(40).optional(),
  git_branch: z.string().max(255).optional(),
  git_tag: z.string().max(255).optional(),
  git_message: z.string().optional(),
  git_author: z.string().max(255).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const updateDeploymentSchema = z.object({
  status: z.enum(['pending', 'running', 'success', 'failed', 'cancelled']).optional(),
  finished_at: z.string().datetime().optional(),
});

function getWorkspaceId(req: object): string {
  const r = req as AuthenticatedRequest & ApiKeyRequest;
  return r.workspace.id;
}

export function createDeploymentsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/deployments — list with filters
  router.get('/', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const q = req.query as Record<string, string | undefined>;
      const limit = Math.min(Number(q['limit'] ?? 50), 200);

      let query = db
        .selectFrom('deployments')
        .where('workspace_id', '=', workspaceId)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit);

      if (q['name'])        query = query.where('name', '=', q['name']);
      if (q['environment']) query = query.where('environment', '=', q['environment']);
      if (q['server_id'])   query = query.where('server_id', '=', q['server_id']);
      if (q['source'])      query = query.where('source', '=', q['source'] as 'webhook' | 'agent' | 'manual');
      if (q['from'])        query = query.where('started_at', '>=', new Date(q['from']).toISOString() as unknown as Date);
      if (q['to'])          query = query.where('started_at', '<=', new Date(q['to']).toISOString() as unknown as Date);
      if (q['status']) {
        const statuses = q['status'].split(',') as Array<'pending' | 'running' | 'success' | 'failed' | 'cancelled'>;
        query = query.where('status', 'in', statuses);
      }

      const deployments = await query.execute();
      res.json({ data: deployments, total: deployments.length, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/deployments/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const deployment = await db
        .selectFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .selectAll()
        .executeTakeFirst();

      if (!deployment) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
        return;
      }
      res.json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/deployments
  router.post('/', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const body = createDeploymentSchema.parse(req.body);

      const deployment = await db
        .insertInto('deployments')
        .values({
          workspace_id: workspaceId,
          server_id: body.server_id ?? null,
          name: body.name ?? null,
          environment: body.environment ?? null,
          status: body.status,
          source: body.source,
          started_at: body.started_at ? new Date(body.started_at) : new Date(),
          git_commit: body.git_commit ?? null,
          git_branch: body.git_branch ?? null,
          git_tag: body.git_tag ?? null,
          git_message: body.git_message ?? null,
          git_author: body.git_author ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /api/deployments/:id — update status + compute duration
  router.patch('/:id', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const body = updateDeploymentSchema.parse(req.body);

      const existing = await db
        .selectFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .select(['id', 'started_at'])
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
        return;
      }

      const update: Record<string, unknown> = {};
      if (body.status) update['status'] = body.status;
      if (body.finished_at) {
        const finished = new Date(body.finished_at);
        const started = new Date(existing.started_at);
        update['finished_at'] = finished;
        update['duration_s'] = Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000));
      }

      if (Object.keys(update).length === 0) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } });
        return;
      }

      const deployment = await db
        .updateTable('deployments')
        .set(update)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .returningAll()
        .executeTakeFirst();

      res.json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/deployments/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const deleted = await db
        .deleteFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .returningAll()
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
        return;
      }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter @vantage/api test -- --reporter=verbose src/__tests__/deployments.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Register router in `apps/api/src/index.ts`**

Find the imports block near the top (around where `createServersRouter` is imported). Add:

```typescript
import { createDeploymentsRouter } from './routes/deployments';
```

Find the "Infra routes" section:
```typescript
app.use('/api/servers', requireAuth, createServersRouter(db));
```

Add after the infra routes block:
```typescript
app.use('/api/deployments', requireAuth, createDeploymentsRouter(db));
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
pnpm --filter @vantage/api lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/deployments.ts apps/api/src/__tests__/deployments.test.ts apps/api/src/index.ts
git commit -m "feat(api): add deployments router with GET/POST/PATCH/DELETE"
```

---

## Task 4: Agent Deployment Endpoint

**Files:**
- Modify: `apps/api/src/routes/agent.ts`

- [ ] **Step 1: Write a failing test for the agent endpoint**

Add to `apps/api/src/__tests__/deployments.test.ts`:

```typescript
describe('POST /api/agent/deployment', () => {
  it('creates a deployment with source=agent and auto-attaches server_id', async () => {
    const created = { id: 'd3', workspace_id: 'ws1', server_id: 'srv1', status: 'success', source: 'agent', created_at: new Date() };
    const db = buildMockDb([], created);
    const { createAgentDeploymentHandler } = await import('../routes/agent');

    const req = {
      body: { status: 'success', name: 'api' },
      server: { id: 'srv1', workspace_id: 'ws1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await createAgentDeploymentHandler(db as never)(req as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm --filter @vantage/api test -- --reporter=verbose src/__tests__/deployments.test.ts
```

Expected: FAIL — `createAgentDeploymentHandler is not exported`

- [ ] **Step 3: Add the endpoint to `apps/api/src/routes/agent.ts`**

At the top of the file, add the import for the schema (after existing imports):

```typescript
import { createDeploymentSchema } from './deployments';
```

Before `return router;` at the end of `createAgentRouter`, add:

```typescript
  // POST /agent/deployment — agent reports a deployment event
  router.post('/deployment', requireAgentToken, async (req, res, next) => {
    try {
      const { server } = req as unknown as AgentRequest;
      const body = createDeploymentSchema.omit({ source: true, server_id: true }).parse(req.body);

      const deployment = await db
        .insertInto('deployments')
        .values({
          workspace_id: server.workspace_id,
          server_id: server.id,
          name: body.name ?? null,
          environment: body.environment ?? null,
          status: body.status,
          source: 'agent',
          started_at: body.started_at ? new Date(body.started_at) : new Date(),
          git_commit: body.git_commit ?? null,
          git_branch: body.git_branch ?? null,
          git_tag: body.git_tag ?? null,
          git_message: body.git_message ?? null,
          git_author: body.git_author ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });
```

Also export a named handler for testing. Add this **before** `createAgentRouter`:

```typescript
export function createAgentDeploymentHandler(db: Kysely<Database>) {
  return async (req: unknown, res: { status: (n: number) => { json: (d: unknown) => void }; json: (d: unknown) => void }, next: (e?: unknown) => void) => {
    try {
      const { server } = req as AgentRequest;
      const body = createDeploymentSchema.omit({ source: true, server_id: true }).parse((req as { body: unknown }).body);

      const deployment = await db
        .insertInto('deployments')
        .values({
          workspace_id: server.workspace_id,
          server_id: server.id,
          name: body.name ?? null,
          environment: body.environment ?? null,
          status: body.status,
          source: 'agent' as const,
          started_at: body.started_at ? new Date(body.started_at) : new Date(),
          git_commit: body.git_commit ?? null,
          git_branch: body.git_branch ?? null,
          git_tag: body.git_tag ?? null,
          git_message: body.git_message ?? null,
          git_author: body.git_author ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json({ data: deployment, error: null });
    } catch (err) { next(err); }
  };
}
```

> **Note:** The in-router `router.post('/deployment', requireAgentToken, ...)` handler and `createAgentDeploymentHandler` both contain the same logic — this is intentional duplication to keep the testable handler clean without circular middleware wiring. If this feels wrong, inline the body directly in the router handler and skip exporting it (tests can be structural instead).

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @vantage/api test -- --reporter=verbose src/__tests__/deployments.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/agent.ts apps/api/src/__tests__/deployments.test.ts
git commit -m "feat(api): add agent deployment endpoint POST /agent/deployment"
```

---

## Task 5: V1 Public Deployments Routes (API Key / CI)

**Files:**
- Modify: `apps/api/src/routes/v1/infra.ts`

- [ ] **Step 1: Add deployments to `apps/api/src/routes/v1/infra.ts`**

At the top, add imports:

```typescript
import { createDeploymentSchema, updateDeploymentSchema } from '../deployments';
```

At the end of `createV1InfraRouter`, before `return router;`, add:

```typescript
  // POST /v1/deployments — CI/webhook callers create a deployment
  router.post('/deployments', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createDeploymentSchema.parse(req.body);

      const deployment = await db
        .insertInto('deployments')
        .values({
          workspace_id: workspace.id,
          server_id: body.server_id ?? null,
          name: body.name ?? null,
          environment: body.environment ?? null,
          status: body.status,
          source: body.source,
          started_at: body.started_at ? new Date(body.started_at) : new Date(),
          git_commit: body.git_commit ?? null,
          git_branch: body.git_branch ?? null,
          git_tag: body.git_tag ?? null,
          git_message: body.git_message ?? null,
          git_author: body.git_author ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /v1/deployments/:id — CI updates deploy status on finish
  router.patch('/deployments/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = updateDeploymentSchema.parse(req.body);

      const existing = await db
        .selectFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'started_at'])
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
        return;
      }

      const update: Record<string, unknown> = {};
      if (body.status) update['status'] = body.status;
      if (body.finished_at) {
        const finished = new Date(body.finished_at);
        const started = new Date(existing.started_at);
        update['finished_at'] = finished;
        update['duration_s'] = Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000));
      }

      if (Object.keys(update).length === 0) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
        return;
      }

      const deployment = await db
        .updateTable('deployments')
        .set(update)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      res.json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 2: Verify types**

```bash
pnpm --filter @vantage/api lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/infra.ts
git commit -m "feat(api): add POST/PATCH /v1/deployments for CI webhook integration"
```

---

## Task 6: Stale Deployments Worker

**Files:**
- Create: `apps/api/src/workers/stale-deployments.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create `apps/api/src/workers/stale-deployments.ts`**

```typescript
// Marks 'running' deployments older than 24 h as 'cancelled'.
// Prevents zombie records from staying in the running state if CI never calls PATCH.
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from '../lib/logger';

const INTERVAL_MS = 60 * 60 * 1_000; // 1 hour
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1_000; // 24 hours

async function cleanStale(db: Kysely<Database>): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const result = await db
    .updateTable('deployments')
    .set({ status: 'cancelled' })
    .where('status', '=', 'running')
    .where('started_at', '<', cutoff as unknown as Date)
    .returningAll()
    .execute();

  if (result.length > 0) {
    logger.info({ count: result.length }, '[stale-deployments] cancelled stale running deployments');
  }
}

export function startStaleDeploymentsCleaner(db: Kysely<Database>): void {
  // Run immediately on startup, then every hour
  void cleanStale(db).catch(err => logger.error({ err }, '[stale-deployments] initial run failed'));
  setInterval(() => {
    void cleanStale(db).catch(err => logger.error({ err }, '[stale-deployments] run failed'));
  }, INTERVAL_MS);
  logger.info('stale-deployments cleaner started (1-h interval)');
}
```

- [ ] **Step 2: Register worker in `apps/api/src/index.ts`**

Add import near the other worker imports:

```typescript
import { startStaleDeploymentsCleaner } from './workers/stale-deployments';
```

Add call near the other worker starts (after `startWebsiteChecker(db);`):

```typescript
startStaleDeploymentsCleaner(db);
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @vantage/api lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/stale-deployments.ts apps/api/src/index.ts
git commit -m "feat(api): add stale-deployments worker — cancels running deploys after 24h"
```

---

## Task 7: Web API Client

**Files:**
- Create: `apps/web/lib/deployments.ts`

- [ ] **Step 1: Create `apps/web/lib/deployments.ts`**

```typescript
import { apiFetch } from './api';
import type { Deployment } from '@vantage/types';

export interface ListDeploymentsParams {
  name?: string;
  environment?: string;
  status?: string;
  server_id?: string;
  source?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface CreateDeploymentBody {
  name?: string;
  environment?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  source: 'webhook' | 'agent' | 'manual';
  server_id?: string;
  started_at?: string;
  git_commit?: string;
  git_branch?: string;
  git_tag?: string;
  git_message?: string;
  git_author?: string;
  meta?: Record<string, unknown>;
}

export async function listDeployments(token: string, params: ListDeploymentsParams = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<{ data: Deployment[]; total: number; error: null }>(`/api/deployments${query}`, { token });
}

export async function createDeployment(token: string, body: CreateDeploymentBody) {
  return apiFetch<{ data: Deployment; error: null }>('/api/deployments', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function patchDeployment(token: string, id: string, body: { status?: string; finished_at?: string }) {
  return apiFetch<{ data: Deployment; error: null }>(`/api/deployments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteDeployment(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/deployments/${id}`, {
    method: 'DELETE',
    token,
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @vantage/web lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/deployments.ts
git commit -m "feat(web): add deployments API client lib"
```

---

## Task 8: Deployments Dashboard Page + Sidebar

**Files:**
- Create: `apps/web/app/(dashboard)/deployments/page.tsx`
- Modify: `apps/web/components/Sidebar.tsx`

- [ ] **Step 1: Add Deployments to Sidebar**

In `apps/web/components/Sidebar.tsx`, find the `NAV_GROUPS` array and the `Infrastructure` group:

```typescript
{
  label: 'Infrastructure',
  feature: 'infra' as const,
  items: [
    { href: '/servers',   label: 'Servers',   icon: 'servers'   },
    { href: '/databases', label: 'Databases', icon: 'databases' },
    { href: '/websites',  label: 'Websites',  icon: 'websites'  },
    { href: '/files',     label: 'Files',     icon: 'files',    featureKey: 'files' as const },
  ],
},
```

Add the Deployments entry after Websites (before Files):

```typescript
    { href: '/deployments', label: 'Deployments', icon: 'deployments' },
```

> **Note:** If `'deployments'` is not a registered icon in the `Icon` component, check `apps/web/components/ui/Icon.tsx` and either add a deployments SVG or substitute a similar existing icon (e.g. `'activity'`).

- [ ] **Step 2: Create deployments page**

Create the directory first:

```bash
mkdir "D:/Projects/Vantage/apps/web/app/(dashboard)/deployments"
```

Create `apps/web/app/(dashboard)/deployments/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { listDeployments, createDeployment, deleteDeployment } from '@/lib/deployments';
import type { Deployment } from '@vantage/types';
import type { CreateDeploymentBody } from '@/lib/deployments';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(s: number | null): string {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

type StatusColor = 'green' | 'red' | 'blue' | 'amber' | 'gray';
const STATUS_COLOR: Record<string, StatusColor> = {
  success: 'green',
  failed: 'red',
  running: 'blue',
  pending: 'amber',
  cancelled: 'gray',
};

const EMPTY_FORM: CreateDeploymentBody = {
  status: 'success',
  source: 'manual',
  name: '',
  environment: '',
  git_branch: '',
  git_commit: '',
};

const SETUP_CURL = `curl -X POST https://your-vantage-url/v1/deployments \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "api",
    "environment": "production",
    "status": "success",
    "git_branch": "main",
    "git_commit": "abc1234",
    "source": "webhook"
  }'`;

const SETUP_GHA = `- name: Notify Vantage
  if: always()
  env:
    VANTAGE_STATUS: \${{ job.status == 'success' && 'success' || 'failed' }}
  run: |
    curl -X POST https://your-vantage-url/v1/deployments \\
      -H "Authorization: Bearer \${{ secrets.VANTAGE_API_KEY }}" \\
      -H "Content-Type: application/json" \\
      -d "{\\"name\\":\\"${{ github.repository }}\\",\\"environment\\":\\"production\\",\\"status\\":\\"$VANTAGE_STATUS\\",\\"git_branch\\":\\"${{ github.ref_name }}\\",\\"git_commit\\":\\"${{ github.sha }}\\",\\"source\\":\\"webhook\\"}"`;

// ── Components ────────────────────────────────────────────────────────────────

function DeploymentDetail({ dep, onClose }: { dep: Deployment; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      zIndex: 50, overflowY: 'auto', padding: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
          {dep.name ?? 'Deployment'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)' }}>×</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row label="Status"><Badge color={STATUS_COLOR[dep.status] ?? 'gray'}>{dep.status}</Badge></Row>
        <Row label="Source"><Badge color="gray">{dep.source}</Badge></Row>
        {dep.environment && <Row label="Environment">{dep.environment}</Row>}
        {dep.git_branch && <Row label="Branch">{dep.git_branch}</Row>}
        {dep.git_commit && <Row label="Commit"><code style={{ fontSize: 12 }}>{dep.git_commit.slice(0, 12)}</code></Row>}
        {dep.git_tag && <Row label="Tag">{dep.git_tag}</Row>}
        {dep.git_author && <Row label="Author">{dep.git_author}</Row>}
        {dep.git_message && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Commit message</div>
            <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>{dep.git_message}</div>
          </div>
        )}
        <Row label="Duration">{formatDuration(dep.duration_s)}</Row>
        <Row label="Started">{new Date(dep.started_at).toLocaleString()}</Row>
        {dep.finished_at && <Row label="Finished">{new Date(dep.finished_at).toLocaleString()}</Row>}
        {dep.meta && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Meta</div>
            <details>
              <summary style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>Show raw JSON</summary>
              <pre style={{ fontSize: 11, background: 'var(--bg)', padding: 8, borderRadius: 6, marginTop: 4, overflow: 'auto', border: '1px solid var(--border)' }}>
                {JSON.stringify(dep.meta, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 12, color: 'var(--text3)', width: 90, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

function SetupSnippets() {
  const [tab, setTab] = useState<'curl' | 'gha'>('curl');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 640 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
        Log your first deployment
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Send deploys from CI, your terminal, or the monitoring agent.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['curl', 'gha'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--text)' : 'var(--bg)',
            color: tab === t ? '#fff' : 'var(--text2)',
            fontFamily: 'inherit', fontSize: 12,
          }}>
            {t === 'curl' ? 'curl' : 'GitHub Actions'}
          </button>
        ))}
      </div>
      <pre style={{
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 14, fontSize: 11,
        overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>
        {tab === 'curl' ? SETUP_CURL : SETUP_GHA}
      </pre>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeploymentsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();

  // Filters
  const [filterName, setFilterName] = useState('');
  const [filterEnv, setFilterEnv] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // UI state
  const [selected, setSelected] = useState<Deployment | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateDeploymentBody>(EMPTY_FORM);
  const [showGit, setShowGit] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['deployments', filterName, filterEnv, filterStatus],
    queryFn: async () => listDeployments(await getToken(), {
      name: filterName || undefined,
      environment: filterEnv || undefined,
      status: filterStatus || undefined,
    }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async () => createDeployment(await getToken(), {
      ...form,
      name: form.name || undefined,
      environment: form.environment || undefined,
      git_branch: form.git_branch || undefined,
      git_commit: form.git_commit || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployments'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteDeployment(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }),
  });

  const deployments = data?.data ?? [];
  const isEmpty = !isLoading && deployments.length === 0 && !filterName && !filterEnv && !filterStatus;

  return (
    <>
      <Topbar />
      <div style={{ padding: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, margin: 0 }}>Deployments</h1>
          <Button onClick={() => setShowModal(true)}>Log Deploy</Button>
        </div>

        {/* Filters */}
        {!isEmpty && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <Input
              placeholder="Filter by name…"
              value={filterName}
              onChange={e => setFilterName(e.target.value)}
              style={{ width: 180 }}
            />
            <Input
              placeholder="Filter by environment…"
              value={filterEnv}
              onChange={e => setFilterEnv(e.target.value)}
              style={{ width: 180 }}
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
              }}
            >
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        )}

        {/* Content */}
        {isEmpty ? (
          <SetupSnippets />
        ) : isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        ) : deployments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No deployments match filters.</div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 120px 160px 100px 80px 100px',
              padding: '8px 16px', borderBottom: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span>Status</span><span>Name</span><span>Environment</span><span>Git</span><span>Duration</span><span>Source</span><span>Time</span>
            </div>
            {/* Rows */}
            {deployments.map((dep, i) => (
              <DeploymentRow
                key={dep.id}
                dep={dep}
                last={i === deployments.length - 1}
                onClick={() => setSelected(dep)}
                onDelete={() => deleteMut.mutate(dep.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail slide-over */}
      {selected && <DeploymentDetail dep={selected} onClose={() => setSelected(null)} />}

      {/* Log Deploy modal */}
      {showModal && (
        <Modal title="Log Deploy" onClose={() => { setShowModal(false); setForm(EMPTY_FORM); }}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Name">
              <Input placeholder="api, web, monolith…" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="Environment">
              <Input placeholder="production, staging…" value={form.environment ?? ''} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))} />
            </FormField>
            <FormField label="Status *">
              <select
                required
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as CreateDeploymentBody['status'] }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
              >
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FormField>

            <button
              type="button"
              onClick={() => setShowGit(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 13, padding: '4px 0', marginBottom: 8 }}
            >
              {showGit ? '▾' : '▸'} Git info (optional)
            </button>
            {showGit && (
              <>
                <FormField label="Branch">
                  <Input placeholder="main" value={form.git_branch ?? ''} onChange={e => setForm(f => ({ ...f, git_branch: e.target.value }))} />
                </FormField>
                <FormField label="Commit SHA">
                  <Input placeholder="abc1234" value={form.git_commit ?? ''} onChange={e => setForm(f => ({ ...f, git_commit: e.target.value }))} />
                </FormField>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Button type="button" variant="secondary" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Logging…' : 'Log Deploy'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function DeploymentRow({ dep, last, onClick, onDelete }: {
  dep: Deployment;
  last: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const gitText = [dep.git_branch, dep.git_commit ? dep.git_commit.slice(0, 7) : null].filter(Boolean).join(' · ') || '—';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 120px 160px 100px 80px 100px',
        padding: '10px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
        background: hover ? 'var(--surface2)' : 'transparent',
        alignItems: 'center',
        fontSize: 13,
      }}
    >
      <span><Badge color={STATUS_COLOR[dep.status] ?? 'gray'}>{dep.status}</Badge></span>
      <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {dep.name ?? <span style={{ color: 'var(--text3)' }}>unnamed</span>}
      </span>
      <span style={{ color: 'var(--text2)' }}>{dep.environment ?? '—'}</span>
      <span style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gitText}</span>
      <span style={{ color: 'var(--text2)' }}>{formatDuration(dep.duration_s)}</span>
      <span style={{ color: 'var(--text3)', fontSize: 11 }}>{dep.source}</span>
      <span style={{ color: 'var(--text3)' }}>{timeAgo(dep.created_at)}</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @vantage/web lint
```

Expected: no errors. If `Button` doesn't accept `variant="secondary"`, check `apps/web/components/ui/Button.tsx` for the correct prop name and update accordingly.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/deployments/page.tsx apps/web/components/Sidebar.tsx
git commit -m "feat(web): add Deployments page and sidebar nav entry"
```

---

## Task 9: Final Integration Test

- [ ] **Step 1: Run all API tests**

```bash
pnpm --filter @vantage/api test
```

Expected: all existing tests pass + new deployment tests pass. No regressions.

- [ ] **Step 2: Start dev server and verify manually**

```bash
pnpm dev
```

1. Navigate to `/deployments` → empty state shows setup snippets
2. Click "Log Deploy" → modal opens with name/environment/status/git fields
3. Submit a manual deploy → row appears in table
4. Click row → slide-over opens with detail
5. Filter by name → table updates
6. Sidebar shows "Deployments" under Infrastructure

- [ ] **Step 3: Test v1 API key endpoint manually**

```bash
# Replace TOKEN with a real API key from Settings → API Keys
curl -X POST http://localhost:4000/v1/deployments \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"api","environment":"production","status":"success","source":"webhook","git_branch":"main","git_commit":"abc1234"}'
```

Expected: `{"data":{"id":"...","status":"success",...},"error":null}`

- [ ] **Step 4: Final commit + merge**

```bash
git add -A
git status  # confirm nothing unexpected
git commit -m "chore: deployment tracking complete — final cleanup"
```

---

## Self-Review Checklist

- [x] **Spec section: Data model** → Task 1 (migration) + Task 2 (schema)
- [x] **Spec section: API routes GET/POST/PATCH/DELETE** → Task 3 (internal router)
- [x] **Spec section: Agent endpoint** → Task 4 (agent route)
- [x] **Spec section: V1 / CI webhook** → Task 5 (v1/infra.ts)
- [x] **Spec section: Stale running records → cancelled** → Task 6 (worker)
- [x] **Spec section: UI page + sidebar** → Task 7 (web lib) + Task 8 (page + sidebar)
- [x] **Spec section: duration_s computed server-side** → done in PATCH handlers (both Task 3 and Task 5)
- [x] **Spec section: server_id auto-attached for agent** → Task 4 uses `server.id` from AgentRequest
- [x] **Spec: empty state shows setup snippets** → `SetupSnippets` component in Task 8
- [x] **Spec: Git info collapsible in Log Deploy modal** → `showGit` toggle in Task 8
- [x] **No placeholder code anywhere** → all code is complete and real
- [x] **Type names consistent**: `DeploymentTable`, `Deployment`, `DeploymentStatus`, `DeploymentSource` used identically across tasks
- [x] **Schema key**: `deployments: DeploymentTable` in `Database` interface matches `db.selectFrom('deployments')` calls
