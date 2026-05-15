# Fixes Plan A — Quick Backend Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four server-side bugs: tasks pagination + type safety, bulk CSV import for contacts and deals, and v1 infra pagination.

**Architecture:** All fixes are isolated to existing route files. No new files. No migrations. No schema changes.

**Tech Stack:** Node.js + Express + Kysely + Zod + Vitest. pnpm workspace. Worktree at `D:/Projects/Vantage/.worktrees/fixes` on branch `feat/fixes-and-features`.

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/routes/tasks.ts` | Add `listQuerySchema`, `.limit()/.offset()`, fix `status as never`, pagination envelope |
| `apps/api/src/routes/contacts.ts` | Replace serial import loop with bulk Kysely insert |
| `apps/api/src/routes/deals.ts` | Replace serial import loop with bulk Kysely insert |
| `apps/api/src/routes/v1/infra.ts` | Add pagination to GET /servers and GET /websites |
| `apps/api/src/__tests__/tasks-list.test.ts` | New — unit tests for paginated task list |

---

## Task 1: Fix tasks route — pagination + type safety

**Files:**
- Modify: `apps/api/src/routes/tasks.ts`
- Create: `apps/api/src/__tests__/tasks-list.test.ts`

Current problems in `apps/api/src/routes/tasks.ts` GET `/`:
1. `status as never` — unsafe cast bypasses type system
2. No `.limit()` / `.offset()` — returns every task in the workspace
3. Response is `{ data: tasks, error: null }` — no pagination envelope
4. `assignee_id` defaults to `user.id` with no Zod validation

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/tasks-list.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

function buildMockDb(tasks: object[], count: number) {
  const chain: Record<string, unknown> = {};
  const fns = ['selectFrom','where','selectAll','orderBy','limit','offset','select','execute','executeTakeFirstOrThrow'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(tasks);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count });
  return { selectFrom: vi.fn().mockReturnValue(chain) };
}

function buildReq(query: Record<string, string> = {}, userId = 'u1') {
  return {
    query,
    workspace: { id: 'ws1' },
    user: { id: userId },
  };
}

function buildRes() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }) };
}

describe('GET /api/tasks — pagination', () => {
  it('applies default limit 25 and offset 0', async () => {
    const fakeTasks = [{ id: 't1', title: 'Task 1' }];
    const db = buildMockDb(fakeTasks, 1);

    const { createTasksRouter } = await import('../routes/tasks');
    const router = createTasksRouter(db as never);

    // Extract the GET / handler (first route registered)
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] }; handle?: Function }[] }).stack[0]?.route?.stack[0]?.handle;
    expect(handler).toBeDefined();

    const req = buildReq();
    const res = buildRes();
    const next = vi.fn();

    await handler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: fakeTasks,
        page: 1,
        per_page: 25,
        error: null,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('filters by status without type cast', async () => {
    const db = buildMockDb([], 0);
    const { createTasksRouter } = await import('../routes/tasks');
    const router = createTasksRouter(db as never);
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack[0]!.route.stack[0]!.handle;

    const req = buildReq({ status: 'done' });
    const res = buildRes();
    await handler(req, res, vi.fn());

    // If status is invalid, Zod rejects it — handler should return 400
    const req2 = buildReq({ status: 'invalid_status' });
    const res2 = buildRes();
    await handler(req2, res2, vi.fn());
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for non-numeric page', async () => {
    const db = buildMockDb([], 0);
    const { createTasksRouter } = await import('../routes/tasks');
    const router = createTasksRouter(db as never);
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack[0]!.route.stack[0]!.handle;

    const req = buildReq({ page: 'abc' });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — tests fail because current route has no pagination envelope or Zod validation.

- [ ] **Step 3: Rewrite the GET / handler in tasks.ts**

Replace the entire `apps/api/src/routes/tasks.ts` with:

```typescript
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  due_date: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  due_date: z.string().optional(),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
});

export function createTasksRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, assignee_id } = parsed.data;
      const effectiveAssignee = assignee_id ?? user.id;

      let query = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('due_date', 'asc')
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (status) query = query.where('status', '=', status);
      if (effectiveAssignee) query = query.where('assignee_id', '=', effectiveAssignee);

      const tasks = await query.execute();

      let countQuery = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (effectiveAssignee) countQuery = countQuery.where('assignee_id', '=', effectiveAssignee);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: tasks, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createTaskSchema.parse(req.body);

      const task = await db
        .insertInto('tasks')
        .values({
          workspace_id: workspace.id,
          assignee_id: body.assignee_id ?? user.id,
          title: body.title,
          due_date: body.due_date ? new Date(body.due_date) : null,
          contact_id: body.contact_id ?? null,
          deal_id: body.deal_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateTaskSchema.parse(req.body);

      const task = await db
        .updateTable('tasks')
        .set({ ...body, updated_at: new Date(), due_date: body.due_date ? new Date(body.due_date) : undefined })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/tasks.ts apps/api/src/__tests__/tasks-list.test.ts && git commit -m "fix(tasks): add pagination, Zod validation, and typed status filter"
```

---

## Task 2: Fix contacts bulk import

**Files:**
- Modify: `apps/api/src/routes/contacts.ts` — replace serial import loop

Current code in `POST /import` (lines 65–77):
```typescript
for (const row of rows) {
  try {
    await db.insertInto('contacts').values({...}).execute(); // N round trips
    created++;
  } catch (e) { errors.push(`${row.email}: ${...}`); }
}
```

New approach: validate all rows first, bulk-insert valid rows, report validation failures.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/contacts-import.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

function buildMockDb(insertedRows: object[] = []) {
  const insertChain: Record<string, unknown> = {};
  for (const f of ['insertInto','values','execute','returningAll']) {
    insertChain[f] = vi.fn().mockReturnValue(insertChain);
  }
  insertChain['execute'] = vi.fn().mockResolvedValue(insertedRows);

  const updateChain: Record<string, unknown> = {};
  for (const f of ['updateTable','set','where','execute']) {
    updateChain[f] = vi.fn().mockReturnValue(updateChain);
  }
  updateChain['execute'] = vi.fn().mockResolvedValue(undefined);

  const db: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue([]) }) }) }) }) }),
    insertInto: vi.fn().mockReturnValue(insertChain),
    updateTable: vi.fn().mockReturnValue(updateChain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
  return db;
}

describe('POST /api/contacts/import — bulk insert', () => {
  it('calls insertInto once (not per row) for valid rows', async () => {
    const rows = [
      { name: 'Alice', email: 'alice@example.com', status: 'prospect' },
      { name: 'Bob', email: 'bob@example.com', status: 'customer' },
    ];
    const db = buildMockDb([{ id: '1' }, { id: '2' }]);

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never);

    // Find the import route handler
    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route.path === '/import');
    expect(importRoute).toBeDefined();

    const handler = importRoute!.route.stack[0]!.handle;
    const req = {
      body: { rows },
      workspace: { id: 'ws1' },
      user: { id: 'u1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    // insertInto called once, not twice
    expect(db.insertInto).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errors: [] }) }),
    );
  });

  it('reports validation errors without hitting DB', async () => {
    const rows = [
      { name: 'Alice', email: 'not-an-email', status: 'prospect' },
    ];
    const db = buildMockDb([]);

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never);
    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route.path === '/import');
    const handler = importRoute!.route.stack[0]!.handle;
    const req = { body: { rows }, workspace: { id: 'ws1' }, user: { id: 'u1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db.insertInto).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ created: 0, errors: expect.arrayContaining([expect.stringContaining('not-an-email')]) }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/Vantage && pnpm --filter api test contacts-import --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — current code calls `insertInto` once per row.

- [ ] **Step 3: Replace the import handler in contacts.ts**

Find the `POST /import` route handler in `apps/api/src/routes/contacts.ts` and replace the body:

```typescript
// POST /import — bulk create from parsed CSV rows
router.post('/import', async (req, res, next) => {
  try {
    const { workspace, user } = req as unknown as AuthenticatedRequest;

    // Validate the outer shape (array exists)
    const outerParsed = z.object({ rows: z.array(z.unknown()).min(1) }).safeParse(req.body);
    if (!outerParsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: outerParsed.error.message } });
      return;
    }

    // Per-row schema (same as importContactSchema rows element)
    const rowSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      status: z.enum(['prospect', 'customer', 'cold', 'churned']).default('prospect'),
    });

    const validRows: Array<{ name: string; email: string; phone?: string; status: 'prospect' | 'customer' | 'cold' | 'churned' }> = [];
    const errors: string[] = [];

    for (const raw of outerParsed.data.rows) {
      const parsed = rowSchema.safeParse(raw);
      if (parsed.success) {
        validRows.push(parsed.data);
      } else {
        const email = (raw as { email?: string }).email ?? '(unknown)';
        errors.push(`${email}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      }
    }

    let created = 0;
    if (validRows.length > 0) {
      const inserted = await db
        .insertInto('contacts')
        .values(validRows.map(row => ({
          ...row,
          phone: row.phone ?? null,
          workspace_id: workspace.id,
          owner_id: user.id,
        })))
        .execute();
      created = inserted.numInsertedOrUpdatedRows ? Number(inserted.numInsertedOrUpdatedRows) : validRows.length;

      if (created > 0) {
        await db.updateTable('workspaces')
          .set({ contact_count: sql`contact_count + ${created}` })
          .where('id', '=', workspace.id).execute();
      }
    }

    res.json({ data: { created, errors }, error: null });
  } catch (err) { next(err); }
});
```

Note: `sql` is already imported in `contacts.ts` (`import { sql } from 'kysely';`).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/Vantage && pnpm --filter api test contacts-import --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/contacts.ts apps/api/src/__tests__/contacts-import.test.ts && git commit -m "fix(contacts): bulk import in single DB round-trip, validate rows first"
```

---

## Task 3: Fix deals bulk import

**Files:**
- Modify: `apps/api/src/routes/deals.ts` — replace serial import loop

The deals import is in `POST /import` (lines 100–136). Same pattern as contacts.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/deals-import.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

function buildMockDb() {
  const insertChain: Record<string, unknown> = {};
  for (const f of ['insertInto','values','execute']) {
    insertChain[f] = vi.fn().mockReturnValue(insertChain);
  }
  insertChain['execute'] = vi.fn().mockResolvedValue({ numInsertedOrUpdatedRows: BigInt(2) });

  const selectChain: Record<string, unknown> = {};
  for (const f of ['selectFrom','where','select','executeTakeFirst']) {
    selectChain[f] = vi.fn().mockReturnValue(selectChain);
  }
  // Pipeline exists
  selectChain['executeTakeFirst'] = vi.fn().mockResolvedValue({ id: 'pl1' });

  const updateChain: Record<string, unknown> = {};
  for (const f of ['updateTable','set','where','execute']) {
    updateChain[f] = vi.fn().mockReturnValue(updateChain);
  }
  updateChain['execute'] = vi.fn().mockResolvedValue(undefined);

  return {
    insertInto: vi.fn().mockReturnValue(insertChain),
    selectFrom: vi.fn().mockReturnValue(selectChain),
    updateTable: vi.fn().mockReturnValue(updateChain),
  };
}

describe('POST /api/deals/import — bulk insert', () => {
  it('calls insertInto once for multiple valid rows', async () => {
    const db = buildMockDb();
    const { createDealsRouter } = await import('../routes/deals');
    const router = createDealsRouter(db as never);

    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route.path === '/import');
    expect(importRoute).toBeDefined();

    const handler = importRoute!.route.stack[0]!.handle;
    const req = {
      body: {
        pipeline_id: 'pl1',
        stage_id: 'st1',
        rows: [
          { name: 'Deal A', value: 1000, probability: 50 },
          { name: 'Deal B', value: 2000, probability: 75 },
        ],
      },
      workspace: { id: 'ws1' },
      user: { id: 'u1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db.insertInto).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errors: [] }) }),
    );
  });

  it('reports validation errors without DB call', async () => {
    const db = buildMockDb();
    const { createDealsRouter } = await import('../routes/deals');
    const router = createDealsRouter(db as never);
    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route.path === '/import');
    const handler = importRoute!.route.stack[0]!.handle;
    const req = {
      body: {
        pipeline_id: 'pl1',
        stage_id: 'st1',
        rows: [{ name: '', value: -1 }], // invalid: empty name, negative value
      },
      workspace: { id: 'ws1' },
      user: { id: 'u1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db.insertInto).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ created: 0, errors: expect.arrayContaining([expect.any(String)]) }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/Vantage && pnpm --filter api test deals-import --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL.

- [ ] **Step 3: Replace the import handler in deals.ts**

Find the `POST /import` route handler in `apps/api/src/routes/deals.ts` and replace:

```typescript
// POST /import
router.post('/import', async (req, res, next) => {
  try {
    const { workspace, user } = req as unknown as AuthenticatedRequest;

    const outerParsed = z.object({
      pipeline_id: z.string().uuid(),
      stage_id: z.string().uuid(),
      rows: z.array(z.unknown()).min(1),
    }).safeParse(req.body);

    if (!outerParsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: outerParsed.error.message } });
      return;
    }

    const { pipeline_id, stage_id } = outerParsed.data;

    // Verify pipeline belongs to workspace
    const pipeline = await db.selectFrom('pipelines')
      .where('id', '=', pipeline_id).where('workspace_id', '=', workspace.id)
      .select('id').executeTakeFirst();
    if (!pipeline) {
      res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
      return;
    }

    const rowSchema = z.object({
      name: z.string().min(1),
      value: z.coerce.number().min(0).default(0),
      probability: z.coerce.number().int().min(0).max(100).default(0),
      close_date: z.string().optional(),
    });

    const validRows: Array<{ name: string; value: number; probability: number; close_date?: string }> = [];
    const errors: string[] = [];

    for (const raw of outerParsed.data.rows) {
      const parsed = rowSchema.safeParse(raw);
      if (parsed.success) {
        validRows.push(parsed.data);
      } else {
        const name = (raw as { name?: string }).name ?? '(unknown)';
        errors.push(`${name}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      }
    }

    let created = 0;
    if (validRows.length > 0) {
      const result = await db.insertInto('deals').values(
        validRows.map(row => ({
          workspace_id: workspace.id,
          owner_id: user.id,
          pipeline_id,
          stage_id,
          name: row.name,
          value: row.value,
          probability: row.probability,
          close_date: row.close_date ? new Date(row.close_date) : null,
          contact_id: null,
          company_id: null,
        })),
      ).execute();
      created = result.numInsertedOrUpdatedRows ? Number(result.numInsertedOrUpdatedRows) : validRows.length;
    }

    res.json({ data: { created, errors }, error: null });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/Vantage && pnpm --filter api test deals-import --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/deals.ts apps/api/src/__tests__/deals-import.test.ts && git commit -m "fix(deals): bulk import in single DB round-trip, validate rows first"
```

---

## Task 4: Fix v1 infra pagination

**Files:**
- Modify: `apps/api/src/routes/v1/infra.ts`

Currently `GET /v1/servers` and `GET /v1/websites` return all rows with no limit. Fix: add `page`/`per_page` query params, count queries, and pagination envelopes.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/v1-infra-pagination.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

function buildMockDb(rows: object[], count: number) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom','where','selectAll','orderBy','limit','offset','select','execute','executeTakeFirstOrThrow']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count });
  return { selectFrom: vi.fn().mockReturnValue(chain) };
}

describe('GET /v1/servers — pagination', () => {
  it('returns pagination envelope', async () => {
    const servers = [{ id: 's1', name: 'prod' }];
    const db = buildMockDb(servers, 1);
    const { createV1InfraRouter } = await import('../../routes/v1/infra');
    const router = createV1InfraRouter(db as never);

    const serversRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/servers');
    const handler = serversRoute!.route.stack[0]!.handle;

    const req = { query: {}, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: servers, total: 1, page: 1, per_page: 25, error: null }),
    );
  });

  it('rejects per_page > 100', async () => {
    const db = buildMockDb([], 0);
    const { createV1InfraRouter } = await import('../../routes/v1/infra');
    const router = createV1InfraRouter(db as never);
    const serversRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/servers');
    const handler = serversRoute!.route.stack[0]!.handle;

    const req = { query: { per_page: '200' }, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /v1/websites — pagination', () => {
  it('returns pagination envelope', async () => {
    const websites = [{ id: 'w1', url: 'https://example.com' }];
    const db = buildMockDb(websites, 1);
    const { createV1InfraRouter } = await import('../../routes/v1/infra');
    const router = createV1InfraRouter(db as never);

    const websitesRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/websites');
    const handler = websitesRoute!.route.stack[0]!.handle;

    const req = { query: {}, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: websites, total: 1, page: 1, per_page: 25, error: null }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/Vantage && pnpm --filter api test v1-infra-pagination --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL.

- [ ] **Step 3: Rewrite GET /v1/servers and GET /v1/websites**

Replace `apps/api/src/routes/v1/infra.ts` with:

```typescript
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

const alertListSchema = z.object({
  resolved: z.coerce.boolean().optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

export function createV1InfraRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/servers
  router.get('/servers', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page } = parsed.data;

      const servers = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: servers, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/servers/:id
  router.get('/servers/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const server = await db
        .selectFrom('servers')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();

      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }
      res.json({ data: server, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/alerts
  router.get('/alerts', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = alertListSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { resolved, severity, page, per_page } = parsed.data;

      let query = db
        .selectFrom('alerts')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (resolved !== undefined) query = query.where('resolved', '=', resolved);
      if (severity) query = query.where('severity', '=', severity);

      const alerts = await query.execute();

      let countQuery = db
        .selectFrom('alerts')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (resolved !== undefined) countQuery = countQuery.where('resolved', '=', resolved);
      if (severity) countQuery = countQuery.where('severity', '=', severity);

      const { count } = await countQuery.executeTakeFirstOrThrow();
      res.json({ data: alerts, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/websites
  router.get('/websites', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page } = parsed.data;

      const websites = await db
        .selectFrom('websites')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await db
        .selectFrom('websites')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: websites, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/Vantage && pnpm --filter api test v1-infra-pagination --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/v1/infra.ts apps/api/src/__tests__/v1-infra-pagination.test.ts && git commit -m "fix(v1/infra): add pagination to GET /servers and GET /websites"
```
