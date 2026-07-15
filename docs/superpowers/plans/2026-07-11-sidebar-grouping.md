# Sidebar Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-managed workspace-wide sidebar groups + per-user pins/collapse, all driven by right-click context menus.

**Architecture:** New `workspace_sidebar_groups` (JSONB `item_keys` array per group) and `user_sidebar_prefs` tables. API exposes whole-layout GET/PUT (`/api/sidebar/layout`, PUT admin-only) and per-user prefs GET/PUT (`/api/sidebar/prefs`). Server merge pass on every layout read repairs state and appends unknown item keys to the default group. Web rewrites `Sidebar.tsx`: pinned section, rendered group headers with collapse, admin context-menu ops recomputed client-side via pure helpers and saved as one PUT.

**Tech Stack:** Kysely migrations (`packages/db`), Express + Zod (`apps/api`), Vitest + supertest (API tests), Next.js + React Query + existing `ContextMenu` component (web).

**Spec:** `docs/superpowers/specs/2026-07-11-sidebar-grouping-design.md`

## Global Constraints

- Every DB query scoped by `workspace_id`. Prefs additionally scoped by `user_id`.
- API responses: `{ data, error: null }` or `{ data: null, error: { code, message } }`.
- Zod validation on all bodies before DB.
- No `any` in new code (test mocks may cast). No `console.log` in production paths.
- Never modify existing migration files — new file only.
- Item key = nav href (e.g. `/pipeline`). Plugin items: `manifest.nav.href` or `/plugins/<plugin_id><surface.path>`.
- `/settings` is NOT an item key — it moves to a gear icon in the sidebar bottom row.
- JSONB array columns are written with `JSON.stringify(...)` (see `apps/api/src/routes/custom-fields.ts:72` for the idiom).
- Seed groups: Sales, Infra, Projects, Insights, General (default). Exact keys in Task 2.
- Work happens on branch `feat/sidebar-grouping` (already checked out).
- Web app has no component-test harness; web verification is via preview tools (Task 6). All automated tests live in `apps/api`.

---

### Task 1: DB migration + schema types

**Files:**
- Create: `packages/db/migrations/20260711_001_sidebar_layout.ts`
- Modify: `packages/db/src/schema.ts` (add two table interfaces + register in `Database` interface at ~line 1234)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Database['workspace_sidebar_groups']` and `Database['user_sidebar_prefs']` Kysely table types used by Tasks 2–3.

- [ ] **Step 1: Write the migration**

Create `packages/db/migrations/20260711_001_sidebar_layout.ts`:

```ts
import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_sidebar_groups')
    .ifNotExists()
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('position', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('is_default', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('item_keys', 'jsonb', (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('workspace_sidebar_groups_ws_idx')
    .ifNotExists()
    .on('workspace_sidebar_groups')
    .column('workspace_id')
    .execute();

  await db.schema
    .createTable('user_sidebar_prefs')
    .ifNotExists()
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('pinned_keys', 'jsonb', (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('collapsed_group_keys', 'jsonb', (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('user_sidebar_prefs_pk', ['user_id', 'workspace_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_sidebar_prefs').ifExists().execute();
  await db.schema.dropTable('workspace_sidebar_groups').ifExists().execute();
}
```

Note the column is `collapsed_group_keys` (not `_ids`): unsaved seed layouts have no group ids, so collapse state is keyed by `group.id ?? 'seed:' + label` (see Task 4). The column stores those keys.

- [ ] **Step 2: Add schema types**

In `packages/db/src/schema.ts`, add near the other table interfaces (e.g. after `WorkspacePluginTable`, ~line 687):

```ts
export interface WorkspaceSidebarGroupTable {
  id: Generated<string>;
  workspace_id: string;
  label: string;
  position: number;
  is_default: Generated<boolean>;
  item_keys: string[]; // jsonb
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserSidebarPrefsTable {
  user_id: string;
  workspace_id: string;
  pinned_keys: string[]; // jsonb
  collapsed_group_keys: string[]; // jsonb
  updated_at: Generated<Date>;
}
```

Register both in the `Database` interface (~line 1234):

```ts
  workspace_sidebar_groups: WorkspaceSidebarGroupTable;
  user_sidebar_prefs: UserSidebarPrefsTable;
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @vencore/db build`
Expected: exits 0 (runs `tsc && tsc -p tsconfig.migrations.json`).

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260711_001_sidebar_layout.ts packages/db/src/schema.ts
git commit -m "feat(db): sidebar layout and user prefs tables"
```

---

### Task 2: API layout lib — seed, merge, validate (TDD)

**Files:**
- Create: `apps/api/src/lib/sidebar-layout.ts`
- Test: `apps/api/src/lib/sidebar-layout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 3 and mirrored client-side in Task 4):

```ts
export interface SidebarGroupDto {
  id: string | null;      // null = seed group, not yet persisted
  label: string;
  is_default: boolean;
  item_keys: string[];
}
export const BUILTIN_ITEM_KEYS: readonly string[];
export function seedGroups(): SidebarGroupDto[];               // fresh copy each call
export function mergeLayout(groups: SidebarGroupDto[], knownKeys: string[]): SidebarGroupDto[];
export function validateLayout(groups: { label: string; item_keys: string[]; is_default: boolean }[]): string | null;
```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/lib/sidebar-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { seedGroups, mergeLayout, validateLayout } from './sidebar-layout'

describe('seedGroups', () => {
  it('returns the five seed groups with General as the only default', () => {
    const groups = seedGroups()
    expect(groups.map(g => g.label)).toEqual(['Sales', 'Infra', 'Projects', 'Insights', 'General'])
    expect(groups.filter(g => g.is_default).map(g => g.label)).toEqual(['General'])
    expect(groups.find(g => g.label === 'Sales')!.item_keys).toEqual([
      '/pipeline', '/contacts', '/companies', '/tasks', '/activity',
    ])
    expect(groups.find(g => g.label === 'Insights')!.item_keys).toEqual(['/analytics', '/alerts'])
    expect(groups.flatMap(g => g.item_keys)).not.toContain('/settings')
  })

  it('returns a fresh copy each call', () => {
    const a = seedGroups()
    a[0]!.item_keys.push('/mutated')
    expect(seedGroups()[0]!.item_keys).not.toContain('/mutated')
  })
})

describe('mergeLayout', () => {
  const base = () => [
    { id: 'g1', label: 'Sales', is_default: false, item_keys: ['/pipeline'] },
    { id: 'g2', label: 'General', is_default: true, item_keys: ['/dashboard'] },
  ]

  it('appends known keys missing from every group to the default group', () => {
    const merged = mergeLayout(base(), ['/pipeline', '/dashboard', '/plugins/foo/home'])
    expect(merged.find(g => g.id === 'g2')!.item_keys).toEqual(['/dashboard', '/plugins/foo/home'])
  })

  it('drops duplicate keys, first occurrence wins', () => {
    const groups = base()
    groups[1]!.item_keys = ['/dashboard', '/pipeline']
    const merged = mergeLayout(groups, ['/pipeline', '/dashboard'])
    expect(merged.find(g => g.id === 'g1')!.item_keys).toEqual(['/pipeline'])
    expect(merged.find(g => g.id === 'g2')!.item_keys).toEqual(['/dashboard'])
  })

  it('keeps unknown stored keys (stale modules stay assigned, hidden client-side)', () => {
    const groups = base()
    groups[0]!.item_keys = ['/pipeline', '/ghost']
    const merged = mergeLayout(groups, ['/pipeline', '/dashboard'])
    expect(merged.find(g => g.id === 'g1')!.item_keys).toEqual(['/pipeline', '/ghost'])
  })

  it('forces exactly one default group when none is marked', () => {
    const groups = base().map(g => ({ ...g, is_default: false }))
    const merged = mergeLayout(groups, [])
    expect(merged.filter(g => g.is_default)).toHaveLength(1)
  })

  it('does not mutate its input', () => {
    const groups = base()
    mergeLayout(groups, ['/pipeline', '/dashboard', '/new'])
    expect(groups[1]!.item_keys).toEqual(['/dashboard'])
  })
})

describe('validateLayout', () => {
  const ok = () => [
    { label: 'Sales', item_keys: ['/pipeline'], is_default: false },
    { label: 'General', item_keys: ['/dashboard'], is_default: true },
  ]

  it('accepts a valid layout', () => {
    expect(validateLayout(ok())).toBeNull()
  })

  it('rejects empty layout', () => {
    expect(validateLayout([])).toMatch(/at least one/i)
  })

  it('rejects zero or multiple default groups', () => {
    expect(validateLayout(ok().map(g => ({ ...g, is_default: false })))).toMatch(/default/i)
    expect(validateLayout(ok().map(g => ({ ...g, is_default: true })))).toMatch(/default/i)
  })

  it('rejects empty and duplicate labels (case-insensitive)', () => {
    const g = ok()
    g[0]!.label = '   '
    expect(validateLayout(g)).toMatch(/label/i)
    const d = ok()
    d[0]!.label = 'general'
    expect(validateLayout(d)).toMatch(/label/i)
  })

  it('rejects duplicate item keys across groups', () => {
    const g = ok()
    g[0]!.item_keys = ['/pipeline', '/dashboard']
    expect(validateLayout(g)).toMatch(/duplicate/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vencore/api test -- src/lib/sidebar-layout.test.ts`
Expected: FAIL — cannot resolve `./sidebar-layout`.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/sidebar-layout.ts`:

```ts
export interface SidebarGroupDto {
  id: string | null;
  label: string;
  is_default: boolean;
  item_keys: string[];
}

export const BUILTIN_ITEM_KEYS: readonly string[] = [
  '/pipeline', '/contacts', '/companies', '/tasks', '/activity',
  '/servers', '/databases', '/websites',
  '/messaging', '/projects',
  '/analytics', '/alerts',
  '/dashboard',
];

const SEED: ReadonlyArray<Readonly<{ label: string; is_default: boolean; item_keys: readonly string[] }>> = [
  { label: 'Sales',    is_default: false, item_keys: ['/pipeline', '/contacts', '/companies', '/tasks', '/activity'] },
  { label: 'Infra',    is_default: false, item_keys: ['/servers', '/databases', '/websites'] },
  { label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
  { label: 'Insights', is_default: false, item_keys: ['/analytics', '/alerts'] },
  { label: 'General',  is_default: true,  item_keys: ['/dashboard'] },
];

export function seedGroups(): SidebarGroupDto[] {
  return SEED.map(g => ({ id: null, label: g.label, is_default: g.is_default, item_keys: [...g.item_keys] }));
}

export function mergeLayout(groups: SidebarGroupDto[], knownKeys: string[]): SidebarGroupDto[] {
  const seen = new Set<string>();
  const out = groups.map(g => ({
    ...g,
    item_keys: g.item_keys.filter(k => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  }));

  // exactly one default: keep the first marked, else mark the last group
  let defaultIdx = out.findIndex(g => g.is_default);
  if (defaultIdx === -1) defaultIdx = out.length - 1;
  out.forEach((g, i) => { g.is_default = i === defaultIdx; });

  const missing = knownKeys.filter(k => !seen.has(k));
  if (missing.length > 0 && out[defaultIdx]) {
    out[defaultIdx].item_keys = [...out[defaultIdx].item_keys, ...missing];
  }
  return out;
}

export function validateLayout(
  groups: { label: string; item_keys: string[]; is_default: boolean }[],
): string | null {
  if (groups.length === 0) return 'Layout must contain at least one group';
  if (groups.filter(g => g.is_default).length !== 1) return 'Layout must contain exactly one default group';

  const labels = new Set<string>();
  for (const g of groups) {
    const label = g.label.trim().toLowerCase();
    if (!label) return 'Group labels must be non-empty';
    if (labels.has(label)) return `Duplicate group label: ${g.label}`;
    labels.add(label);
  }

  const keys = new Set<string>();
  for (const g of groups) {
    for (const k of g.item_keys) {
      if (keys.has(k)) return `Duplicate item key across groups: ${k}`;
      keys.add(k);
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vencore/api test -- src/lib/sidebar-layout.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/sidebar-layout.ts apps/api/src/lib/sidebar-layout.test.ts
git commit -m "feat(api): sidebar layout seed, merge, and validation logic"
```

---

### Task 3: API router + mount (TDD)

**Files:**
- Create: `apps/api/src/routes/sidebar.ts`
- Test: `apps/api/src/routes/sidebar.test.ts`
- Modify: `apps/api/src/index.ts` (import + one `app.use` line)

**Interfaces:**
- Consumes: Task 2 exports; `requireAdmin`, `AuthenticatedRequest` from `../middleware/auth`; `Database` from `@vencore/db`.
- Produces HTTP API used by Task 4:
  - `GET /api/sidebar/layout` → `{ data: { groups: SidebarGroupDto[] }, error: null }`
  - `PUT /api/sidebar/layout` (admin) body `{ groups: [{ id?: string, label: string, item_keys: string[], is_default: boolean }] }`, array order = position → same response as GET
  - `GET /api/sidebar/prefs` → `{ data: { pinned_keys: string[], collapsed_group_keys: string[] }, error: null }`
  - `PUT /api/sidebar/prefs` body `{ pinned_keys: string[], collapsed_group_keys: string[] }` → echoes saved prefs

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/sidebar.test.ts` (mocked-Kysely pattern, mirrors `cross-module-settings.test.ts`):

```ts
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { createSidebarRouter } from './sidebar'

const WORKSPACE_ID = 'ws-1'

function makeApp(db: Kysely<Database>, role: 'admin' | 'member' = 'admin') {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: 'user-1', role }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
  app.use('/api/sidebar', createSidebarRouter(db))
  return app
}

/** Mock: selectFrom(table) → chainable → execute resolves rowsByTable[table]. */
function mockDb(rowsByTable: Record<string, unknown[]>, extra: Record<string, unknown> = {}) {
  const selectFrom = vi.fn((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      selectAll: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      execute: vi.fn(async () => rowsByTable[table] ?? []),
      executeTakeFirst: vi.fn(async () => (rowsByTable[table] ?? [])[0]),
    }
    return chain
  })
  return { selectFrom, ...extra } as unknown as Kysely<Database>
}

describe('GET /api/sidebar/layout', () => {
  it('returns seed groups when the workspace has no saved layout', async () => {
    const db = mockDb({ workspace_sidebar_groups: [], workspace_plugins: [] })
    const res = await request(makeApp(db)).get('/api/sidebar/layout')
    expect(res.status).toBe(200)
    expect(res.body.data.groups.map((g: any) => g.label)).toEqual(
      ['Sales', 'Infra', 'Projects', 'Insights', 'General'],
    )
  })

  it('appends enabled plugin nav keys to the default group', async () => {
    const db = mockDb({
      workspace_sidebar_groups: [],
      workspace_plugins: [
        { plugin_id: 'foo', manifest: { nav: { href: '/plugins/foo', label: 'Foo' } } },
        { plugin_id: 'bar', manifest: { surfaces: { nav: [{ path: '/home', label: 'Bar' }] } } },
      ],
    })
    const res = await request(makeApp(db)).get('/api/sidebar/layout')
    const general = res.body.data.groups.find((g: any) => g.is_default)
    expect(general.item_keys).toContain('/plugins/foo')
    expect(general.item_keys).toContain('/plugins/bar/home')
  })

  it('returns saved groups ordered by position', async () => {
    const db = mockDb({
      workspace_sidebar_groups: [
        { id: 'g1', label: 'Mine', is_default: false, item_keys: ['/pipeline'], position: 0 },
        { id: 'g2', label: 'Rest', is_default: true, item_keys: [], position: 1 },
      ],
      workspace_plugins: [],
    })
    const res = await request(makeApp(db)).get('/api/sidebar/layout')
    expect(res.body.data.groups[0].label).toBe('Mine')
    expect(res.body.data.groups[0].id).toBe('g1')
  })
})

describe('PUT /api/sidebar/layout', () => {
  const validBody = {
    groups: [
      { label: 'Sales', item_keys: ['/pipeline'], is_default: false },
      { label: 'General', item_keys: ['/dashboard'], is_default: true },
    ],
  }

  it('rejects non-admin with 403', async () => {
    const db = mockDb({})
    const res = await request(makeApp(db, 'member')).put('/api/sidebar/layout').send(validBody)
    expect(res.status).toBe(403)
  })

  it('rejects invalid layout with 400', async () => {
    const db = mockDb({})
    const res = await request(makeApp(db)).put('/api/sidebar/layout').send({
      groups: [
        { label: 'A', item_keys: ['/pipeline', '/dashboard'], is_default: true },
        { label: 'B', item_keys: ['/pipeline'], is_default: false },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  it('persists via upsert inside a transaction and returns the merged layout', async () => {
    const trx = {
      selectFrom: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => [{ id: 'keep-1' }, { id: 'stale-1' }]),
      })),
      deleteFrom: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => []),
      })),
      updateTable: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => []),
      })),
      insertInto: vi.fn(() => ({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => []),
      })),
    }
    // Handler re-reads the layout after the transaction; mock returns the "saved" rows.
    const db = mockDb(
      {
        workspace_sidebar_groups: [
          { id: 'keep-1', label: 'Sales', is_default: false, item_keys: ['/pipeline'], position: 0 },
          { id: 'new-1', label: 'General', is_default: true, item_keys: ['/dashboard'], position: 1 },
        ],
        workspace_plugins: [],
      },
      { transaction: () => ({ execute: (cb: (t: unknown) => unknown) => cb(trx) }) },
    )
    const res = await request(makeApp(db)).put('/api/sidebar/layout').send({
      groups: [
        { id: 'keep-1', label: 'Sales', item_keys: ['/pipeline'], is_default: false },
        { label: 'General', item_keys: ['/dashboard'], is_default: true },
      ],
    })
    expect(res.status).toBe(200)
    expect(trx.updateTable).toHaveBeenCalled()   // keep-1 updated in place (id stable)
    expect(trx.insertInto).toHaveBeenCalled()    // new General row inserted
    expect(trx.deleteFrom).toHaveBeenCalled()    // stale-1 removed
    expect(res.body.data.groups.map((g: any) => g.label)).toEqual(['Sales', 'General'])
  })
})

describe('GET /api/sidebar/prefs', () => {
  it('returns empty prefs when no row exists', async () => {
    const db = mockDb({ user_sidebar_prefs: [] })
    const res = await request(makeApp(db, 'member')).get('/api/sidebar/prefs')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ pinned_keys: [], collapsed_group_keys: [] })
  })

  it('returns the stored row', async () => {
    const db = mockDb({
      user_sidebar_prefs: [{ pinned_keys: ['/pipeline'], collapsed_group_keys: ['g1'] }],
    })
    const res = await request(makeApp(db, 'member')).get('/api/sidebar/prefs')
    expect(res.body.data.pinned_keys).toEqual(['/pipeline'])
  })
})

describe('PUT /api/sidebar/prefs', () => {
  it('upserts and echoes the prefs', async () => {
    const chain: any = {
      values: vi.fn(() => chain),
      onConflict: vi.fn((cb: (oc: any) => any) => {
        cb({ columns: vi.fn().mockReturnThis(), doUpdateSet: vi.fn().mockReturnThis() })
        return chain
      }),
      execute: vi.fn(async () => []),
    }
    const db = mockDb({}, { insertInto: vi.fn(() => chain) })
    const res = await request(makeApp(db, 'member'))
      .put('/api/sidebar/prefs')
      .send({ pinned_keys: ['/tasks'], collapsed_group_keys: [] })
    expect(res.status).toBe(200)
    expect(res.body.data.pinned_keys).toEqual(['/tasks'])
    expect(chain.values).toHaveBeenCalled()
  })

  it('rejects malformed body with 400', async () => {
    const db = mockDb({})
    const res = await request(makeApp(db, 'member'))
      .put('/api/sidebar/prefs')
      .send({ pinned_keys: 'nope' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vencore/api test -- src/routes/sidebar.test.ts`
Expected: FAIL — cannot resolve `./sidebar`.

- [ ] **Step 3: Implement the router**

Create `apps/api/src/routes/sidebar.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/auth'
import {
  BUILTIN_ITEM_KEYS,
  seedGroups,
  mergeLayout,
  validateLayout,
  type SidebarGroupDto,
} from '../lib/sidebar-layout'

const putLayoutSchema = z.object({
  groups: z.array(z.object({
    id: z.string().uuid().optional(),
    label: z.string().max(40),
    item_keys: z.array(z.string().max(200)).max(100),
    is_default: z.boolean(),
  })).max(30),
})

const putPrefsSchema = z.object({
  pinned_keys: z.array(z.string().max(200)).max(50),
  collapsed_group_keys: z.array(z.string().max(100)).max(50),
})

interface PluginNavRow {
  plugin_id: string;
  manifest: Record<string, unknown> | null;
}

function pluginKeys(rows: PluginNavRow[]): string[] {
  return rows.flatMap((p) => {
    const m = p.manifest as {
      nav?: { href?: string };
      surfaces?: { nav?: { path: string }[] };
    } | null;
    const keys: string[] = [];
    if (m?.nav?.href) keys.push(m.nav.href);
    for (const item of m?.surfaces?.nav ?? []) keys.push(`/plugins/${p.plugin_id}${item.path}`);
    return keys;
  });
}

async function knownKeys(db: Kysely<Database>, workspaceId: string): Promise<string[]> {
  const plugins = await db
    .selectFrom('workspace_plugins')
    .select(['plugin_id', 'manifest'])
    .where('workspace_id', '=', workspaceId)
    .where('enabled', '=', true)
    .execute()
  return [...BUILTIN_ITEM_KEYS, ...pluginKeys(plugins as PluginNavRow[])]
}

async function loadLayout(db: Kysely<Database>, workspaceId: string): Promise<SidebarGroupDto[]> {
  const rows = await db
    .selectFrom('workspace_sidebar_groups')
    .select(['id', 'label', 'is_default', 'item_keys'])
    .where('workspace_id', '=', workspaceId)
    .orderBy('position', 'asc')
    .execute()
  const groups: SidebarGroupDto[] = rows.length > 0
    ? rows.map((r) => ({ id: r.id, label: r.label, is_default: r.is_default, item_keys: r.item_keys ?? [] }))
    : seedGroups()
  return mergeLayout(groups, await knownKeys(db, workspaceId))
}

export function createSidebarRouter(db: Kysely<Database>): Router {
  const router = Router()

  router.get('/layout', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const groups = await loadLayout(db, workspace.id)
      return res.json({ data: { groups }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.put('/layout', requireAdmin, async (req, res) => {
    const parsed = putLayoutSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    }
    const validationError = validateLayout(parsed.data.groups)
    if (validationError) {
      return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: validationError } })
    }
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const incoming = parsed.data.groups

      // Upsert keeps existing group ids stable so per-user collapse keys survive admin saves.
      await db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('workspace_sidebar_groups')
          .select(['id'])
          .where('workspace_id', '=', workspace.id)
          .execute()
        const incomingIds = new Set(incoming.map((g) => g.id).filter(Boolean))
        const staleIds = existing.map((r) => r.id).filter((id) => !incomingIds.has(id))

        if (staleIds.length > 0) {
          await trx
            .deleteFrom('workspace_sidebar_groups')
            .where('workspace_id', '=', workspace.id)
            .where('id', 'in', staleIds)
            .execute()
        }

        const existingIds = new Set(existing.map((r) => r.id))
        for (const [position, g] of incoming.entries()) {
          if (g.id && existingIds.has(g.id)) {
            await trx
              .updateTable('workspace_sidebar_groups')
              .set({
                label: g.label.trim(),
                position,
                is_default: g.is_default,
                item_keys: JSON.stringify(g.item_keys),
                updated_at: new Date(),
              })
              .where('workspace_id', '=', workspace.id)
              .where('id', '=', g.id)
              .execute()
          } else {
            await trx
              .insertInto('workspace_sidebar_groups')
              .values({
                workspace_id: workspace.id,
                label: g.label.trim(),
                position,
                is_default: g.is_default,
                item_keys: JSON.stringify(g.item_keys),
              })
              .execute()
          }
        }
      })

      const groups = await loadLayout(db, workspace.id)
      return res.json({ data: { groups }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.get('/prefs', async (req, res) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest
      const row = await db
        .selectFrom('user_sidebar_prefs')
        .select(['pinned_keys', 'collapsed_group_keys'])
        .where('user_id', '=', user.id)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      return res.json({
        data: row ?? { pinned_keys: [], collapsed_group_keys: [] },
        error: null,
      })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.put('/prefs', async (req, res) => {
    const parsed = putPrefsSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    }
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest
      await db
        .insertInto('user_sidebar_prefs')
        .values({
          user_id: user.id,
          workspace_id: workspace.id,
          pinned_keys: JSON.stringify(parsed.data.pinned_keys),
          collapsed_group_keys: JSON.stringify(parsed.data.collapsed_group_keys),
          updated_at: new Date(),
        })
        .onConflict((oc) => oc.columns(['user_id', 'workspace_id']).doUpdateSet({
          pinned_keys: JSON.stringify(parsed.data.pinned_keys),
          collapsed_group_keys: JSON.stringify(parsed.data.collapsed_group_keys),
          updated_at: new Date(),
        }))
        .execute()
      return res.json({ data: parsed.data, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  return router
}
```

Note: `requireAdmin` sends its own 403 `{ data: null, error: { code: 'FORBIDDEN' } }` (see `apps/api/src/middleware/auth.ts:75`).

- [ ] **Step 4: Mount the router**

In `apps/api/src/index.ts`, add with the other route imports:

```ts
import { createSidebarRouter } from './routes/sidebar';
```

and near the other `app.use('/api/...')` mounts (e.g. beside the `/api/cross-module-settings` mount at ~line 433):

```ts
app.use('/api/sidebar', requireAuth, createSidebarRouter(db));
```

(`requireAuth` is already imported in `index.ts`. Do NOT add `requireAdmin` at mount level — GET endpoints serve all users; PUT `/layout` guards itself.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @vencore/api test -- src/routes/sidebar.test.ts`
Expected: all PASS.

Then run the full API suite to catch regressions: `pnpm --filter @vencore/api test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/sidebar.ts apps/api/src/routes/sidebar.test.ts apps/api/src/index.ts
git commit -m "feat(api): sidebar layout and prefs endpoints"
```

---

### Task 4: Web — pin icon, data hooks, pure layout ops

**Files:**
- Modify: `apps/web/modules/shared/components/ui/Icon.tsx` (add `pin` glyph to the icon map)
- Create: `apps/web/modules/shared/hooks/useSidebarLayout.ts`

**Interfaces:**
- Consumes: Task 3 HTTP API; `apiFetch` from `@/modules/shared/lib/api` (signature: `apiFetch<T>(path, options: RequestInit & { token?: string })` — pass `method`/`body` yourself, `body: JSON.stringify(...)`); `useApiToken` from `@/modules/shared/lib/useApiToken`.
- Produces (used by Task 5):

```ts
export interface SidebarGroup { id: string | null; label: string; is_default: boolean; item_keys: string[]; }
export interface SidebarPrefs { pinned_keys: string[]; collapsed_group_keys: string[]; }

export function collapseKey(g: SidebarGroup): string;      // g.id ?? `seed:${g.label}`
export function useSidebarLayoutQuery(): { groups: SidebarGroup[]; isFallback: boolean };
export function useSaveSidebarLayout(): UseMutationResult< ... >;   // .mutate({ groups })
export function useSidebarPrefsQuery(): SidebarPrefs;
export function useSaveSidebarPrefs(): { save: (prefs: SidebarPrefs) => void };  // optimistic

// Pure ops — each returns a NEW groups array, never mutates:
export function moveItemToGroup(groups: SidebarGroup[], itemKey: string, targetIdx: number): SidebarGroup[];
export function moveItemWithinGroup(groups: SidebarGroup[], groupIdx: number, itemKey: string, dir: 1 | -1): SidebarGroup[];
export function moveGroup(groups: SidebarGroup[], groupIdx: number, dir: 1 | -1): SidebarGroup[];
export function renameGroup(groups: SidebarGroup[], groupIdx: number, label: string): SidebarGroup[];
export function addGroupBelow(groups: SidebarGroup[], groupIdx: number): SidebarGroup[];
export function deleteGroup(groups: SidebarGroup[], groupIdx: number): SidebarGroup[];
```

- [ ] **Step 1: Add the pin icon**

In `apps/web/modules/shared/components/ui/Icon.tsx`, add to the icon map (alongside `plus`, `chevron`, etc.):

```tsx
  pin: <><path d="M12 17v5"/><path d="M8 3h8v3.5a2 2 0 0 0 .59 1.41l1.7 1.7A1 1 0 0 1 17.6 11H6.4a1 1 0 0 1-.7-1.7l1.71-1.7A2 2 0 0 0 8 6.2Z"/></>,
```

- [ ] **Step 2: Create the hook file**

Create `apps/web/modules/shared/hooks/useSidebarLayout.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

export interface SidebarGroup {
  id: string | null;
  label: string;
  is_default: boolean;
  item_keys: string[];
}

export interface SidebarPrefs {
  pinned_keys: string[];
  collapsed_group_keys: string[];
}

// Mirrors apps/api/src/lib/sidebar-layout.ts seedGroups() — fallback when the API is unreachable.
export const FALLBACK_GROUPS: SidebarGroup[] = [
  { id: null, label: 'Sales',    is_default: false, item_keys: ['/pipeline', '/contacts', '/companies', '/tasks', '/activity'] },
  { id: null, label: 'Infra',    is_default: false, item_keys: ['/servers', '/databases', '/websites'] },
  { id: null, label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
  { id: null, label: 'Insights', is_default: false, item_keys: ['/analytics', '/alerts'] },
  { id: null, label: 'General',  is_default: true,  item_keys: ['/dashboard'] },
];

const EMPTY_PREFS: SidebarPrefs = { pinned_keys: [], collapsed_group_keys: [] };

export function collapseKey(g: SidebarGroup): string {
  return g.id ?? `seed:${g.label}`;
}

export function useSidebarLayoutQuery(): { groups: SidebarGroup[]; isFallback: boolean } {
  const getToken = useApiToken();
  const { data, isError } = useQuery({
    queryKey: ['sidebar-layout'],
    queryFn: async () => {
      const res = await apiFetch<{ data: { groups: SidebarGroup[] }; error: null }>(
        '/api/sidebar/layout',
        { token: await getToken() },
      );
      return res.data.groups;
    },
    staleTime: 5 * 60_000,
  });
  return { groups: data ?? FALLBACK_GROUPS, isFallback: isError || data == null };
}

export function useSaveSidebarLayout() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groups: SidebarGroup[]) => {
      const res = await apiFetch<{ data: { groups: SidebarGroup[] }; error: null }>(
        '/api/sidebar/layout',
        {
          token: await getToken(),
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groups: groups.map((g) => ({
              ...(g.id ? { id: g.id } : {}),
              label: g.label,
              item_keys: g.item_keys,
              is_default: g.is_default,
            })),
          }),
        },
      );
      return res.data.groups;
    },
    onMutate: async (groups) => {
      await queryClient.cancelQueries({ queryKey: ['sidebar-layout'] });
      const previous = queryClient.getQueryData<SidebarGroup[]>(['sidebar-layout']);
      queryClient.setQueryData(['sidebar-layout'], groups);
      return { previous };
    },
    onError: (_err, _groups, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['sidebar-layout'], ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sidebar-layout'] });
    },
  });
}

export function useSidebarPrefsQuery(): SidebarPrefs {
  const getToken = useApiToken();
  const { data } = useQuery({
    queryKey: ['sidebar-prefs'],
    queryFn: async () => {
      const res = await apiFetch<{ data: SidebarPrefs; error: null }>(
        '/api/sidebar/prefs',
        { token: await getToken() },
      );
      return res.data;
    },
    staleTime: 60_000,
  });
  return data ?? EMPTY_PREFS;
}

export function useSaveSidebarPrefs(): { save: (prefs: SidebarPrefs) => void } {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (prefs: SidebarPrefs) => {
      await apiFetch('/api/sidebar/prefs', {
        token: await getToken(),
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
    },
  });
  return {
    save: (prefs: SidebarPrefs) => {
      queryClient.setQueryData(['sidebar-prefs'], prefs); // optimistic; failure reverts on next refetch
      mutation.mutate(prefs);
    },
  };
}

// ── Pure layout ops (admin context-menu actions) ─────────────────────────────

export function moveItemToGroup(groups: SidebarGroup[], itemKey: string, targetIdx: number): SidebarGroup[] {
  return groups.map((g, i) => {
    const without = g.item_keys.filter((k) => k !== itemKey);
    if (i === targetIdx) return { ...g, item_keys: [...without, itemKey] };
    return { ...g, item_keys: without };
  });
}

export function moveItemWithinGroup(groups: SidebarGroup[], groupIdx: number, itemKey: string, dir: 1 | -1): SidebarGroup[] {
  return groups.map((g, i) => {
    if (i !== groupIdx) return g;
    const keys = [...g.item_keys];
    const from = keys.indexOf(itemKey);
    const to = from + dir;
    if (from === -1 || to < 0 || to >= keys.length) return g;
    [keys[from], keys[to]] = [keys[to]!, keys[from]!];
    return { ...g, item_keys: keys };
  });
}

export function moveGroup(groups: SidebarGroup[], groupIdx: number, dir: 1 | -1): SidebarGroup[] {
  const to = groupIdx + dir;
  if (to < 0 || to >= groups.length) return groups;
  const out = [...groups];
  [out[groupIdx], out[to]] = [out[to]!, out[groupIdx]!];
  return out;
}

export function renameGroup(groups: SidebarGroup[], groupIdx: number, label: string): SidebarGroup[] {
  return groups.map((g, i) => (i === groupIdx ? { ...g, label } : g));
}

export function addGroupBelow(groups: SidebarGroup[], groupIdx: number): SidebarGroup[] {
  const out = [...groups];
  out.splice(groupIdx + 1, 0, { id: null, label: 'New group', is_default: false, item_keys: [] });
  return out;
}

export function deleteGroup(groups: SidebarGroup[], groupIdx: number): SidebarGroup[] {
  const doomed = groups[groupIdx];
  if (!doomed || doomed.is_default) return groups;
  const defaultIdx = groups.findIndex((g) => g.is_default);
  return groups
    .filter((_, i) => i !== groupIdx)
    .map((g, _i) =>
      g === groups[defaultIdx]
        ? { ...g, item_keys: [...g.item_keys, ...doomed.item_keys] }
        : g,
    );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @vencore/web exec tsc --noEmit`
Expected: no new errors (pre-existing errors, if any, are unchanged).

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/shared/components/ui/Icon.tsx apps/web/modules/shared/hooks/useSidebarLayout.ts
git commit -m "feat(web): sidebar layout hooks, pure ops, pin icon"
```

---

### Task 5: Web — Sidebar rewrite

**Files:**
- Modify: `apps/web/modules/shared/components/Sidebar.tsx` (full rewrite of nav rendering; logo lockup and user row structure stay)

**Interfaces:**
- Consumes: everything from Task 4; existing `ContextMenu`/`useContextMenu`/`ContextMenuItem` (supports `type: 'submenu'` with `items: ContextMenuSubItem[]`, `type: 'header'`, `type: 'separator'`, `danger`, `disabled`); existing queries in `Sidebar.tsx` (plugin navs, alert badge, messaging unread, update badge); `useAuth` (`user.role === 'admin'`), `useConfig`, `useModules`.
- Produces: final UI. No new exports.

Implementation spec — rewrite `Sidebar.tsx` as follows (keep file header imports style; this is the complete new structure):

**5a. Item registry.** Replace `NAV_GROUPS` with a flat registry; feature gating moves from group-level to item-level:

```ts
interface NavItemDef {
  label: string;
  icon: string;
  moduleId?: string;
  feature?: 'crm' | 'infra';
  featureKey?: 'analytics';
  dot?: boolean;
}

const NAV_ITEMS: Record<string, NavItemDef> = {
  '/pipeline':  { label: 'Pipeline',  icon: 'pipeline',  moduleId: 'pipelines', feature: 'crm' },
  '/contacts':  { label: 'Contacts',  icon: 'contacts',  moduleId: 'contacts',  feature: 'crm' },
  '/companies': { label: 'Companies', icon: 'companies', moduleId: 'companies', feature: 'crm' },
  '/tasks':     { label: 'Tasks',     icon: 'tasks',     moduleId: 'tasks',     feature: 'crm' },
  '/activity':  { label: 'Activity',  icon: 'activity',  moduleId: 'activity',  feature: 'crm' },
  '/servers':   { label: 'Servers',   icon: 'servers',   moduleId: 'servers',   feature: 'infra' },
  '/databases': { label: 'Databases', icon: 'databases', moduleId: 'databases', feature: 'infra' },
  '/websites':  { label: 'Websites',  icon: 'websites',  moduleId: 'websites',  feature: 'infra' },
  '/messaging': { label: 'Messaging', icon: 'message-square', moduleId: 'messaging' },
  '/projects':  { label: 'Projects',  icon: 'tasks',     moduleId: 'projects' },
  '/analytics': { label: 'Analytics', icon: 'analytics', moduleId: 'analytics', featureKey: 'analytics' },
  '/alerts':    { label: 'Alerts',    icon: 'alerts',    moduleId: 'alerts', dot: true },
  '/dashboard': { label: 'Dashboard', icon: 'dashboard', moduleId: 'dashboard' },
};
```

No `/settings` entry. Keep the existing `pluginNavItems` and `surfaceNavItems` queries; build a runtime lookup merging both sources:

```ts
const itemDefs = new Map<string, NavItemDef>(Object.entries(NAV_ITEMS));
for (const p of pluginNavItems) itemDefs.set(p.manifest.nav!.href, { label: p.manifest.nav!.label, icon: p.manifest.nav!.icon ?? 'plugin' });
for (const s of surfaceNavItems) itemDefs.set(s.href, { label: s.label, icon: s.icon });
```

Visibility predicate (same rules as today, item-level):

```ts
function isVisible(key: string): boolean {
  const def = itemDefs.get(key);
  if (!def) return false; // stale key from a removed module/plugin
  if (def.feature === 'crm' && !(config?.features.crm ?? true)) return false;
  if (def.feature === 'infra' && !(config?.features.infra ?? true)) return false;
  if (def.featureKey && config?.features && def.featureKey in config.features && !config.features[def.featureKey]) return false;
  if (def.moduleId && !isEnabled(def.moduleId)) return false;
  return true;
}
```

**5b. Data wiring.** In `Sidebar()`:

```ts
const { groups } = useSidebarLayoutQuery();
const prefs = useSidebarPrefsQuery();
const saveLayout = useSaveSidebarLayout();
const { save: savePrefs } = useSaveSidebarPrefs();
const isAdmin = user?.role === 'admin';
const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
const { showToast } = useToast();   // import from '@/modules/shared/components/ui/Toast'
```

All admin ops funnel through one helper:

```ts
function applyLayout(next: SidebarGroup[]) {
  saveLayout.mutate(next, {
    onError: () => showToast('error', 'Failed to save sidebar layout'),
  });
}
```

Pin toggle (any user):

```ts
function togglePin(key: string) {
  const pinned = prefs.pinned_keys.includes(key)
    ? prefs.pinned_keys.filter((k) => k !== key)
    : [...prefs.pinned_keys, key];
  savePrefs({ ...prefs, pinned_keys: pinned });
}
```

Collapse toggle: add/remove `collapseKey(group)` in `collapsed_group_keys`, `savePrefs`.

**5c. Render structure** (inside the existing scroll container, replacing the current `NAV_GROUPS.map`):

1. **Pinned section** — only if `prefs.pinned_keys.some(isVisible)`. Header row: uppercase micro-label `Pinned` (same style as group headers, no chevron, no admin menu). Items: `prefs.pinned_keys.filter(isVisible)` rendered with the same `NavLink` (context menu variant: Unpin / Move up / Move down within pins — reorder via `savePrefs` with swapped `pinned_keys`).
2. **Groups** — `groups.map((group, groupIdx) => ...)`. Visible items = `group.item_keys.filter(isVisible)`. If empty: render nothing for members; for admins render the header dimmed (`opacity: 0.5`) so it stays manageable. Header row:
   - Style: `fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, padding: '10px 10px 4px', display: flex, alignItems: center, gap: 6, cursor: pointer, userSelect: none`.
   - Chevron: `<Icon name={collapsed ? 'chevron-right' : 'chevron'} size={12} />` before the label (ContextMenu already uses `chevron-right`, so the glyph exists). Click anywhere on the header toggles collapse.
   - When `editingGroupKey === collapseKey(group)`: replace the label with an `<input>` (same font styles, `autoFocus`, transparent background, border-bottom `1px solid var(--border)`); Enter commits `applyLayout(renameGroup(groups, groupIdx, value.trim() || group.label))` and clears editing; Escape clears editing without saving; blur commits like Enter.
   - Admin right-click on header (`onContextMenu` → `openMenu`):
     ```ts
     [
       { icon: 'edit', label: 'Rename', onClick: () => setEditingGroupKey(collapseKey(group)) },
       { icon: 'plus', label: 'New group below', onClick: () => { applyLayout(addGroupBelow(groups, groupIdx)); setEditingGroupKey('seed:New group'); } },
       { icon: 'chevron-up', label: 'Move up', disabled: groupIdx === 0, onClick: () => applyLayout(moveGroup(groups, groupIdx, -1)) },
       { icon: 'chevron', label: 'Move down', disabled: groupIdx === groups.length - 1, onClick: () => applyLayout(moveGroup(groups, groupIdx, 1)) },
       { type: 'separator' },
       { icon: 'trash', label: 'Delete group', danger: true, disabled: group.is_default, onClick: () => applyLayout(deleteGroup(groups, groupIdx)) },
     ]
     ```
   - Items render below the header unless collapsed (`prefs.collapsed_group_keys.includes(collapseKey(group))`).
3. **NavLink** — keep the existing component shape (hover, active, dot, badge) but rebuild the context-menu items:
   ```ts
   const items: ContextMenuItem[] = [
     { icon: 'open', label: 'Open', onClick: () => router.push(href) },
     { icon: 'open', label: 'Open in new tab', onClick: () => window.open(href, '_blank') },
     { icon: 'link', label: 'Copy URL', onClick: () => navigator.clipboard.writeText(url) },
     { type: 'separator' },
     { icon: 'pin', label: isPinned ? 'Unpin' : 'Pin', onClick: () => togglePin(href) },
   ];
   if (isAdmin && groupIdx != null) {
     items.push(
       { type: 'separator' },
       { type: 'header', label: 'Manage' },
       {
         type: 'submenu', icon: 'folder', label: 'Move to group',
         items: [
           ...groups.map((g, i) => ({
             label: g.label,
             disabled: i === groupIdx,
             onClick: () => applyLayout(moveItemToGroup(groups, href, i)),
           })),
           {
             label: 'New group…',
             onClick: () => {
               const withNew = addGroupBelow(groups, groups.length - 1);
               applyLayout(moveItemToGroup(withNew, href, withNew.length - 1));
               setEditingGroupKey('seed:New group');
             },
           },
         ],
       },
       { icon: 'chevron-up', label: 'Move up', disabled: itemIdx === 0, onClick: () => applyLayout(moveItemWithinGroup(groups, groupIdx, href, -1)) },
       { icon: 'chevron', label: 'Move down', disabled: itemIdx === visibleCount - 1, onClick: () => applyLayout(moveItemWithinGroup(groups, groupIdx, href, 1)) },
     );
   }
   ```
   `NavLink` gains props: `isPinned: boolean`, `onTogglePin: () => void`, and optional `adminMenu?: ContextMenuItem[]` (Sidebar builds the admin entries and passes them in — keeps NavLink dumb). Old "Refresh" and "Pin to top (coming soon)" entries are deleted.
   `moveItemWithinGroup` swaps within the FULL `item_keys` array; disable logic uses the item's neighbors among *visible* items — acceptable v1 simplification: disable when first/last visible.
4. **Badges** — computed by href exactly as today: `dot` for `/alerts` when `hasCritical`; `badge={messagingUnread}` for `/messaging`. Applied in both Pinned and group sections.
5. **Bottom row** — add a settings gear button before the logout button in the existing user row:
   ```tsx
   <Link href="/settings" title="Settings" style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: pathname.startsWith('/settings') ? 'var(--text)' : 'var(--text3)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
     <Icon name="settings" size={15} />
     {updateAvailable && (
       <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 999, background: 'var(--red)' }} />
     )}
   </Link>
   ```
   The `updateAvailable` dot moves here; remove its wiring from the nav items. Remove the `dot`-for-settings logic from the group render.
6. **Remove** the `console.log('[sidebar-plugins]', ...)` line while touching this file (violates no-console rule).

Steps:

- [ ] **Step 1: Rewrite `Sidebar.tsx` per 5a–5c**

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @vencore/web exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/components/Sidebar.tsx
git commit -m "feat(web): grouped sidebar with pins, collapse, and admin context menus"
```

---

### Task 6: Migration run, preview verification, graph update

**Files:**
- Modify: `graphify-out/*` (regenerated)

**Interfaces:**
- Consumes: everything above.
- Produces: verified feature, updated knowledge graph.

- [ ] **Step 1: Run migrations against the dev DB**

Run the repo's usual migration command (check `packages/db/package.json` scripts — `migrate` target runs `migrate.ts`). Typical: `pnpm --filter @vencore/db migrate`
Expected: `20260711_001_sidebar_layout` applied, no errors.

- [ ] **Step 2: Full API test suite**

Run: `pnpm --filter @vencore/api test`
Expected: all PASS.

- [ ] **Step 3: Preview verification (dev server + preview tools)**

Start web+api dev servers via `preview_start`. Verify with preview tools (snapshot/click/screenshot), as admin user:

1. Sidebar shows group headers: SALES, INFRA, PROJECTS, INSIGHTS, GENERAL; Settings absent from nav, gear visible in bottom row and navigates to `/settings`.
2. Right-click a nav item → menu shows Open / Open in new tab / Copy URL / Pin + Manage section (admin).
3. Pin an item → Pinned section appears at top; item still listed in its group. Unpin → section disappears.
4. Move item to another group via submenu → item moves; reload page → persists.
5. Move up/down on item and group → order changes and persists.
6. Rename group inline (Enter saves, Esc cancels). New group below → appears with edit field focused.
7. Delete a custom group → its items land in General. Delete disabled on General.
8. Collapse a group via chevron → items hide; reload → still collapsed.
9. As member (non-admin) user: no Manage section in item menu, no header context menu, empty groups hidden, pin/collapse still work and are independent of the admin's pins.
10. Alerts dot and messaging badge render on their items; update dot renders on the gear (admin with update available — verify wiring by code read if not reproducible).

- [ ] **Step 4: Update knowledge graph**

Run: `graphify update .`

- [ ] **Step 5: Commit**

```bash
git add graphify-out
git commit -m "chore: refresh graphify output"
```

Then hand off to the finish-vencore-branch skill (user testing + screenshots + PR) when the user is ready.
