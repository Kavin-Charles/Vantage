# Instance Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-hosted Vencore instances detect new releases on GHCR, notify admins, and apply updates with one click via a Docker-socket sidecar.

**Architecture:** A worker cron job (via an internal API route) checks GHCR tags every 6 hours and persists the result to a singleton `instance_meta` table. Admin-only API routes expose update info and proxy update commands to a new `vencore-updater` sidecar container that pulls images, bumps `VENCORE_VERSION` in `.env`, and recreates services. The API runs pending Kysely migrations on boot (production only) so updated images self-migrate.

**Tech Stack:** Kysely/Postgres, Express, Zod, vitest, plain Node HTTP (updater), Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-03-instance-updater-design.md`

**Branch:** work happens on the current feature branch (`claude/gracious-edison-db081e` worktree). Never commit to `main`. Per the user's global rules, commit messages must NOT contain any AI/Claude attribution or co-author trailers.

**Conventions that apply to every task:**
- All API responses are `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`.
- TypeScript strict, no `any`.
- Run commands from the repo root unless stated. Prefix shell commands with `rtk` (e.g. `rtk pnpm --filter @vencore/api test`).
- API tests live in `apps/api/src/__tests__/*.test.ts` and run with `pnpm --filter @vencore/api test` (vitest). They use the "extract route handler from router stack" pattern — see `apps/api/src/__tests__/notifications.test.ts`.

---

### Task 1: `instance_meta` table — migration + schema type

**Files:**
- Create: `packages/db/migrations/20260703_001_instance_meta.ts`
- Modify: `packages/db/src/schema.ts` (add table interface + `Database` entry)

- [ ] **Step 1: Write the migration**

Create `packages/db/migrations/20260703_001_instance_meta.ts`:

```ts
import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS instance_meta (
      id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      latest_version text,
      release_url text,
      last_checked_at timestamptz,
      notified_version text
    )
  `.execute(db);
  await sql`INSERT INTO instance_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS instance_meta`.execute(db);
}
```

Note: this table is **instance-level** (no `workspace_id`) by design — the running software version is shared by all workspaces. The single-row `CHECK (id = 1)` enforces the singleton. The current running version is NOT stored here; it comes from the `VENCORE_VERSION` env var baked into the image.

- [ ] **Step 2: Add the Kysely table interface**

In `packages/db/src/schema.ts`, add near the other table interfaces (e.g. after `NotificationTable`, around line 443):

```ts
export interface InstanceMetaTable {
  id: Generated<number>;
  latest_version: string | null;
  release_url: string | null;
  last_checked_at: Date | null;
  notified_version: string | null;
}
```

And add to the `Database` interface (around line 1185):

```ts
  instance_meta: InstanceMetaTable;
```

- [ ] **Step 3: Type-check**

Run: `rtk pnpm --filter @vencore/db lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add packages/db/migrations/20260703_001_instance_meta.ts packages/db/src/schema.ts
rtk git commit -m "feat(db): instance_meta singleton table for update tracking"
```

---

### Task 2: Compiled migrations + `runMigrations` with advisory lock

Today migrations are `.ts` files run manually via `tsx` (`packages/db/src/migrate.ts`). Production containers run plain `node`, so migrations must be compiled to JS and runnable at boot.

**Files:**
- Create: `packages/db/tsconfig.migrations.json`
- Create: `packages/db/src/migrator.ts`
- Modify: `packages/db/package.json` (build script)
- Modify: `packages/db/src/index.ts` (export)

**Background you need:** Kysely's `FileMigrationProvider` uses the filename minus extension as the migration name, so already-applied `.ts` migrations match their compiled `.js` counterparts — no history rewrite happens. `packages/db/tsconfig.json` has `rootDir: "./src"`, `include: ["src"]`, so migrations are currently NOT compiled.

- [ ] **Step 1: Add a second tsconfig that compiles the migrations folder**

Create `packages/db/tsconfig.migrations.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist/migrations",
    "rootDir": "./migrations",
    "module": "CommonJS",
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false
  },
  "include": ["migrations"]
}
```

- [ ] **Step 2: Chain it into the build script**

In `packages/db/package.json`, change:

```json
    "build": "tsc",
```

to:

```json
    "build": "tsc && tsc -p tsconfig.migrations.json",
```

- [ ] **Step 3: Write `runMigrations`**

Create `packages/db/src/migrator.ts`:

```ts
import { Kysely, Migrator, FileMigrationProvider, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import * as path from 'path';
import { promises as fs } from 'fs';

const MIGRATION_LOCK_ID = 74123001;

/**
 * Runs all pending migrations from the compiled migrations folder
 * (dist/migrations). Safe to call concurrently from multiple processes:
 * a Postgres advisory lock serialises runners. Uses its own single-connection
 * pool so lock and unlock happen on the same session.
 *
 * Only usable from compiled output (dist/) — the compiled migrations folder
 * sits next to this file after build.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });

  try {
    await sql`SELECT pg_advisory_lock(${sql.lit(MIGRATION_LOCK_ID)})`.execute(db);

    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, 'migrations'),
      }),
    });

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach(r => {
      if (r.status === 'Success') console.log(`migration ✓ ${r.migrationName}`);
      else if (r.status === 'Error') console.error(`migration ✗ ${r.migrationName}`);
    });

    if (error) throw error instanceof Error ? error : new Error(String(error));
  } finally {
    await sql`SELECT pg_advisory_unlock(${sql.lit(MIGRATION_LOCK_ID)})`.execute(db).catch(() => {});
    await db.destroy();
  }
}
```

- [ ] **Step 4: Export it**

In `packages/db/src/index.ts`, append:

```ts
export { runMigrations } from './migrator';
```

- [ ] **Step 5: Build and verify the compiled layout**

Run: `rtk pnpm --filter @vencore/db build`
Expected: `packages/db/dist/migrator.js` exists and `packages/db/dist/migrations/` contains one `.js` per migration file (spot-check `20260703_001_instance_meta.js`).

- [ ] **Step 6: Verify migrations run against the dev database**

Run: `rtk pnpm --filter @vencore/db db:migrate`
Expected: `✓ 20260703_001_instance_meta` (or "No pending migrations." if already applied). This exercises the existing tsx path; the compiled path is exercised in Task 6.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/db/tsconfig.migrations.json packages/db/src/migrator.ts packages/db/src/index.ts packages/db/package.json
rtk git commit -m "feat(db): compile migrations and add runMigrations with advisory lock"
```

---

### Task 3: Config — new env vars

**Files:**
- Modify: `packages/config/src/index.ts` (`apiEnvSchema`, lines 10–32)

- [ ] **Step 1: Add updater env vars to the API env schema**

In `packages/config/src/index.ts`, inside `apiEnvSchema` (after `REDIS_URL`, line 31), add:

```ts
  // Updater sidecar — optional; update routes return 503 when unset
  UPDATER_URL: z.string().default('http://updater:9500'),
  UPDATER_SECRET: z.string().optional(),
```

- [ ] **Step 2: Type-check**

Run: `rtk pnpm --filter @vencore/config lint`
Expected: no errors. (If the config package has no `lint` script, run `rtk pnpm --filter @vencore/config build`.)

- [ ] **Step 3: Commit**

```bash
rtk git add packages/config/src/index.ts
rtk git commit -m "feat(config): UPDATER_URL and UPDATER_SECRET env vars"
```

---

### Task 4: API update-check library (TDD)

Pure logic + GHCR fetch + persistence. Lives in the API so both the worker (via internal route, Task 5/7) and the admin "Check now" route share one implementation.

**Files:**
- Create: `apps/api/src/lib/update-check.ts`
- Test: `apps/api/src/__tests__/update-check.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/__tests__/update-check.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildMockDb(meta: { notified_version: string | null } = { notified_version: null }) {
  const chain: Record<string, unknown> = {};
  for (const f of ['set', 'where', 'select', 'selectAll', 'values', 'execute', 'executeTakeFirst']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue([]);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(meta);
  return {
    updateTable: vi.fn().mockReturnValue(chain),
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function mockGhcr(tags: string[]) {
  return vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'tok' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ tags }) }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.resetModules();
  process.env['VENCORE_VERSION'] = '1.2.0';
});

describe('compareSemver / pickLatest / isSemver', () => {
  it('orders semvers numerically, not lexically', async () => {
    const { compareSemver } = await import('../lib/update-check');
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('picks the highest full-semver tag, ignoring aliases', async () => {
    const { pickLatest } = await import('../lib/update-check');
    expect(pickLatest(['latest', '1.2', '1.2.3', '1.10.0', '1.9.9'])).toBe('1.10.0');
    expect(pickLatest(['latest', 'main'])).toBeNull();
    expect(pickLatest([])).toBeNull();
  });

  it('rejects non-release version strings', async () => {
    const { isSemver } = await import('../lib/update-check');
    expect(isSemver('1.2.3')).toBe(true);
    expect(isSemver('0.0.0-dev')).toBe(false);
    expect(isSemver('latest')).toBe(false);
  });
});

describe('fetchLatestGhcrVersion', () => {
  it('exchanges an anonymous token then lists tags', async () => {
    const { fetchLatestGhcrVersion } = await import('../lib/update-check');
    const fetchFn = mockGhcr(['1.2.3', '1.3.0', 'latest']);
    expect(await fetchLatestGhcrVersion(fetchFn)).toBe('1.3.0');
  });

  it('throws when GHCR is unreachable', async () => {
    const { fetchLatestGhcrVersion } = await import('../lib/update-check');
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(fetchLatestGhcrVersion(fetchFn)).rejects.toThrow();
  });
});

describe('runUpdateCheck', () => {
  it('persists latest version and notifies admins once per version', async () => {
    const { runUpdateCheck } = await import('../lib/update-check');
    const db = buildMockDb({ notified_version: null });
    (db._chain['execute'] as ReturnType<typeof vi.fn>)
      .mockResolvedValue([{ id: 'u1', workspace_id: 'ws1' }]);
    const info = await runUpdateCheck(db as never, mockGhcr(['1.3.0']));
    expect(info.updateAvailable).toBe(true);
    expect(info.latestVersion).toBe('1.3.0');
    expect(db.updateTable).toHaveBeenCalledWith('instance_meta');
    expect(db.insertInto).toHaveBeenCalledWith('notifications');
  });

  it('does not re-notify for an already-notified version', async () => {
    const { runUpdateCheck } = await import('../lib/update-check');
    const db = buildMockDb({ notified_version: '1.3.0' });
    const info = await runUpdateCheck(db as never, mockGhcr(['1.3.0']));
    expect(info.updateAvailable).toBe(true);
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('reports no update when running a dev build', async () => {
    process.env['VENCORE_VERSION'] = '0.0.0-dev';
    const { runUpdateCheck } = await import('../lib/update-check');
    const db = buildMockDb();
    const info = await runUpdateCheck(db as never, mockGhcr(['1.3.0']));
    expect(info.updateAvailable).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter @vencore/api test -- update-check`
Expected: FAIL — cannot resolve `../lib/update-check`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/lib/update-check.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const GHCR_IMAGE = 'vencorehq/vencore-api';
const RELEASES_BASE = 'https://github.com/Kavin-Charles/Vencore/releases/tag';

export function currentVersion(): string {
  return process.env['VENCORE_VERSION'] ?? '0.0.0-dev';
}

export function isSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! - pb[i]!;
  }
  return 0;
}

export function pickLatest(tags: string[]): string | null {
  const semvers = tags.filter(isSemver);
  if (semvers.length === 0) return null;
  return semvers.sort(compareSemver).at(-1) ?? null;
}

export async function fetchLatestGhcrVersion(fetchFn: typeof fetch = fetch): Promise<string | null> {
  const tokenRes = await fetchFn(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${GHCR_IMAGE}:pull`,
  );
  if (!tokenRes.ok) throw new Error(`GHCR token request failed: ${tokenRes.status}`);
  const { token } = (await tokenRes.json()) as { token: string };

  const tagsRes = await fetchFn(`https://ghcr.io/v2/${GHCR_IMAGE}/tags/list?n=1000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!tagsRes.ok) throw new Error(`GHCR tags request failed: ${tagsRes.status}`);
  const { tags } = (await tagsRes.json()) as { tags: string[] | null };

  return pickLatest(tags ?? []);
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  lastCheckedAt: Date | null;
}

export async function runUpdateCheck(
  db: Kysely<Database>,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateInfo> {
  const running = currentVersion();
  const latest = await fetchLatestGhcrVersion(fetchFn);
  const releaseUrl = latest ? `${RELEASES_BASE}/v${latest}` : null;
  const now = new Date();

  await db
    .updateTable('instance_meta')
    .set({ latest_version: latest, release_url: releaseUrl, last_checked_at: now })
    .where('id', '=', 1)
    .execute();

  const updateAvailable =
    latest !== null && isSemver(running) && compareSemver(latest, running) > 0;

  if (updateAvailable && latest) {
    const meta = await db
      .selectFrom('instance_meta')
      .select('notified_version')
      .where('id', '=', 1)
      .executeTakeFirst();

    if (meta?.notified_version !== latest) {
      const admins = await db
        .selectFrom('users')
        .select(['id', 'workspace_id'])
        .where('role', '=', 'admin')
        .execute();

      if (admins.length > 0) {
        await db
          .insertInto('notifications')
          .values(
            admins.map(a => ({
              workspace_id: a.workspace_id,
              user_id: a.id,
              type: 'system',
              title: `Vencore ${latest} is available`,
              body: `You are running ${running}. Apply the update from Settings → Updates.`,
              resource_type: null,
              resource_id: null,
            })),
          )
          .execute();
      }

      await db
        .updateTable('instance_meta')
        .set({ notified_version: latest })
        .where('id', '=', 1)
        .execute();
    }
  }

  return {
    currentVersion: running,
    latestVersion: latest,
    updateAvailable,
    releaseUrl,
    lastCheckedAt: now,
  };
}
```

Note: `currentVersion()` is a function, not a module constant, so tests (and long-lived processes) always read the live env var.

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk pnpm --filter @vencore/api test -- update-check`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/lib/update-check.ts apps/api/src/__tests__/update-check.test.ts
rtk git commit -m "feat(api): GHCR update-check library"
```

---

### Task 5: API system router (TDD) + mount

**Files:**
- Create: `apps/api/src/routes/system.ts`
- Test: `apps/api/src/__tests__/system-route.test.ts`
- Modify: `apps/api/src/index.ts` (import + mount)

Routes:

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/system/version` | none | `{ version }` — used by UI and post-update polling |
| `POST /api/system/internal-check` | `x-cron-secret` | worker-triggered update check |
| `GET /api/system/update-info` | admin | instance_meta + current version |
| `POST /api/system/check-updates` | admin | on-demand check ("Check now") |
| `POST /api/system/update` | admin | validate + proxy to updater sidecar |
| `GET /api/system/update-status` | admin | proxy sidecar status |

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/__tests__/system-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestHandler } from 'express';

const passthrough: RequestHandler = (_req, _res, next) => next();

function buildMockDb(meta: Record<string, unknown> | undefined) {
  const chain: Record<string, unknown> = {};
  for (const f of ['select', 'selectAll', 'where', 'executeTakeFirst']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(meta);
  return { selectFrom: vi.fn().mockReturnValue(chain) };
}

function getHandler(router: unknown, method: string, path: string) {
  const stack = (router as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack;
  const layer = stack.find(s => s.route?.path === path && s.route.methods[method]);
  expect(layer, `${method.toUpperCase()} ${path} not found`).toBeDefined();
  return layer!.route!.stack.at(-1)!.handle;
}

const ENV = { CRON_SECRET: 'cron-s', UPDATER_URL: 'http://updater:9500', UPDATER_SECRET: 'upd-s' };

beforeEach(() => {
  vi.resetModules();
  process.env['VENCORE_VERSION'] = '1.2.0';
});

describe('GET /api/system/version', () => {
  it('returns the running version without auth', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const router = createSystemRouter(buildMockDb(undefined) as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'get', '/version');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: { version: '1.2.0' }, error: null });
  });
});

describe('POST /api/system/internal-check', () => {
  it('rejects a bad cron secret', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const router = createSystemRouter(buildMockDb(undefined) as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/internal-check');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ headers: { 'x-cron-secret': 'wrong' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('GET /api/system/update-info', () => {
  it('reports updateAvailable from instance_meta vs running version', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const db = buildMockDb({ latest_version: '1.3.0', release_url: 'https://x', last_checked_at: new Date() });
    const router = createSystemRouter(db as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'get', '/update-info');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({}, res, vi.fn());
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.data.updateAvailable).toBe(true);
    expect(payload.data.currentVersion).toBe('1.2.0');
    expect(payload.data.latestVersion).toBe('1.3.0');
  });
});

describe('POST /api/system/update', () => {
  it('returns 503 when the updater secret is not configured', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const env = { ...ENV, UPDATER_SECRET: undefined };
    const router = createSystemRouter(buildMockDb(undefined) as never, env, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/update');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ body: { version: '1.3.0' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejects a version that is not the detected latest', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const db = buildMockDb({ latest_version: '1.3.0' });
    const router = createSystemRouter(db as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/update');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ body: { version: '9.9.9' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.error.code).toBe('VERSION_MISMATCH');
  });

  it('rejects malformed version strings', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const router = createSystemRouter(buildMockDb(undefined) as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/update');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ body: { version: 'latest; rm -rf /' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter @vencore/api test -- system-route`
Expected: FAIL — cannot resolve `../routes/system`.

- [ ] **Step 3: Write the router**

Create `apps/api/src/routes/system.ts`:

```ts
import { Router, type RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { z } from 'zod';
import { currentVersion, isSemver, compareSemver, runUpdateCheck } from '../lib/update-check';

export interface SystemRouterEnv {
  CRON_SECRET: string;
  UPDATER_URL: string;
  UPDATER_SECRET?: string | undefined;
}

const updateBodySchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be x.y.z'),
});

export function createSystemRouter(
  db: Kysely<Database>,
  env: SystemRouterEnv,
  requireAuth: RequestHandler,
  requireAdmin: RequestHandler,
): Router {
  const router = Router();

  router.get('/version', (_req, res) => {
    res.json({ data: { version: currentVersion() }, error: null });
  });

  router.post('/internal-check', async (req, res, next) => {
    try {
      if (req.headers['x-cron-secret'] !== env.CRON_SECRET) {
        return res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } });
      }
      const info = await runUpdateCheck(db);
      return res.json({ data: info, error: null });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/update-info', requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const running = currentVersion();
      const meta = await db.selectFrom('instance_meta').selectAll().where('id', '=', 1).executeTakeFirst();
      const latest = meta?.latest_version ?? null;
      const updateAvailable =
        latest !== null && isSemver(running) && compareSemver(latest, running) > 0;
      return res.json({
        data: {
          currentVersion: running,
          latestVersion: latest,
          updateAvailable,
          releaseUrl: meta?.release_url ?? null,
          lastCheckedAt: meta?.last_checked_at ?? null,
        },
        error: null,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/check-updates', requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const info = await runUpdateCheck(db);
      return res.json({ data: info, error: null });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/update', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      if (!env.UPDATER_SECRET) {
        return res.status(503).json({ data: null, error: { code: 'UPDATER_UNAVAILABLE', message: 'Updater is not configured on this instance' } });
      }
      const parsed = updateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'version must be x.y.z' } });
      }
      const meta = await db.selectFrom('instance_meta').select('latest_version').where('id', '=', 1).executeTakeFirst();
      if (parsed.data.version !== meta?.latest_version) {
        return res.status(400).json({ data: null, error: { code: 'VERSION_MISMATCH', message: 'Requested version is not the detected latest release' } });
      }
      const r = await fetch(`${env.UPDATER_URL}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-updater-secret': env.UPDATER_SECRET },
        body: JSON.stringify({ version: parsed.data.version }),
      });
      const json: unknown = await r.json();
      return res.status(r.status).json(json);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/update-status', requireAuth, requireAdmin, async (_req, res) => {
    if (!env.UPDATER_SECRET) {
      return res.json({ data: { state: 'unavailable' }, error: null });
    }
    try {
      const r = await fetch(`${env.UPDATER_URL}/status`, {
        headers: { 'x-updater-secret': env.UPDATER_SECRET },
      });
      const json: unknown = await r.json();
      return res.status(r.status).json(json);
    } catch {
      return res.json({ data: { state: 'unreachable' }, error: null });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk pnpm --filter @vencore/api test -- system-route`
Expected: all tests PASS.

- [ ] **Step 5: Mount the router**

In `apps/api/src/index.ts`:

Add the import near the other route imports (after line 64, `createHooksRouter`):

```ts
import { createSystemRouter } from './routes/system';
```

Mount it near the other mounts (after line 356, `app.use('/api/settings', requireAuth, createHooksRouter(db));`). The router applies its own per-route auth, so no global middleware here:

```ts
// System — version + updates. Mixed auth handled inside the router.
app.use('/api/system', createSystemRouter(db, env, requireAuth, requireAdmin));
```

`requireAuth` and `requireAdmin` are already in scope in `index.ts` (see line 15 import and line 339 usage).

- [ ] **Step 6: Type-check the API**

Run: `rtk pnpm --filter @vencore/api lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/api/src/routes/system.ts apps/api/src/__tests__/system-route.test.ts apps/api/src/index.ts
rtk git commit -m "feat(api): /api/system routes for version, update check, and updater proxy"
```

---

### Task 6: API runs migrations on boot (production)

**Files:**
- Modify: `apps/api/src/index.ts` (the `httpServer.listen` call, currently line 416)

- [ ] **Step 1: Wrap server start in an async bootstrap**

In `apps/api/src/index.ts`, add `runMigrations` to the existing `@vencore/db` import (line 11):

```ts
import { createDb, runMigrations } from '@vencore/db';
```

Then replace the top-level `httpServer.listen(env.PORT, () => { ... });` call with:

```ts
async function start(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    logger.info('Running database migrations...');
    await runMigrations(env.DATABASE_URL);
    logger.info('Migrations up to date');
  }

  httpServer.listen(env.PORT, () => {
    // ... keep the ENTIRE existing listen callback body unchanged ...
  });
}

void start().catch((err: unknown) => {
  logger.error({ err }, 'API startup failed');
  process.exit(1);
});
```

Important: move the existing callback body (the `logger.info({ port ... })` line and the plugin-respawn IIFE that follows it) inside `start()` verbatim — do not rewrite it. Production-only gating means dev keeps using `pnpm db:migrate` and never depends on compiled migrations.

- [ ] **Step 2: Type-check and run the full API test suite**

Run: `rtk pnpm --filter @vencore/api lint && rtk pnpm --filter @vencore/api test`
Expected: no type errors, all tests pass.

- [ ] **Step 3: Verify dev boot still works**

Run: `rtk pnpm --filter @vencore/api dev` briefly (Ctrl-C after "API server running").
Expected: boots without attempting migrations (NODE_ENV=development).

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/index.ts
rtk git commit -m "feat(api): run pending migrations on boot in production"
```

---

### Task 7: Worker update-check job

**Files:**
- Create: `apps/worker/src/jobs/update-check.ts`
- Modify: `apps/worker/src/index.ts` (register in loop + on boot)

The worker has no test setup; this job is a thin fetch wrapper following the `website-ping.ts` pattern (worker → API with `x-cron-secret`). Logic is already tested in Task 4.

- [ ] **Step 1: Write the job**

Create `apps/worker/src/jobs/update-check.ts`:

```ts
import { logger } from '../lib/logger';
import { apiEnvSchema } from '@vencore/config';

const env = apiEnvSchema.parse(process.env);
const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let lastRunAt = 0;

export async function runUpdateCheck(): Promise<void> {
  if (Date.now() - lastRunAt < CHECK_INTERVAL_MS) return;
  lastRunAt = Date.now();

  try {
    const res = await fetch(`${API_URL}/api/system/internal-check`, {
      method: 'POST',
      headers: { 'x-cron-secret': env.CRON_SECRET },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'update check returned non-OK');
      return;
    }
    logger.debug('update check completed');
  } catch (err) {
    const isNetworkErr = err instanceof TypeError && err.message === 'fetch failed';
    if (isNetworkErr) {
      logger.debug('update check: api unreachable, will retry next interval');
    } else {
      logger.error({ err }, 'update check error');
    }
  }
}
```

- [ ] **Step 2: Register it in the worker loop**

In `apps/worker/src/index.ts`:

Add the import (after line 13, `runPipelineReminders`):

```ts
import { runUpdateCheck } from './jobs/update-check';
```

Add to the job sequence inside the interval (after `await runPipelineReminders(db);`, line 40):

```ts
      await runUpdateCheck();
```

Add to the on-boot section (after line 52, the initial `runWebsitePing()` call):

```ts
runUpdateCheck().catch((err: unknown) => logger.error({ err }, 'initial update check error'));
```

(The job self-throttles to every 6 h; the boot call resets `lastRunAt`, so the loop call is a no-op for the next 6 h.)

- [ ] **Step 3: Type-check**

Run: `rtk pnpm --filter @vencore/worker lint`
Expected: no errors. (If no `lint` script exists, run `rtk pnpm --filter @vencore/worker build`.)

- [ ] **Step 4: Commit**

```bash
rtk git add apps/worker/src/jobs/update-check.ts apps/worker/src/index.ts
rtk git commit -m "feat(worker): 6-hourly update check job"
```

---

### Task 8: Updater sidecar app (TDD for pure logic)

**Files:**
- Create: `apps/updater/package.json`
- Create: `apps/updater/tsconfig.json`
- Create: `apps/updater/src/lib.ts`
- Create: `apps/updater/src/index.ts`
- Test: `apps/updater/src/lib.test.ts`
- Create: `Dockerfile.updater`
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

- [ ] **Step 1: Scaffold the package**

Create `apps/updater/package.json`:

```json
{
  "name": "@vencore/updater",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Create `apps/updater/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

Run: `rtk pnpm install`
Expected: lockfile updated, `@vencore/updater` linked into the workspace (pnpm-workspace.yaml already globs `apps/*` — verify with `rtk read pnpm-workspace.yaml` and add `apps/updater` explicitly only if it lists apps individually).

- [ ] **Step 2: Write failing tests for the pure logic**

Create `apps/updater/src/lib.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidVersion, rewriteEnvVersion } from './lib';

describe('isValidVersion', () => {
  it('accepts x.y.z only', () => {
    expect(isValidVersion('1.2.3')).toBe(true);
    expect(isValidVersion('latest')).toBe(false);
    expect(isValidVersion('1.2')).toBe(false);
    expect(isValidVersion('1.2.3;rm -rf /')).toBe(false);
  });
});

describe('rewriteEnvVersion', () => {
  it('replaces VENCORE_VERSION and records the previous value', () => {
    const input = 'JWT_SECRET=abc\nVENCORE_VERSION=1.2.0\nREDIS_URL=redis://redis:6379\n';
    const out = rewriteEnvVersion(input, '1.3.0');
    expect(out).toContain('VENCORE_VERSION=1.3.0');
    expect(out).toContain('VENCORE_PREVIOUS_VERSION=1.2.0');
    expect(out).toContain('JWT_SECRET=abc');
    expect(out.match(/^VENCORE_VERSION=/gm)).toHaveLength(1);
  });

  it('appends VENCORE_VERSION when missing and records no previous', () => {
    const out = rewriteEnvVersion('JWT_SECRET=abc\n', '1.3.0');
    expect(out).toContain('VENCORE_VERSION=1.3.0');
    expect(out).not.toContain('VENCORE_PREVIOUS_VERSION');
  });

  it('overwrites a stale VENCORE_PREVIOUS_VERSION line', () => {
    const input = 'VENCORE_PREVIOUS_VERSION=1.1.0\nVENCORE_VERSION=1.2.0\n';
    const out = rewriteEnvVersion(input, '1.3.0');
    expect(out).toContain('VENCORE_PREVIOUS_VERSION=1.2.0');
    expect(out).not.toContain('VENCORE_PREVIOUS_VERSION=1.1.0');
  });
});
```

Run: `rtk pnpm --filter @vencore/updater test`
Expected: FAIL — `./lib` does not exist.

- [ ] **Step 3: Implement the pure logic**

Create `apps/updater/src/lib.ts`:

```ts
export function isValidVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

export function rewriteEnvVersion(content: string, newVersion: string): string {
  const lines = content.split('\n');
  const currentLine = lines.find(l => l.startsWith('VENCORE_VERSION='));
  const current = currentLine ? currentLine.slice('VENCORE_VERSION='.length).trim() : null;

  const kept = lines.filter(
    l => !l.startsWith('VENCORE_VERSION=') && !l.startsWith('VENCORE_PREVIOUS_VERSION='),
  );
  while (kept.length > 0 && kept.at(-1) === '') kept.pop();

  if (current !== null && current !== '') kept.push(`VENCORE_PREVIOUS_VERSION=${current}`);
  kept.push(`VENCORE_VERSION=${newVersion}`);
  kept.push('');
  return kept.join('\n');
}
```

Run: `rtk pnpm --filter @vencore/updater test`
Expected: PASS.

- [ ] **Step 4: Write the HTTP server**

Create `apps/updater/src/index.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isValidVersion, rewriteEnvVersion } from './lib';

const PORT = 9500;
const INSTALL_DIR = process.env['VENCORE_COMPOSE_DIR'] ?? '/vencore';
const SECRET = process.env['UPDATER_SECRET'];
// Host-side path of the install dir; needed so the self-update helper
// container can bind-mount it. Written to .env by the installer.
const HOST_INSTALL_DIR = process.env['VENCORE_INSTALL_DIR'];

type State = 'idle' | 'pulling' | 'recreating' | 'error';

let state: State = 'idle';
let targetVersion: string | null = null;
let startedAt: string | null = null;
const log: string[] = [];

function pushLog(chunk: string): void {
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) log.push(trimmed);
  }
  while (log.length > 50) log.shift();
}

function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    pushLog(`$ ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      cwd: INSTALL_DIR,
      env: { ...process.env, ...extraEnv },
    });
    child.stdout.on('data', d => pushLog(String(d)));
    child.stderr.on('data', d => pushLog(String(d)));
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} exited with code ${code}`)),
    );
  });
}

async function runUpdate(version: string): Promise<void> {
  try {
    state = 'pulling';
    targetVersion = version;
    startedAt = new Date().toISOString();

    // Pull before switch — a failed pull leaves the running stack untouched.
    // VENCORE_VERSION in the process env overrides the .env value for compose.
    await run('docker', ['compose', 'pull', 'web', 'api', 'worker'], { VENCORE_VERSION: version });

    const envPath = join(INSTALL_DIR, '.env');
    writeFileSync(envPath, rewriteEnvVersion(readFileSync(envPath, 'utf8'), version));

    state = 'recreating';
    await run('docker', ['compose', 'up', '-d', 'web', 'api', 'worker']);

    if (HOST_INSTALL_DIR) {
      // Recreating this container from within kills the compose process
      // mid-flight, so a detached helper container does it instead.
      await run('docker', [
        'run', '-d', '--rm',
        '-v', '/var/run/docker.sock:/var/run/docker.sock',
        '-v', `${HOST_INSTALL_DIR}:/vencore`,
        '-w', '/vencore',
        'docker:cli',
        'docker', 'compose', 'up', '-d', 'updater',
      ]);
    } else {
      pushLog('VENCORE_INSTALL_DIR not set — skipping updater self-update');
    }

    state = 'idle';
    pushLog(`update to ${version} complete`);
  } catch (err) {
    state = 'error';
    pushLog(err instanceof Error ? err.message : String(err));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += String(c); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  void (async () => {
    if (!SECRET || req.headers['x-updater-secret'] !== SECRET) {
      return send(res, 401, { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid updater secret' } });
    }

    if (req.method === 'GET' && req.url === '/status') {
      return send(res, 200, { data: { state, targetVersion, startedAt, log }, error: null });
    }

    if (req.method === 'POST' && req.url === '/update') {
      if (state === 'pulling' || state === 'recreating') {
        return send(res, 409, { data: null, error: { code: 'UPDATE_IN_PROGRESS', message: 'An update is already running' } });
      }
      let version: unknown;
      try {
        version = (JSON.parse(await readBody(req)) as { version?: unknown }).version;
      } catch {
        return send(res, 400, { data: null, error: { code: 'INVALID_INPUT', message: 'Body must be JSON' } });
      }
      if (typeof version !== 'string' || !isValidVersion(version)) {
        return send(res, 400, { data: null, error: { code: 'INVALID_INPUT', message: 'version must be x.y.z' } });
      }
      void runUpdate(version);
      return send(res, 202, { data: { started: true, targetVersion: version }, error: null });
    }

    return send(res, 404, { data: null, error: { code: 'NOT_FOUND', message: 'Not found' } });
  })().catch(() => {
    send(res, 500, { data: null, error: { code: 'INTERNAL', message: 'Internal error' } });
  });
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ msg: 'updater listening', port: PORT }));
});
```

- [ ] **Step 5: Type-check and test**

Run: `rtk pnpm --filter @vencore/updater lint && rtk pnpm --filter @vencore/updater test`
Expected: no type errors, tests pass.

- [ ] **Step 6: Write the Dockerfile**

Create `Dockerfile.updater` (repo root, next to the other Dockerfiles):

```dockerfile
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/updater/package.json ./apps/updater/package.json
RUN pnpm install --frozen-lockfile --filter @vencore/updater
COPY apps/updater/ ./apps/updater/
RUN pnpm --filter @vencore/updater build

FROM node:20-alpine
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /vencore
COPY --from=build /app/apps/updater/dist /updater/dist
ARG VENCORE_VERSION=0.0.0-dev
ENV VENCORE_VERSION=$VENCORE_VERSION
ENV NODE_ENV=production
EXPOSE 9500
CMD ["node", "/updater/dist/index.js"]
```

Note: no `HEALTHCHECK` and no published ports — the container is internal-only.

- [ ] **Step 7: Verify the image builds**

Run: `rtk docker build -f Dockerfile.updater -t vencore-updater-test .`
Expected: builds successfully. (If `pnpm install --frozen-lockfile --filter` fails on missing workspace manifests, fall back to copying all workspace `package.json` files exactly as `Dockerfile.api` lines 8–17 do, then keep the filtered build step.)

- [ ] **Step 8: Commit**

```bash
rtk git add apps/updater pnpm-lock.yaml Dockerfile.updater
rtk git commit -m "feat(updater): sidecar service that pulls images and recreates the stack"
```

---

### Task 9: Bake `VENCORE_VERSION` into images + publish updater image

**Files:**
- Modify: `Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`
- Modify: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Add the build arg to the three app Dockerfiles**

In each of `Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`, add immediately before the final `CMD` line (for multi-stage `Dockerfile.web`, in the final stage):

```dockerfile
ARG VENCORE_VERSION=0.0.0-dev
ENV VENCORE_VERSION=$VENCORE_VERSION
```

- [ ] **Step 2: Update the publish workflow**

In `.github/workflows/docker-publish.yml`:

Add the updater to the matrix (after the `vencore-worker` entry, line 28):

```yaml
          - image: vencore-updater
            dockerfile: Dockerfile.updater
```

Add build args to the `Build and push` step's `with:` block (after `labels:`, line 61):

```yaml
          build-args: |
            VENCORE_VERSION=${{ steps.meta.outputs.version }}
```

Note: for main-branch builds `steps.meta.outputs.version` is `latest` (not semver) — `isSemver()` guards make such builds report no updates, which is correct for dev images.

- [ ] **Step 3: Validate the workflow syntax**

Run: `rtk npx yaml-lint .github/workflows/docker-publish.yml` — or if that tool isn't available, visually confirm indentation matches sibling keys (`tags:`, `labels:`).
Expected: valid YAML.

- [ ] **Step 4: Commit**

```bash
rtk git add Dockerfile.api Dockerfile.web Dockerfile.worker .github/workflows/docker-publish.yml
rtk git commit -m "feat(ci): bake VENCORE_VERSION into images and publish updater image"
```

---

### Task 10: Compose + installers

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `install/install.sh`
- Modify: `install/install.ps1`

- [ ] **Step 1: Update `docker-compose.prod.yml`**

Change the three image lines to pinned-with-fallback form:

```yaml
    image: ghcr.io/vencorehq/vencore-web:${VENCORE_VERSION:-latest}
```
```yaml
    image: ghcr.io/vencorehq/vencore-api:${VENCORE_VERSION:-latest}
```
```yaml
    image: ghcr.io/vencorehq/vencore-worker:${VENCORE_VERSION:-latest}
```

Add the updater service (after the `worker` service block):

```yaml
  updater:
    image: ghcr.io/vencorehq/vencore-updater:${VENCORE_VERSION:-latest}
    env_file: .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - .:/vencore
    restart: unless-stopped
```

(No `ports:` — it must stay internal. The `.:/vencore` bind resolves to the compose-file directory on the host.)

- [ ] **Step 2: Update `install/install.sh`**

Apply the same compose changes inside the `write_compose()` heredoc (image tags + updater service).

Add a version resolver function after `detect_ip()` (line 25):

```bash
resolve_version() {
  local token tags
  token=$(curl -fsSL "https://ghcr.io/token?service=ghcr.io&scope=repository:vencorehq/vencore-api:pull" 2>/dev/null \
    | sed -n 's/.*"token" *: *"\([^"]*\)".*/\1/p') || true
  if [ -n "${token:-}" ]; then
    tags=$(curl -fsSL -H "Authorization: Bearer $token" \
      "https://ghcr.io/v2/vencorehq/vencore-api/tags/list?n=1000" 2>/dev/null) || true
    echo "$tags" | tr '",' '\n\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
      | sort -t. -k1,1n -k2,2n -k3,3n | tail -1
  fi
}
```

In `write_env()`, add these lines to the heredoc (after `AGENT_SIGNING_SECRET`/`SSH_ENCRYPTION_KEY` block):

```bash
UPDATER_SECRET=$(gen_secret)

# Updater (managed by the in-app updater — do not edit by hand)
VENCORE_VERSION=${RESOLVED_VERSION}
VENCORE_INSTALL_DIR=${INSTALL_DIR}
```

And in `main()`, before `write_env` is called, resolve the version:

```bash
  log "Resolving latest release version..."
  RESOLVED_VERSION=$(resolve_version)
  RESOLVED_VERSION=${RESOLVED_VERSION:-latest}
  ok "Installing version: $RESOLVED_VERSION"
```

Also update the "Useful commands" footer: replace the manual update line with:

```bash
  echo "    Updates: Settings → Updates in the dashboard (or docker compose pull && docker compose up -d)"
```

- [ ] **Step 3: Update `install/install.ps1`**

Mirror the same three changes in PowerShell:

Compose heredoc: same image-tag and updater-service changes as Step 1.

Version resolver (add after `Get-LocalIP`):

```powershell
function Resolve-Version {
    try {
        $tok = (Invoke-RestMethod "https://ghcr.io/token?service=ghcr.io&scope=repository:vencorehq/vencore-api:pull").token
        $tags = (Invoke-RestMethod "https://ghcr.io/v2/vencorehq/vencore-api/tags/list?n=1000" -Headers @{ Authorization = "Bearer $tok" }).tags
        $semvers = $tags | Where-Object { $_ -match '^\d+\.\d+\.\d+$' } | Sort-Object { [version]$_ }
        if ($semvers) { return $semvers[-1] }
    } catch {}
    return 'latest'
}
```

.env writer: `Write-Env` (line 106) uses a double-quoted here-string, so `$(...)` and `$VAR` interpolate. Add `UPDATER_SECRET=$(New-Secret)` under the other secrets (after `SSH_ENCRYPTION_KEY`, line 116), and after the `COOKIE_SECURE=false` line add:

```
# Updater (managed by the in-app updater - do not edit by hand)
VENCORE_VERSION=$script:ResolvedVersion
VENCORE_INSTALL_DIR=$INSTALL_DIR
```

In the main flow, before the `.env` block (before line 155, `if (Test-Path "$INSTALL_DIR\.env")`), add:

```powershell
Write-Log "Resolving latest release version..."
$script:ResolvedVersion = Resolve-Version
Write-Ok "Installing version: $script:ResolvedVersion"
```

(`$script:` scope makes the value visible inside the `Write-Env` function's here-string.)

- [ ] **Step 4: Sanity-check the bash script**

Run: `rtk bash -n install/install.sh`
Expected: no syntax errors.

- [ ] **Step 5: Commit**

```bash
rtk git add docker-compose.prod.yml install/install.sh install/install.ps1
rtk git commit -m "feat(install): pinned versions, updater sidecar, and updater secret"
```

---

### Task 11: Web — Updates settings page + nav link + About version

**Files:**
- Create: `apps/web/app/(dashboard)/settings/updates/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx` (nav link)
- Modify: `apps/web/app/(dashboard)/settings/about/page.tsx` (version from API)

There is no web unit-test infrastructure; verification is manual (Step 5).

- [ ] **Step 1: Add the nav link**

In `apps/web/app/(dashboard)/settings/layout.tsx`, add to the `Workspace` group's `links` array (after `{ href: '/settings/ssh', label: 'SSH Keys' }`, line 56):

```ts
      { href: '/settings/updates', label: 'Updates' },
```

The group is already `adminOnly: true`, so non-admins are redirected automatically.

- [ ] **Step 2: Create the Updates page**

Create `apps/web/app/(dashboard)/settings/updates/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/modules/shared/lib/api';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  lastCheckedAt: string | null;
}

interface UpdaterStatus {
  state: 'idle' | 'pulling' | 'recreating' | 'error' | 'unavailable' | 'unreachable';
  targetVersion?: string | null;
  log?: string[];
}

type Phase = 'ready' | 'confirming' | 'updating' | 'waiting' | 'done' | 'failed';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
};

function majorOf(v: string): number {
  return Number(v.split('.')[0] ?? 0);
}

export default function UpdatesPage() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: UpdateInfo }>('/api/system/update-info');
      setInfo(res.data);
      if (res.data.latestVersion) {
        localStorage.setItem('vencore-update-dismissed', res.data.latestVersion);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load update info');
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadInfo]);

  const checkNow = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: UpdateInfo }>('/api/system/check-updates', { method: 'POST' });
      setInfo(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const startPolling = (target: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ data: UpdaterStatus }>('/api/system/update-status');
        setStatus(res.data);
        if (res.data.state === 'error') {
          setPhase('failed');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // API is down — the recreate window. Switch to waiting for it to return.
        setPhase('waiting');
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const v = await apiFetch<{ data: { version: string } }>('/api/system/version');
            if (v.data.version === target) {
              if (pollRef.current) clearInterval(pollRef.current);
              setPhase('done');
              setTimeout(() => window.location.reload(), 1500);
            }
          } catch {
            /* still restarting */
          }
        }, 3000);
      }
    }, 2000);
  };

  const startUpdate = async () => {
    if (!info?.latestVersion) return;
    setError(null);
    try {
      await apiFetch('/api/system/update', {
        method: 'POST',
        body: JSON.stringify({ version: info.latestVersion }),
      });
      setPhase('updating');
      startPolling(info.latestVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed to start');
      setPhase('ready');
    }
  };

  const isMajor =
    info?.latestVersion != null &&
    /^\d+\.\d+\.\d+$/.test(info.currentVersion) &&
    majorOf(info.latestVersion) > majorOf(info.currentVersion);

  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid var(--border)',
  };
  const label: React.CSSProperties = { fontSize: 12, color: 'var(--text3)', fontWeight: 500 };
  const value: React.CSSProperties = { fontSize: 13, color: 'var(--text)' };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Updates</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Keep this instance up to date.
      </p>

      <div style={card}>
        <div style={row}>
          <span style={label}>Current version</span>
          <span style={value}>{info?.currentVersion ?? '…'}</span>
        </div>
        <div style={row}>
          <span style={label}>Latest version</span>
          <span style={value}>{info?.latestVersion ?? 'unknown'}</span>
        </div>
        <div style={row}>
          <span style={label}>Last checked</span>
          <span style={value}>
            {info?.lastCheckedAt ? new Date(info.lastCheckedAt).toLocaleString() : 'never'}
          </span>
        </div>
        {info?.releaseUrl && (
          <div style={row}>
            <span style={label}>Release notes</span>
            <a href={info.releaseUrl} target="_blank" rel="noreferrer" style={{ ...value, textDecoration: 'underline' }}>
              View on GitHub
            </a>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 10px', borderRadius: 8, marginTop: 12 }}>
            {error}
          </p>
        )}

        {phase === 'ready' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={() => void checkNow()} disabled={checking}>
              {checking ? 'Checking…' : 'Check now'}
            </button>
            {info?.updateAvailable && (
              <button className="btn btn-primary" onClick={() => setPhase('confirming')}>
                Update to {info.latestVersion}
              </button>
            )}
          </div>
        )}

        {phase === 'confirming' && info?.latestVersion && (
          <div style={{ marginTop: 16, padding: 14, background: isMajor ? 'var(--amber-bg)' : 'var(--surface2)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, margin: '0 0 10px', color: isMajor ? 'var(--amber)' : 'var(--text)' }}>
              {isMajor
                ? `This is a major version upgrade (${info.currentVersion} → ${info.latestVersion}) and may include breaking changes. Type the version to confirm.`
                : `Update from ${info.currentVersion} to ${info.latestVersion}? The app will restart briefly.`}
            </p>
            {isMajor && (
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={info.latestVersion}
                style={{ width: '100%', marginBottom: 10, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={isMajor && confirmText !== info.latestVersion}
                onClick={() => void startUpdate()}
              >
                Update now
              </button>
              <button className="btn" onClick={() => { setPhase('ready'); setConfirmText(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {(phase === 'updating' || phase === 'waiting') && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface2)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, margin: 0, fontWeight: 500 }}>
              {phase === 'updating'
                ? status?.state === 'recreating'
                  ? 'Restarting services…'
                  : 'Pulling new images…'
                : 'Waiting for services to come back…'}
            </p>
            {status?.log && status.log.length > 0 && (
              <pre style={{ fontSize: 11, color: 'var(--text2)', maxHeight: 160, overflow: 'auto', marginTop: 10, marginBottom: 0 }}>
                {status.log.slice(-12).join('\n')}
              </pre>
            )}
          </div>
        )}

        {phase === 'done' && (
          <p style={{ fontSize: 13, color: 'var(--green)', background: 'var(--green-bg)', padding: '8px 10px', borderRadius: 8, marginTop: 16 }}>
            Updated successfully — reloading…
          </p>
        )}

        {phase === 'failed' && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--red-bg)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--red)', margin: '0 0 8px', fontWeight: 500 }}>Update failed.</p>
            {status?.log && (
              <pre style={{ fontSize: 11, color: 'var(--text2)', maxHeight: 160, overflow: 'auto', margin: '0 0 8px' }}>
                {status.log.slice(-12).join('\n')}
              </pre>
            )}
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              To roll back manually: set VENCORE_VERSION back to the value of VENCORE_PREVIOUS_VERSION in your install
              directory&apos;s .env, then run <code>docker compose up -d</code>.
            </p>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => { setPhase('ready'); setStatus(null); }}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: if the codebase has no global `.btn` / `.btn-primary` classes (check `apps/web/app/globals.css`), use the shared `Button` component from `@/modules/shared/components/ui/Button` instead, matching how other settings pages render buttons.

- [ ] **Step 3: About page shows the API-reported version**

In `apps/web/app/(dashboard)/settings/about/page.tsx`, replace the `webPackageJson` import and usage:

Remove line 3 (`import webPackageJson from '../../../../package.json';`) and add:

```tsx
import { useEffect, useState } from 'react';
import { apiFetch } from '@/modules/shared/lib/api';
```

Inside the component, before `card`:

```tsx
  const [version, setVersion] = useState('…');
  useEffect(() => {
    apiFetch<{ data: { version: string } }>('/api/system/version')
      .then(r => setVersion(r.data.version))
      .catch(() => setVersion('unknown'));
  }, []);
```

Then replace both `webPackageJson.version` usages (lines 28 and 32) with `version`.

- [ ] **Step 4: Type-check the web app**

Run: `rtk pnpm --filter web lint` (or the web package's actual name — check `apps/web/package.json` `name` field and use it in the filter).
Expected: no type errors.

- [ ] **Step 5: Manual verification**

Start the dev stack (`rtk pnpm dev` or per-app dev commands) with `VENCORE_VERSION=1.0.0` set in `apps/api/.env`. As an admin:
1. Visit Settings → Updates: current version shows `1.0.0`.
2. Click "Check now": latest version populates from GHCR (or shows an error banner if GHCR has no semver tags yet — both acceptable).
3. Visit Settings → About: version row shows `1.0.0` (API-reported), not the web package.json version.
4. As a member (non-admin), confirm `/settings/updates` redirects to `/settings/profile`.

- [ ] **Step 6: Commit**

```bash
rtk git add "apps/web/app/(dashboard)/settings/updates/page.tsx" "apps/web/app/(dashboard)/settings/layout.tsx" "apps/web/app/(dashboard)/settings/about/page.tsx"
rtk git commit -m "feat(web): updates settings page and API-reported version on about page"
```

---

### Task 12: Sidebar update badge for admins

**Files:**
- Modify: `apps/web/modules/shared/components/Sidebar.tsx`

- [ ] **Step 1: Add an update-available query**

In `Sidebar.tsx`, inside the `Sidebar` component, after the `messagingUnread` query (line 198), add:

```tsx
  const isAdmin = user?.role === 'admin';
  const { data: updateAvailable = false } = useQuery({
    queryKey: ['update-badge'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await apiFetch<{ data: { updateAvailable: boolean; latestVersion: string | null } }>(
        '/api/system/update-info',
        { token: await getToken() },
      );
      if (!res.data.updateAvailable || !res.data.latestVersion) return false;
      return localStorage.getItem('vencore-update-dismissed') !== res.data.latestVersion;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
```

(`user`, `getToken`, `useQuery`, and `apiFetch` are already imported/in scope in this file — verify imports at the top and add `apiFetch` if it is not there.)

- [ ] **Step 2: Show the dot on the Settings entry**

In the `NavLink` render inside `NAV_GROUPS.map` (line 244–251), change the `dot` prop:

```tsx
                dot={
                  ('dot' in item && item.dot && hasCritical) ||
                  (item.href === '/settings' && updateAvailable)
                    ? true
                    : undefined
                }
```

The Updates page (Task 11 Step 2) writes `vencore-update-dismissed` to localStorage on load, so visiting the page dismisses the dot for that version.

- [ ] **Step 3: Type-check**

Run: `rtk pnpm --filter web lint` (same filter name as Task 11 Step 4).
Expected: no errors.

- [ ] **Step 4: Manual verification**

With a row in `instance_meta` where `latest_version` is greater than the running version (set via SQL: `UPDATE instance_meta SET latest_version = '99.0.0' WHERE id = 1;`), reload the dashboard as an admin — the Settings nav item shows a pulse dot. Open Settings → Updates, reload — the dot is gone. As a non-admin, no dot ever shows.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/modules/shared/components/Sidebar.tsx
rtk git commit -m "feat(web): sidebar badge when an update is available"
```

---

### Task 13: Final verification + graph update

- [ ] **Step 1: Full repo type-check and tests**

Run:
```bash
rtk pnpm type-check
rtk pnpm --filter @vencore/api test
rtk pnpm --filter @vencore/updater test
```
Expected: all pass. Fix anything that fails before proceeding.

- [ ] **Step 2: Update the knowledge graph**

Run: `graphify update .`
Expected: graph refreshed (new routes, worker job, updater app).

- [ ] **Step 3: Commit any remaining changes**

```bash
rtk git add -A
rtk git commit -m "chore: update knowledge graph for updater feature"
```

(Skip the commit if nothing changed.)

- [ ] **Step 4: End-to-end smoke test (best-effort, local Docker)**

If Docker is available locally and time permits:
1. `rtk docker build -f Dockerfile.updater -t ghcr.io/vencorehq/vencore-updater:0.0.1 .`
2. Create a scratch dir with a minimal `.env` (`UPDATER_SECRET=test`, `VENCORE_VERSION=1.0.0`) and the prod compose file.
3. Run the updater container with the socket + dir mounted, `curl -H "x-updater-secret: test" http://localhost:9500/status` (temporarily publish 9500 for the test).
4. Expected: `{ "data": { "state": "idle", ... } }`.

This validates the container wiring; the full pull/recreate cycle requires published release images and is deferred to the first real release.

---

## Out of scope (from spec)

Unattended auto-update, automatic/one-click rollback, down-migrations, in-place upgrade of existing `:latest` installs, in-dashboard release-notes rendering.
