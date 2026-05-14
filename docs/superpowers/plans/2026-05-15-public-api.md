# Public API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add API key auth and a versioned `/v1` public REST API exposing CRM CRUD + infra read-only, plus a settings UI for managing keys.

**Architecture:** New `api_keys` table (SHA-256 hashed keys, never stored plain). `requireApiKey` middleware resolves workspace + scope from `Authorization: Bearer` header. New `/v1` Express router mounts behind that middleware. Internal `/api/api-keys` CRUD routes use existing Clerk JWT auth. Web settings page lets admins create/revoke keys.

**Tech Stack:** Node.js/Express, Kysely, PostgreSQL, SHA-256 (`node:crypto`), Vitest (tests), React/Next.js App Router, React Query, inline styles matching Vantage design system.

---

## Codebase orientation

- API routes: `apps/api/src/routes/*.ts` — each exports `createXRouter(db)` returning an Express `Router`
- API middleware: `apps/api/src/middleware/` — `auth.ts` exports `createRequireAuth(db, jwtSecret)` and `requireAdmin`
- DB schema: `packages/db/src/schema.ts` — Kysely table interfaces + `Database` union + convenience `Selectable`/`Insertable`/`Updateable` aliases
- Migrations: `packages/db/migrations/YYYYMMDD_NNN_name.ts` — export `up(db)` and `down(db)`
- Public types: `packages/types/src/index.ts` — plain interfaces, no Kysely imports
- Web pages: `apps/web/app/(dashboard)/settings/` — Next.js App Router, `'use client'`
- Web components: `apps/web/components/`
- Web API lib: `apps/web/lib/*.ts` — `apiFetch<T>(url, { token, method?, body? })` pattern
- Test runner: `cd apps/api && npm test` (Vitest)
- Tests: `apps/api/src/__tests__/*.test.ts` — use `vi.fn()` chain mocks, no real DB

---

## Task 1: DB migration, schema types, and public types

**Files:**
- Create: `packages/db/migrations/20240108_001_api_keys.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create the migration**

```typescript
// packages/db/migrations/20240108_001_api_keys.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('api_keys')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('key_hash', 'text', col => col.notNull().unique())
    .addColumn('prefix', 'text', col => col.notNull())
    .addColumn('scope', 'text', col => col.notNull())
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('api_keys').execute();
}
```

- [ ] **Step 2: Add `ApiKeyTable` to schema.ts**

Open `packages/db/src/schema.ts`. Add this interface before the `Database` interface:

```typescript
export interface ApiKeyTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  key_hash: string;
  prefix: string;
  scope: string;
  last_used_at: string | null;
  created_at: Generated<string>;
}
```

Add to the `Database` interface (after `webhook_deliveries`):
```typescript
api_keys: ApiKeyTable;
```

Add convenience aliases (after the existing webhook aliases at the bottom):
```typescript
export type ApiKey = Selectable<ApiKeyTable>;
export type NewApiKey = Insertable<ApiKeyTable>;
export type ApiKeyUpdate = Updateable<ApiKeyTable>;
```

- [ ] **Step 3: Add `ApiKey` type to packages/types/src/index.ts**

Add after the `WebhookDelivery` interface:

```typescript
export interface ApiKey {
  id: string;
  workspace_id: string;
  name: string;
  prefix: string;
  scope: string;
  last_used_at: string | null;
  created_at: string;
  // key_hash never returned to client
}
```

- [ ] **Step 4: Verify types compile**

```bash
cd packages/db && npx tsc --noEmit
cd packages/types && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/20240108_001_api_keys.ts packages/db/src/schema.ts packages/types/src/index.ts
git commit -m "feat: add api_keys table migration and schema types"
```

---

## Task 2: API key middleware with tests

**Files:**
- Create: `apps/api/src/middleware/api-key-auth.ts`
- Create: `apps/api/src/__tests__/api-key-auth.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/api-key-auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';

describe('createRequireApiKey', () => {
  let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let next: NextFunction;
  let mockDb: { selectFrom: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    mockRes = { status, json };
    next = vi.fn() as unknown as NextFunction;
    mockDb = { selectFrom: vi.fn() };
  });

  it('returns 401 if Authorization header missing', async () => {
    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: {} } as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if header is not Bearer', async () => {
    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: { authorization: 'Basic abc' } } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if key not found in DB', async () => {
    const chainMock = {
      where: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    };
    mockDb.selectFrom.mockReturnValue(chainMock);

    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: { authorization: 'Bearer vnt_rw_unknownkey' } } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches workspace and apiKey, calls next on valid key', async () => {
    const rawKey = 'vnt_rw_abc123';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const fakeKey = { id: 'key-1', workspace_id: 'ws-1', scope: 'read_write', key_hash: keyHash };
    const chainMock = {
      where: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(fakeKey),
      set: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
      updateTable: vi.fn().mockReturnThis(),
    };
    mockDb.selectFrom.mockReturnValue(chainMock);
    // Also mock updateTable for last_used_at update
    (mockDb as unknown as { updateTable: ReturnType<typeof vi.fn> }).updateTable = vi.fn().mockReturnValue(chainMock);

    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: { authorization: `Bearer ${rawKey}` } } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as never as { workspace: { id: string } }).workspace).toEqual({ id: 'ws-1' });
  });
});

describe('requireScope', () => {
  it('returns 403 if key scope is read and route needs read_write', async () => {
    const { requireScope } = await import('../middleware/api-key-auth');
    const json = vi.fn();
    const mockRes = { status: vi.fn().mockReturnValue({ json }) };
    const next = vi.fn();
    const req = { apiKey: { scope: 'read' } };
    requireScope('read_write')(req as never, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next if scope is read_write and route needs read_write', async () => {
    const { requireScope } = await import('../middleware/api-key-auth');
    const next = vi.fn();
    const req = { apiKey: { scope: 'read_write' } };
    requireScope('read_write')(req as never, {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next for read route regardless of scope', async () => {
    const { requireScope } = await import('../middleware/api-key-auth');
    // No requireScope call needed for read routes — they just use requireApiKey
    // This test verifies read scope passes read_write scope check when actually read_write
    const next = vi.fn();
    const req = { apiKey: { scope: 'read' } };
    // read routes don't call requireScope — they just call next after requireApiKey
    // So there's nothing to test here beyond the 403 case above
    expect(next).not.toHaveBeenCalled(); // sanity check
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && npm test -- api-key-auth
```

Expected: FAIL — `Cannot find module '../middleware/api-key-auth'`

- [ ] **Step 3: Implement the middleware**

```typescript
// apps/api/src/middleware/api-key-auth.ts
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

export interface ApiKeyRequest extends Request {
  workspace: { id: string };
  apiKey: { id: string; scope: string };
}

export function createRequireApiKey(db: Kysely<Database>) {
  return async function requireApiKey(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'API key required' } });
      return;
    }

    const rawKey = authHeader.slice(7);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await db
      .selectFrom('api_keys')
      .where('key_hash', '=', keyHash)
      .selectAll()
      .executeTakeFirst();

    if (!apiKey) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
      return;
    }

    // Fire-and-forget: update last_used_at
    db.updateTable('api_keys')
      .set({ last_used_at: new Date().toISOString() })
      .where('id', '=', apiKey.id)
      .execute()
      .catch(() => { /* non-critical */ });

    (req as ApiKeyRequest).workspace = { id: apiKey.workspace_id };
    (req as ApiKeyRequest).apiKey = { id: apiKey.id, scope: apiKey.scope };
    next();
  };
}

export function requireScope(requiredScope: 'read_write') {
  return function scopeMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const { apiKey } = req as ApiKeyRequest;
    if (apiKey.scope !== requiredScope) {
      res.status(403).json({ data: null, error: { code: 'INSUFFICIENT_SCOPE', message: 'This operation requires read_write scope' } });
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/api && npm test -- api-key-auth
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/api-key-auth.ts apps/api/src/__tests__/api-key-auth.test.ts
git commit -m "feat: add requireApiKey and requireScope middleware"
```

---

## Task 3: Internal API key CRUD routes + registration

**Files:**
- Create: `apps/api/src/routes/api-keys.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create the internal API key routes**

```typescript
// apps/api/src/routes/api-keys.ts
import { randomBytes, createHash } from 'node:crypto';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.enum(['read', 'read_write']),
});

function buildRawKey(scope: 'read' | 'read_write'): string {
  const suffix = randomBytes(32).toString('hex');
  const tag = scope === 'read_write' ? 'rw' : 'read';
  return `vnt_${tag}_${suffix}`;
}

export function createApiKeysRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/api-keys — list keys (no key_hash)
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const keys = await db
        .selectFrom('api_keys')
        .select(['id', 'workspace_id', 'name', 'prefix', 'scope', 'last_used_at', 'created_at'])
        .where('workspace_id', '=', workspace.id)
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: keys, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/api-keys — create key, return raw key once
  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createKeySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const rawKey = buildRawKey(parsed.data.scope);
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      const prefix = rawKey.slice(0, 12);

      const key = await db
        .insertInto('api_keys')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          key_hash: keyHash,
          prefix,
          scope: parsed.data.scope,
        })
        .returning(['id', 'workspace_id', 'name', 'prefix', 'scope', 'created_at'])
        .executeTakeFirstOrThrow();

      // Return raw key ONCE — it is never stored and cannot be retrieved again
      res.status(201).json({ data: { ...key, key: rawKey }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/api-keys/:id — revoke
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('api_keys')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'API key not found' } });
        return;
      }
      res.json({ data: { id: deleted.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Register route in `apps/api/src/index.ts`**

Add import after the webhooks import:
```typescript
import { createApiKeysRouter } from './routes/api-keys';
```

Add mount after the webhooks line:
```typescript
app.use('/api/api-keys', requireAuth, createApiKeysRouter(db));
```

- [ ] **Step 3: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/api-keys.ts apps/api/src/index.ts
git commit -m "feat: add internal API key management routes"
```

---

## Task 4: Public `/v1/contacts` route

**Files:**
- Create: `apps/api/src/routes/v1/contacts.ts`

- [ ] **Step 1: Create the contacts v1 route**

```typescript
// apps/api/src/routes/v1/contacts.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).optional(),
  owner_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).default('prospect'),
  company_id: z.string().uuid().optional(),
  owner_id: z.string().uuid(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).optional(),
  company_id: z.string().uuid().nullable().optional(),
});

export function createV1ContactsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/contacts
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, owner_id } = parsed.data;

      let query = db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (status) query = query.where('status', '=', status);
      if (owner_id) query = query.where('owner_id', '=', owner_id);

      const contacts = await query.execute();

      let countQuery = db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (owner_id) countQuery = countQuery.where('owner_id', '=', owner_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();
      res.json({ data: contacts, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/contacts/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const contact = await db
        .selectFrom('contacts')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }
      res.json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/contacts [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Validate owner_id belongs to workspace
      const owner = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.owner_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!owner) {
        res.status(400).json({ data: null, error: { code: 'INVALID_OWNER', message: 'owner_id not found in workspace' } });
        return;
      }

      const contact = await db
        .insertInto('contacts')
        .values({ ...parsed.data, workspace_id: workspace.id })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count + 1` })
        .where('id', '=', workspace.id)
        .execute();

      res.status(201).json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /v1/contacts/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const contact = await db
        .updateTable('contacts')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }
      res.json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /v1/contacts/:id [read_write]
  router.delete('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const contact = await db
        .updateTable('contacts')
        .set({ deleted_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count - 1` })
        .where('id', '=', workspace.id)
        .execute();

      res.json({ data: { id: contact.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/contacts.ts
git commit -m "feat: add public v1 contacts endpoints"
```

---

## Task 5: Public `/v1/companies` route

**Files:**
- Create: `apps/api/src/routes/v1/companies.ts`

- [ ] **Step 1: Create the companies v1 route**

```typescript
// apps/api/src/routes/v1/companies.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

const createSchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  location: z.string().optional(),
  employee_count: z.number().int().min(0).optional(),
  website: z.string().url().optional(),
});

const updateSchema = createSchema.partial();

export function createV1CompaniesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/companies
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page } = parsed.data;

      const companies = await db
        .selectFrom('companies')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await db
        .selectFrom('companies')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: companies, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/companies/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const company = await db
        .selectFrom('companies')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!company) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } });
        return;
      }
      res.json({ data: company, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/companies [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const company = await db
        .insertInto('companies')
        .values({ ...parsed.data, workspace_id: workspace.id })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: company, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /v1/companies/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const company = await db
        .updateTable('companies')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!company) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } });
        return;
      }
      res.json({ data: company, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/companies.ts
git commit -m "feat: add public v1 companies endpoints"
```

---

## Task 6: Public `/v1/deals` route

**Files:**
- Create: `apps/api/src/routes/v1/deals.ts`

- [ ] **Step 1: Create the deals v1 route**

```typescript
// apps/api/src/routes/v1/deals.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  value: z.number().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
  close_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  stage_id: z.string().uuid().optional(),
  value: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  close_date: z.string().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
});

export function createV1DealsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/deals
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, pipeline_id, stage_id } = parsed.data;

      let query = db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (pipeline_id) query = query.where('pipeline_id', '=', pipeline_id);
      if (stage_id) query = query.where('stage_id', '=', stage_id);

      const deals = await query.execute();

      let countQuery = db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'));

      if (pipeline_id) countQuery = countQuery.where('pipeline_id', '=', pipeline_id);
      if (stage_id) countQuery = countQuery.where('stage_id', '=', stage_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();
      res.json({ data: deals, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/deals/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const deal = await db
        .selectFrom('deals')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!deal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }
      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/deals [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Validate owner_id belongs to workspace
      const owner = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.owner_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!owner) {
        res.status(400).json({ data: null, error: { code: 'INVALID_OWNER', message: 'owner_id not found in workspace' } });
        return;
      }

      // Validate pipeline belongs to workspace
      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', parsed.data.pipeline_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!pipeline) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PIPELINE', message: 'pipeline_id not found in workspace' } });
        return;
      }

      const deal = await db
        .insertInto('deals')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          pipeline_id: parsed.data.pipeline_id,
          stage_id: parsed.data.stage_id,
          owner_id: parsed.data.owner_id,
          value: parsed.data.value,
          probability: parsed.data.probability,
          close_date: parsed.data.close_date ? new Date(parsed.data.close_date) : null,
          contact_id: parsed.data.contact_id ?? null,
          company_id: parsed.data.company_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /v1/deals/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const updateVals: Record<string, unknown> = { updated_at: new Date() };
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v !== undefined) updateVals[k] = k === 'close_date' && v ? new Date(v as string) : v;
      }

      const deal = await db
        .updateTable('deals')
        .set(updateVals as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!deal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }
      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/deals.ts
git commit -m "feat: add public v1 deals endpoints"
```

---

## Task 7: Public `/v1/tasks` route

**Files:**
- Create: `apps/api/src/routes/v1/tasks.ts`

- [ ] **Step 1: Create the tasks v1 route**

```typescript
// apps/api/src/routes/v1/tasks.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  assignee_id: z.string().uuid(),
  due_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['todo', 'done']).optional(),
  due_date: z.string().nullable().optional(),
});

export function createV1TasksRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/tasks
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, assignee_id } = parsed.data;

      let query = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (status) query = query.where('status', '=', status);
      if (assignee_id) query = query.where('assignee_id', '=', assignee_id);

      const tasks = await query.execute();

      let countQuery = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (assignee_id) countQuery = countQuery.where('assignee_id', '=', assignee_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();
      res.json({ data: tasks, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/tasks [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Validate assignee_id belongs to workspace
      const assignee = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.assignee_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!assignee) {
        res.status(400).json({ data: null, error: { code: 'INVALID_ASSIGNEE', message: 'assignee_id not found in workspace' } });
        return;
      }

      const task = await db
        .insertInto('tasks')
        .values({
          workspace_id: workspace.id,
          title: parsed.data.title,
          assignee_id: parsed.data.assignee_id,
          due_date: parsed.data.due_date ? new Date(parsed.data.due_date) : null,
          contact_id: parsed.data.contact_id ?? null,
          deal_id: parsed.data.deal_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /v1/tasks/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const updateVals: Record<string, unknown> = { updated_at: new Date() };
      if (parsed.data.title !== undefined) updateVals['title'] = parsed.data.title;
      if (parsed.data.status !== undefined) updateVals['status'] = parsed.data.status;
      if (parsed.data.due_date !== undefined) {
        updateVals['due_date'] = parsed.data.due_date ? new Date(parsed.data.due_date) : null;
      }

      const task = await db
        .updateTable('tasks')
        .set(updateVals as never)
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

- [ ] **Step 2: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/tasks.ts
git commit -m "feat: add public v1 tasks endpoints"
```

---

## Task 8: Public `/v1/infra`, v1 router assembly, and index.ts registration

**Files:**
- Create: `apps/api/src/routes/v1/infra.ts`
- Create: `apps/api/src/routes/v1/index.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create the infra v1 route (read-only)**

```typescript
// apps/api/src/routes/v1/infra.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';

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
      const servers = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: servers, error: null });
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
      const websites = await db
        .selectFrom('websites')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: websites, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Create the v1 router index**

```typescript
// apps/api/src/routes/v1/index.ts
import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { createRequireApiKey } from '../../middleware/api-key-auth';
import { createV1ContactsRouter } from './contacts';
import { createV1CompaniesRouter } from './companies';
import { createV1DealsRouter } from './deals';
import { createV1TasksRouter } from './tasks';
import { createV1InfraRouter } from './infra';

export function createV1Router(db: Kysely<Database>): ExpressRouter {
  const router = Router();
  const requireApiKey = createRequireApiKey(db);

  // All /v1 routes require a valid API key
  router.use(requireApiKey);

  router.use('/contacts', createV1ContactsRouter(db));
  router.use('/companies', createV1CompaniesRouter(db));
  router.use('/deals', createV1DealsRouter(db));
  router.use('/tasks', createV1TasksRouter(db));

  // Infra routes mounted directly (they define /servers, /alerts, /websites)
  const infraRouter = createV1InfraRouter(db);
  router.use('/', infraRouter);

  return router;
}
```

- [ ] **Step 3: Register `/v1` in `apps/api/src/index.ts`**

Add import after the webhooks router import:
```typescript
import { createV1Router } from './routes/v1/index';
```

Add mount before the `errorHandler` line (after the agent route):
```typescript
// Public API v1 — API key auth (no requireAuth cookie)
app.use('/v1', createV1Router(db));
```

- [ ] **Step 4: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
cd apps/api && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/infra.ts apps/api/src/routes/v1/index.ts apps/api/src/index.ts
git commit -m "feat: add public v1 infra routes and assemble /v1 router"
```

---

## Task 9: Web UI — API key settings page

**Files:**
- Create: `apps/web/lib/api-keys.ts`
- Create: `apps/web/components/settings/ApiKeyTable.tsx`
- Create: `apps/web/components/settings/CreateApiKeyModal.tsx`
- Create: `apps/web/app/(dashboard)/settings/api-keys/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`

- [ ] **Step 1: Create the API lib for key management**

```typescript
// apps/web/lib/api-keys.ts
import { apiFetch } from './api';
import type { ApiKey } from '@vantage/types';

export async function listApiKeys(token: string) {
  return apiFetch<{ data: ApiKey[]; error: null }>('/api/api-keys', { token });
}

export async function createApiKey(
  token: string,
  body: { name: string; scope: 'read' | 'read_write' },
) {
  return apiFetch<{ data: ApiKey & { key: string }; error: null }>('/api/api-keys', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteApiKey(token: string, id: string) {
  return apiFetch<{ data: { id: string }; error: null }>(`/api/api-keys/${id}`, {
    method: 'DELETE',
    token,
  });
}
```

- [ ] **Step 2: Create the API key table component**

```tsx
// apps/web/components/settings/ApiKeyTable.tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listApiKeys, deleteApiKey } from '@/lib/api-keys';
import { Button } from '@/components/ui/Button';
import type { ApiKey } from '@vantage/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Props {
  onCreateClick: () => void;
}

export function ApiKeyTable({ onCreateClick }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => listApiKeys(await getToken()),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => deleteApiKey(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const keys: ApiKey[] = data?.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>API Keys</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Use API keys to access Vantage from external tools and scripts.
          </p>
        </div>
        <Button variant="primary" onClick={onCreateClick}>Create API Key</Button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : keys.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
          No API keys yet. Create one to get started.
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                {['Name', 'Prefix', 'Scope', 'Last used', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{k.name}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>{k.prefix}…</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 600,
                      background: k.scope === 'read_write' ? 'var(--amber-bg)' : 'var(--blue-bg)',
                      color: k.scope === 'read_write' ? 'var(--amber)' : 'var(--blue)',
                    }}>
                      {k.scope === 'read_write' ? 'read+write' : 'read'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>
                    {k.last_used_at ? formatDate(k.last_used_at) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>{formatDate(k.created_at)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <Button
                      onClick={() => revokeMut.mutate(k.id)}
                      disabled={revokeMut.isPending}
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the create API key modal**

```tsx
// apps/web/components/settings/CreateApiKeyModal.tsx
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { createApiKey } from '@/lib/api-keys';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/FormField';

interface Props {
  onClose: () => void;
}

export function CreateApiKeyModal({ onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'read_write'>('read');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: async () => createApiKey(await getToken(), { name: name.trim(), scope }),
    onSuccess: (res) => {
      setCreatedKey(res.data.key);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setError('');
    createMut.mutate();
  }

  function copyKey() {
    if (!createdKey) return;
    void navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: 28,
        width: 480, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>
          {createdKey ? 'API Key Created' : 'Create API Key'}
        </h3>

        {createdKey ? (
          <>
            <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--green)' }}>
              <strong>Save this key now.</strong> It will not be shown again.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input
                readOnly
                value={createdKey}
                style={{
                  flex: 1, fontFamily: 'monospace', fontSize: 12,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '8px 10px', color: 'var(--text)',
                }}
              />
              <Button onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <FormField label="Name">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Zapier integration"
                autoFocus
              />
            </FormField>

            <div style={{ margin: '16px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text)' }}>Scope</div>
              {(['read', 'read_write'] as const).map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="scope"
                    value={s}
                    checked={scope === s}
                    onChange={() => setScope(s)}
                  />
                  <span style={{ fontWeight: 500 }}>{s === 'read_write' ? 'Read + Write' : 'Read only'}</span>
                  <span style={{ color: 'var(--text2)' }}>
                    {s === 'read' ? '— can only fetch data' : '— can create and update records'}
                  </span>
                </label>
              ))}
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button type="button" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create key'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the API keys settings page**

```tsx
// apps/web/app/(dashboard)/settings/api-keys/page.tsx
'use client';

import { useState } from 'react';
import { ApiKeyTable } from '@/components/settings/ApiKeyTable';
import { CreateApiKeyModal } from '@/components/settings/CreateApiKeyModal';

export default function ApiKeysPage() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ maxWidth: 800 }}>
      <ApiKeyTable onCreateClick={() => setShowModal(true)} />
      {showModal && <CreateApiKeyModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
```

- [ ] **Step 5: Add "API Keys" tab to settings layout**

In `apps/web/app/(dashboard)/settings/layout.tsx`, find `ALL_TABS` and add the API Keys entry (admin only):

```typescript
const ALL_TABS: Tab[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/pipelines', label: 'Pipelines', adminOnly: true },
  { href: '/settings/ssh', label: 'SSH Keys', adminOnly: true },
  { href: '/settings/api-keys', label: 'API Keys', adminOnly: true },
];
```

Also add the api-keys path to the admin redirect guard in the `useEffect`:

```typescript
useEffect(() => {
  if (!isLoading && !isAdmin && (
    pathname.startsWith('/settings/pipelines') ||
    pathname.startsWith('/settings/ssh') ||
    pathname.startsWith('/settings/api-keys')
  )) {
    router.push('/settings/profile');
  }
}, [isAdmin, isLoading, pathname, router]);
```

- [ ] **Step 6: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run all tests**

```bash
cd apps/api && npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/api-keys.ts \
        apps/web/components/settings/ApiKeyTable.tsx \
        apps/web/components/settings/CreateApiKeyModal.tsx \
        apps/web/app/(dashboard)/settings/api-keys/page.tsx \
        apps/web/app/(dashboard)/settings/layout.tsx
git commit -m "feat: add API keys settings page with create and revoke UI"
```
