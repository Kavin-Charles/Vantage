# Marketplace Plugin Listing + Working License System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vencore's plugin page list marketplace plugins and make paid-plugin licensing work end-to-end (per-workspace binding, periodic re-check, auto-disable), plus four hardening fixes on the platform side.

**Architecture:** Vencore (`/home/kavin/Projects/Vencore`) is the white-label product; vencore-platform (`/home/kavin/Projects/vencore-platform`) is the marketplace + license authority. Vencore's API proxies the platform's `v1` API using a service token. Licenses bind to `instance_id = workspace.id`. A Vencore worker polls `/v1/licenses/check` every 30 min and auto-disables plugins whose license is unusable.

**Tech Stack:** TypeScript strict, Express, Kysely, Zod, vitest (both repos), Next.js App Router (Vencore web), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-19-marketplace-plugins-and-license-design.md`

## Global Constraints

- Vencore work happens on branch `feat/marketplace-plugins-license` (already exists). Platform work happens on a new branch `feat/license-hardening` in `/home/kavin/Projects/vencore-platform`. **Never commit to `main` in either repo.**
- Commit messages: Conventional Commits, **no AI attribution / no Co-Authored-By lines** (user's kavin-git rule).
- Vencore: TypeScript strict, no `any` in new code (existing `as Kysely<any>` casts at plugin-runtime call sites are the established pattern — keep them), no `console.log` (use `logger`), Zod validation on route input, all responses `{ data, error }` shape.
- Never modify existing migration files — new migrations only.
- Task order matters: Tasks 1–4 (platform) are independent of 5–9 (Vencore) except Task 7's deactivate payload assumes Task 3's contract. Execute in numbered order.
- Run tests from the repo's `apps/api` directory: `pnpm vitest run <file>` (or `npx vitest run <file>`).

---

## PART A — Platform (`/home/kavin/Projects/vencore-platform`)

**Setup before Task 1:**

```bash
cd /home/kavin/Projects/vencore-platform
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b feat/license-hardening
```

---

### Task 1: `GET /v1/plugins/:idOrSlug` — accept id or slug

**Files:**
- Create: `apps/api/src/lib/uuid.ts`
- Create: `apps/api/src/lib/__tests__/uuid.test.ts`
- Modify: `apps/api/src/routes/v1/plugins.ts` (the `pluginsRouter.get('/:slug', ...)` handler)

**Interfaces:**
- Produces: `isUuid(s: string): boolean` in `apps/api/src/lib/uuid.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/__tests__/uuid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isUuid } from '../uuid';

describe('isUuid', () => {
  it('accepts a v4 uuid', () => {
    expect(isUuid('b3b8c9d0-1234-4abc-9def-0123456789ab')).toBe(true);
  });
  it('accepts uppercase', () => {
    expect(isUuid('B3B8C9D0-1234-4ABC-9DEF-0123456789AB')).toBe(true);
  });
  it('rejects a slug', () => {
    expect(isUuid('crm-enrichment')).toBe(false);
  });
  it('rejects a uuid with trailing junk', () => {
    expect(isUuid('b3b8c9d0-1234-4abc-9def-0123456789ab x')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/kavin/Projects/vencore-platform/apps/api && pnpm vitest run src/lib/__tests__/uuid.test.ts`
Expected: FAIL — cannot resolve `../uuid`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/lib/uuid.ts`:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/uuid.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Use it in the detail route**

In `apps/api/src/routes/v1/plugins.ts`, add the import at the top:

```ts
import { isUuid } from '../../lib/uuid';
```

Then change the detail handler. Replace:

```ts
pluginsRouter.get('/:slug', async (req, res) => {
  const plugin = await db
    .selectFrom('plugins as p')
    .innerJoin('marketplace_users as u', 'u.id', 'p.author_id')
    .selectAll('p')
    .select('u.name as author_name')
    .where('p.slug', '=', req.params.slug)
    .where('p.status', '=', 'approved')
    .executeTakeFirst();
```

with:

```ts
pluginsRouter.get('/:idOrSlug', async (req, res) => {
  const { idOrSlug } = req.params;
  const plugin = await db
    .selectFrom('plugins as p')
    .innerJoin('marketplace_users as u', 'u.id', 'p.author_id')
    .selectAll('p')
    .select('u.name as author_name')
    .where(isUuid(idOrSlug) ? 'p.id' : 'p.slug', '=', idOrSlug)
    .where('p.status', '=', 'approved')
    .executeTakeFirst();
```

The rest of the handler body (install count, signed URLs, response) is unchanged.

- [ ] **Step 6: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/uuid.ts src/lib/__tests__/uuid.test.ts src/routes/v1/plugins.ts
git commit -m "feat(v1): plugin detail lookup accepts id or slug"
```

---

### Task 2: Pure check evaluation + deactivation decision in `license-state.ts`

**Files:**
- Modify: `apps/api/src/lib/license-state.ts`
- Modify: `apps/api/src/lib/__tests__/license-state.test.ts` (append new describes)

**Interfaces:**
- Consumes: existing `resolveState`, `isUsable`, `LicenseSnapshot` from `license-state.ts`.
- Produces (used by Task 3 and Task 4's route rewiring):
  - `evaluateCheck(record, key, instanceId, now)` → `{ entry: { key, valid, status, expires_at, grace_until }, transition: LicenseSnapshot | null }` where `record` is `(LicenseSnapshot & { instance_id: string | null }) | undefined`.
  - `decideDeactivation(boundInstanceId: string | null, callerInstanceId: string)` → `{ ok: true; unbind: boolean } | { ok: false; code: 'BOUND_ELSEWHERE' }`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/lib/__tests__/license-state.test.ts` (it already defines `const NOW` and `const days`):

```ts
import { evaluateCheck, decideDeactivation } from '../license-state';

describe('evaluateCheck', () => {
  const INSTANCE = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';
  const KEY = '33333333-3333-4333-8333-333333333333';

  it('missing record -> not_found, no transition', () => {
    const r = evaluateCheck(undefined, KEY, INSTANCE, NOW);
    expect(r.entry).toEqual({ key: KEY, valid: false, status: 'not_found', expires_at: null, grace_until: null });
    expect(r.transition).toBeNull();
  });

  it('active unexpired bound to caller -> valid, no transition', () => {
    const r = evaluateCheck(
      { status: 'active', expires_at: days(30), grace_until: null, instance_id: INSTANCE },
      KEY, INSTANCE, NOW,
    );
    expect(r.entry.valid).toBe(true);
    expect(r.entry.status).toBe('active');
    expect(r.transition).toBeNull();
  });

  it('active past expiry -> grace with transition to persist', () => {
    const r = evaluateCheck(
      { status: 'active', expires_at: days(-1), grace_until: null, instance_id: INSTANCE },
      KEY, INSTANCE, NOW,
    );
    expect(r.entry.valid).toBe(true);
    expect(r.entry.status).toBe('grace');
    expect(r.transition).not.toBeNull();
    expect(r.transition!.status).toBe('grace');
  });

  it('active far past expiry -> expired with transition', () => {
    const r = evaluateCheck(
      { status: 'active', expires_at: days(-30), grace_until: null, instance_id: INSTANCE },
      KEY, INSTANCE, NOW,
    );
    expect(r.entry.valid).toBe(false);
    expect(r.entry.status).toBe('expired');
    expect(r.transition!.status).toBe('expired');
  });

  it('bound to another instance -> bound_elsewhere, invalid', () => {
    const r = evaluateCheck(
      { status: 'active', expires_at: null, grace_until: null, instance_id: OTHER },
      KEY, INSTANCE, NOW,
    );
    expect(r.entry.valid).toBe(false);
    expect(r.entry.status).toBe('bound_elsewhere');
    expect(r.transition).toBeNull();
  });
});

describe('decideDeactivation', () => {
  const INSTANCE = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';

  it('unbound key -> ok no-op', () => {
    expect(decideDeactivation(null, INSTANCE)).toEqual({ ok: true, unbind: false });
  });
  it('bound to caller -> ok unbind', () => {
    expect(decideDeactivation(INSTANCE, INSTANCE)).toEqual({ ok: true, unbind: true });
  });
  it('bound elsewhere -> rejected', () => {
    expect(decideDeactivation(OTHER, INSTANCE)).toEqual({ ok: false, code: 'BOUND_ELSEWHERE' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/license-state.test.ts`
Expected: FAIL — `evaluateCheck` / `decideDeactivation` not exported.

- [ ] **Step 3: Implement in `license-state.ts`**

Append to `apps/api/src/lib/license-state.ts`:

```ts
export interface CheckEntry {
  key: string;
  valid: boolean;
  status: LicenseStatus | 'not_found' | 'bound_elsewhere';
  expires_at: Date | null;
  grace_until: Date | null;
}

export interface CheckEvaluation {
  entry: CheckEntry;
  /** Non-null when the observed state differs from the stored one and should be persisted. */
  transition: LicenseSnapshot | null;
}

/** Pure evaluation of one key for the batch /check endpoint. */
export function evaluateCheck(
  record: (LicenseSnapshot & { instance_id: string | null }) | undefined,
  key: string,
  instanceId: string,
  now: Date,
): CheckEvaluation {
  if (!record) {
    return {
      entry: { key, valid: false, status: 'not_found', expires_at: null, grace_until: null },
      transition: null,
    };
  }
  const state = resolveState(record, now);
  const boundElsewhere = record.instance_id !== null && record.instance_id !== instanceId;
  return {
    entry: {
      key,
      valid: isUsable(state.status) && !boundElsewhere,
      status: boundElsewhere ? 'bound_elsewhere' : state.status,
      expires_at: state.expires_at,
      grace_until: state.grace_until,
    },
    transition: state.status !== record.status ? state : null,
  };
}

export type DeactivationDecision =
  | { ok: true; unbind: boolean }
  | { ok: false; code: 'BOUND_ELSEWHERE' };

/** Only the bound instance may unbind a key; unbound keys deactivate as a no-op. */
export function decideDeactivation(
  boundInstanceId: string | null,
  callerInstanceId: string,
): DeactivationDecision {
  if (boundInstanceId === null) return { ok: true, unbind: false };
  if (boundInstanceId !== callerInstanceId) return { ok: false, code: 'BOUND_ELSEWHERE' };
  return { ok: true, unbind: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/license-state.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/license-state.ts src/lib/__tests__/license-state.test.ts
git commit -m "feat(license): pure check evaluation and deactivation decision"
```

---

### Task 3: Secure `/v1/licenses/deactivate` + `/check` persists transitions

**Files:**
- Modify: `apps/api/src/routes/v1/licenses.ts`

**Interfaces:**
- Consumes: `evaluateCheck`, `decideDeactivation` from Task 2; existing `logLicenseEvent`.
- Produces: `POST /v1/licenses/deactivate` now requires `instance_id` (uuid) and returns 409 `BOUND_ELSEWHERE` when the key is bound to a different instance. `/check` request/response shape unchanged.

No new unit tests here — the decision logic was tested in Task 2; this task is route wiring, verified by typecheck + full suite + manual verification at the end (Task 10).

- [ ] **Step 1: Update imports**

In `apps/api/src/routes/v1/licenses.ts` change:

```ts
import { decideValidation, resolveState, isUsable } from '../../lib/license-state';
```

to:

```ts
import { decideValidation, evaluateCheck, decideDeactivation } from '../../lib/license-state';
```

(`resolveState` and `isUsable` become unused after the `/check` rewrite below — remove them.)

- [ ] **Step 2: Rewrite the deactivate route**

Replace `DeactivateBody` and the `/deactivate` handler with:

```ts
const DeactivateBody = z.object({
  plugin_id:    z.string().uuid(),
  key:          z.string().uuid(),
  instance_id:  z.string().uuid(),
  workspace_id: z.string().uuid().optional(), // legacy, ignored
});

licensesRouter.post('/deactivate', async (req, res) => {
  const parsed = DeactivateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: { code: 'BAD_REQUEST', message: parsed.error.issues[0].message } });
    return;
  }
  const { plugin_id, key, instance_id } = parsed.data;

  const record = await db
    .selectFrom('license_keys')
    .select(['id', 'instance_id'])
    .where('key', '=', key)
    .where('plugin_id', '=', plugin_id)
    .executeTakeFirst();

  if (!record) {
    res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Invalid license key' } });
    return;
  }

  const decision = decideDeactivation(record.instance_id, instance_id);
  if (!decision.ok) {
    res.status(409).json({ data: null, error: { code: 'BOUND_ELSEWHERE', message: ERROR_MESSAGE.BOUND_ELSEWHERE } });
    return;
  }

  if (decision.unbind) {
    await db
      .updateTable('license_keys')
      .set({ instance_id: null, workspace_id: null, callback_url: null, callback_secret: null, instance_name: null, instance_domain: null })
      .where('id', '=', record.id)
      .execute();
    await logLicenseEvent(record.id, 'unbound', { via: 'instance' });
  }

  res.json({ data: { deactivated: true }, error: null });
});
```

- [ ] **Step 3: Rewrite the `/check` handler to use `evaluateCheck` and persist transitions**

Replace the body of the `/check` handler after the `parsed` guard with:

```ts
  const { instance_id, keys } = parsed.data;
  const now = new Date();

  const records = await db
    .selectFrom('license_keys')
    .selectAll()
    .where('key', 'in', keys)
    .execute();

  const byKey = new Map(records.map((r) => [r.key, r]));

  const data = [];
  for (const key of keys) {
    const record = byKey.get(key);
    const { entry, transition } = evaluateCheck(record, key, instance_id, now);
    if (record && transition) {
      // Persist the lazily-observed state change (mirrors /validate)
      await db
        .updateTable('license_keys')
        .set({ status: transition.status, grace_until: transition.grace_until })
        .where('id', '=', record.id)
        .execute();
      if (transition.status === 'expired') await logLicenseEvent(record.id, 'expired');
    }
    data.push(entry);
  }

  res.json({ data, error: null });
```

- [ ] **Step 4: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm vitest run`
Expected: clean. If `tsc` flags unused imports, remove them.

- [ ] **Step 5: Commit**

```bash
git add src/routes/v1/licenses.ts
git commit -m "feat(v1): instance-checked deactivate; /check persists observed state transitions"
```

---

### Task 4: `last_checked_at` telemetry

**Files:**
- Create: `apps/api/src/db/migrations/010_license_last_checked.ts`
- Modify: `apps/api/src/db/types.ts` (LicenseKeysTable)
- Modify: `apps/api/src/routes/v1/licenses.ts` (validate + check set it)
- Modify: `apps/api/src/routes/admin/licenses.ts` (expose in list select)

**Interfaces:**
- Produces: `license_keys.last_checked_at: timestamptz | null`, set on every successful validate and on every `/check` for keys visible to the caller; returned by `GET /admin/licenses`.

- [ ] **Step 1: Migration**

Create `apps/api/src/db/migrations/010_license_last_checked.ts`:

```ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('license_keys')
    .addColumn('last_checked_at', 'timestamptz')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('license_keys').dropColumn('last_checked_at').execute();
}
```

- [ ] **Step 2: Type**

In `apps/api/src/db/types.ts`, inside `LicenseKeysTable` after `razorpay_subscription_id`:

```ts
  last_checked_at: ColumnType<Date | null, Date | null, Date | null>;
```

- [ ] **Step 3: Set it in `/validate`**

In `apps/api/src/routes/v1/licenses.ts` validate handler, in the bind branch change the update `.set(...)` to include it:

```ts
      .set({ instance_id, workspace_id: null, activated_at: record.activated_at ?? now, last_checked_at: now, ...metadata })
```

and in the non-bind (else) branch:

```ts
    await db.updateTable('license_keys').set({ ...metadata, last_checked_at: now }).where('id', '=', record.id).execute();
```

- [ ] **Step 4: Set it in `/check`**

In the `/check` handler (as rewritten in Task 3), after building `data` and before `res.json`, add one batch update covering keys the caller may see (bound to it or unbound):

```ts
  await db
    .updateTable('license_keys')
    .set({ last_checked_at: now })
    .where('key', 'in', keys)
    .where((eb) => eb.or([
      eb('instance_id', 'is', null),
      eb('instance_id', '=', instance_id),
    ]))
    .execute();
```

- [ ] **Step 5: Expose in admin list**

In `apps/api/src/routes/admin/licenses.ts`, the list handler's `.select([...])` array (around line 18) — append `'lk.last_checked_at'` to the array.

- [ ] **Step 6: Run migration + typecheck + tests**

Run: `pnpm migrate` (needs the platform DB running; if unavailable, note it and continue — migration will run on next deploy) then `pnpm exec tsc --noEmit && pnpm vitest run`.
Expected: migration applies `010_license_last_checked`; typecheck and tests clean.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/010_license_last_checked.ts src/db/types.ts src/routes/v1/licenses.ts src/routes/admin/licenses.ts
git commit -m "feat(license): last_checked_at telemetry on validate and check"
```

---

## PART B — Vencore (`/home/kavin/Projects/Vencore`)

All on existing branch `feat/marketplace-plugins-license`. `cd /home/kavin/Projects/Vencore` and confirm with `git branch --show-current`.

---

### Task 5: Migration + schema for `license_status` / `license_checked_at`

**Files:**
- Create: `packages/db/migrations/20260719_001_workspace_plugins_license_status.ts`
- Modify: `packages/db/src/schema.ts` (`WorkspacePluginTable`, ends near line 687)

**Interfaces:**
- Produces: `workspace_plugins.license_status` (`'active' | 'grace' | 'expired' | 'revoked' | 'bound_elsewhere' | 'not_found' | null`) and `workspace_plugins.license_checked_at: Date | null`, used by Tasks 6–9.

- [ ] **Step 1: Write the migration**

Create `packages/db/migrations/20260719_001_workspace_plugins_license_status.ts`:

```ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * License health for paid marketplace plugins, written by the install/enable
 * routes and the license-check worker. Mirrors the platform's status values
 * plus the two client-side outcomes (bound_elsewhere, not_found).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('license_status', sql`varchar(24)`, col => col)
    .execute();

  await db.schema
    .alterTable('workspace_plugins')
    .addColumn('license_checked_at', 'timestamptz', col => col)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workspace_plugins').dropColumn('license_checked_at').execute();
  await db.schema.alterTable('workspace_plugins').dropColumn('license_status').execute();
}
```

- [ ] **Step 2: Update the Kysely type**

In `packages/db/src/schema.ts`, `WorkspacePluginTable` — after `platform_plugin_id: string | null;` add:

```ts
  license_status: 'active' | 'grace' | 'expired' | 'revoked' | 'bound_elsewhere' | 'not_found' | null;
  license_checked_at: Date | null;
```

- [ ] **Step 3: Typecheck the workspace**

Run: `cd /home/kavin/Projects/Vencore/apps/api && pnpm lint`
Expected: clean (`lint` is `tsc --noEmit`).

- [ ] **Step 4: Commit**

```bash
cd /home/kavin/Projects/Vencore
git add packages/db/migrations/20260719_001_workspace_plugins_license_status.ts packages/db/src/schema.ts
git commit -m "feat(db): workspace_plugins license_status + license_checked_at"
```

---

### Task 6: License payload builder lib

**Files:**
- Create: `apps/api/src/lib/marketplace-license.ts`
- Create: `apps/api/src/__tests__/marketplace-license.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 7 and 8):
  - `buildLicenseValidatePayload(workspace: { id: string; name: string; domain: string | null }, platformPluginId: string, key: string)` → `{ plugin_id, key, instance_id, instance_name, instance_domain? }`
  - `buildLicenseDeactivatePayload(workspaceId: string, platformPluginId: string, key: string)` → `{ plugin_id, key, instance_id }`
  - `USABLE_LICENSE_STATUSES: ReadonlySet<string>` = `{'active', 'grace'}`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/marketplace-license.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildLicenseValidatePayload,
  buildLicenseDeactivatePayload,
  USABLE_LICENSE_STATUSES,
} from '../lib/marketplace-license';

const WS = { id: 'ws-uuid-1', name: 'Acme Inc', domain: 'acme.example.com' };

describe('buildLicenseValidatePayload', () => {
  it('binds by workspace id as instance_id and never sends workspace_id', () => {
    const p = buildLicenseValidatePayload(WS, 'plugin-uuid', 'key-uuid');
    expect(p).toEqual({
      plugin_id: 'plugin-uuid',
      key: 'key-uuid',
      instance_id: 'ws-uuid-1',
      instance_name: 'Acme Inc',
      instance_domain: 'acme.example.com',
    });
    expect('workspace_id' in p).toBe(false);
  });

  it('omits instance_domain when workspace has none', () => {
    const p = buildLicenseValidatePayload({ ...WS, domain: null }, 'plugin-uuid', 'key-uuid');
    expect('instance_domain' in p).toBe(false);
  });
});

describe('buildLicenseDeactivatePayload', () => {
  it('includes instance_id for the secure deactivate contract', () => {
    expect(buildLicenseDeactivatePayload('ws-uuid-1', 'plugin-uuid', 'key-uuid')).toEqual({
      plugin_id: 'plugin-uuid',
      key: 'key-uuid',
      instance_id: 'ws-uuid-1',
    });
  });
});

describe('USABLE_LICENSE_STATUSES', () => {
  it('treats active and grace as usable, everything else not', () => {
    expect(USABLE_LICENSE_STATUSES.has('active')).toBe(true);
    expect(USABLE_LICENSE_STATUSES.has('grace')).toBe(true);
    expect(USABLE_LICENSE_STATUSES.has('expired')).toBe(false);
    expect(USABLE_LICENSE_STATUSES.has('revoked')).toBe(false);
    expect(USABLE_LICENSE_STATUSES.has('bound_elsewhere')).toBe(false);
    expect(USABLE_LICENSE_STATUSES.has('not_found')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/kavin/Projects/Vencore/apps/api && pnpm exec vitest run src/__tests__/marketplace-license.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/marketplace-license.ts`:

```ts
/**
 * Payload builders for the platform's v1 license API.
 * A Vencore "instance" from the platform's perspective is one workspace:
 * instance_id = workspace.id, so each workspace activates its own key.
 */

export interface LicenseValidatePayload {
  plugin_id: string;
  key: string;
  instance_id: string;
  instance_name: string;
  instance_domain?: string;
}

export function buildLicenseValidatePayload(
  workspace: { id: string; name: string; domain: string | null },
  platformPluginId: string,
  key: string,
): LicenseValidatePayload {
  return {
    plugin_id: platformPluginId,
    key,
    instance_id: workspace.id,
    instance_name: workspace.name,
    ...(workspace.domain ? { instance_domain: workspace.domain } : {}),
  };
}

export interface LicenseDeactivatePayload {
  plugin_id: string;
  key: string;
  instance_id: string;
}

export function buildLicenseDeactivatePayload(
  workspaceId: string,
  platformPluginId: string,
  key: string,
): LicenseDeactivatePayload {
  return { plugin_id: platformPluginId, key, instance_id: workspaceId };
}

/** Statuses under which a paid plugin may keep running (grace warns, never disables). */
export const USABLE_LICENSE_STATUSES: ReadonlySet<string> = new Set(['active', 'grace']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/__tests__/marketplace-license.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/kavin/Projects/Vencore
git add apps/api/src/lib/marketplace-license.ts apps/api/src/__tests__/marketplace-license.test.ts
git commit -m "feat(api): license payload builders for platform v1 contract"
```

---

### Task 7: Fix both routes in `apps/api/src/routes/plugins.ts`

**Files:**
- Modify: `apps/api/src/routes/plugins.ts` — install route (`POST /marketplace/install/:platformPluginId`, ~line 387) and toggle route (`PATCH /:id`, ~line 870)

**Interfaces:**
- Consumes: `buildLicenseValidatePayload`, `buildLicenseDeactivatePayload` from Task 6; `license_status` columns from Task 5.
- Produces: `POST /api/plugins/marketplace/install/:slug` (param renamed — UI updated in Task 9). Error codes from the platform (`EXPIRED`, `REVOKED`, `BOUND_ELSEWHERE`, `NOT_FOUND`) pass through unchanged (already the behavior — `licJson.error` is forwarded with `licRes.status`).

Route wiring — verified by typecheck + existing suite + Task 10 manual pass.

- [ ] **Step 1: Add import**

Top of `apps/api/src/routes/plugins.ts`, after the `checkVersionRules` import:

```ts
import { buildLicenseValidatePayload, buildLicenseDeactivatePayload } from '../lib/marketplace-license';
```

- [ ] **Step 2: Install route — lookup by slug**

Change the route signature and param:

```ts
  router.post('/marketplace/install/:slug', requireAdmin, async (req, res, next) => {
```

and inside, replace:

```ts
      const { platformPluginId } = req.params as { platformPluginId: string };
```

with:

```ts
      const { slug } = req.params as { slug: string };
```

and the detail fetch:

```ts
      const r = await fetch(`${marketplaceUrl}/v1/plugins/${slug}`, {
        headers: { 'x-service-token': svcToken },
      });
```

(`mp.id` from the response body remains the platform plugin id used everywhere below — no other changes to that flow.)

- [ ] **Step 3: Install route — validate payload**

In the same route's paid branch, replace the validate call body:

```ts
        const licRes = await fetch(`${marketplaceUrl}/v1/licenses/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-service-token': svcToken },
          body: JSON.stringify(buildLicenseValidatePayload(workspace, mp.id, license_key)),
        });
```

- [ ] **Step 4: Install route — record license status**

In the `insertInto('workspace_plugins').values({...})` object add:

```ts
          license_status: isPaid ? 'active' as const : null,
          license_checked_at: isPaid ? new Date() : null,
```

and mirror the same two fields in the `doUpdateSet({...})` object.

Note: `isPaid` is declared *after* the `.values()` call site today (`const isPaid = mp.pricing_type === 'paid';` sits directly above the insert) — it is already in scope; keep it where it is.

- [ ] **Step 5: Toggle route — validate payload on enable**

In `PATCH /:id`, replace the validate call body:

```ts
          const licRes = await fetch(`${marketplaceUrl}/v1/licenses/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-service-token': svcTok },
            body: JSON.stringify(buildLicenseValidatePayload(workspace, existing.platform_plugin_id, key)),
          });
```

and the success update:

```ts
          .set({ enabled: true, license_key: key, license_status: 'active', license_checked_at: new Date() })
```

- [ ] **Step 6: Toggle route — deactivate payload on disable**

Replace the deactivate call body:

```ts
        await fetch(`${marketplaceUrl}/v1/licenses/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-service-token': svcTok },
          body: JSON.stringify(buildLicenseDeactivatePayload(workspace.id, existing.platform_plugin_id, existing.license_key)),
        }).catch(() => { /* non-fatal — key stays in DB, platform may already be deactivated */ });
```

- [ ] **Step 7: Typecheck + full API tests**

Run: `cd apps/api && pnpm lint && pnpm test`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd /home/kavin/Projects/Vencore
git add apps/api/src/routes/plugins.ts
git commit -m "fix(api): align marketplace install and license calls to platform v1 contract"
```

---

### Task 8: License-check worker with auto-disable

**Files:**
- Create: `apps/api/src/lib/plugin-disable.ts`
- Create: `apps/api/src/workers/license-check.ts`
- Create: `apps/api/src/__tests__/license-check.test.ts`
- Modify: `apps/api/src/index.ts` (import + start)

**Interfaces:**
- Consumes: `USABLE_LICENSE_STATUSES` from Task 6; `license_status` columns from Task 5; `invalidatePlugin` from `../lib/plugin-loader` (signature `invalidatePlugin(pluginId: string, workspaceId: string): void`); `deactivateProvider` from `@vencore/plugin-runtime`.
- Produces:
  - `disablePluginRuntime(db, workspaceId, pluginId, pluginName, reason): Promise<void>` in `plugin-disable.ts`.
  - `runLicenseCheck(db, fetchFn?): Promise<void>` and `startLicenseCheck(db): void` in `license-check.ts`.

- [ ] **Step 1: Write the disable helper**

Create `apps/api/src/lib/plugin-disable.ts`:

```ts
/**
 * Runtime teardown when a plugin is force-disabled outside the PATCH route
 * (e.g. by the license-check worker): kill the sandbox, mark the hook
 * provider inactive so hub consumers fall back to the builtin provider, and
 * notify workspace admins.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { deactivateProvider } from '@vencore/plugin-runtime';
import { invalidatePlugin } from './plugin-loader';

export async function disablePluginRuntime(
  db: Kysely<Database>,
  workspaceId: string,
  pluginId: string,
  pluginName: string,
  reason: string,
): Promise<void> {
  invalidatePlugin(pluginId, workspaceId);

  await db.updateTable('hook_providers')
    .set({ enabled: false, updated_at: new Date() })
    .where('workspace_id', '=', workspaceId)
    .where('provider_id', '=', pluginId)
    .execute();

  await deactivateProvider(db as Kysely<any>, workspaceId, pluginId);

  const admins = await db.selectFrom('users').select('id')
    .where('workspace_id', '=', workspaceId)
    .where('role', '=', 'admin')
    .execute();
  await Promise.allSettled(admins.map((a) =>
    db.insertInto('plugin_notifications').values({
      workspace_id: workspaceId,
      user_id: a.id,
      plugin_id: pluginId,
      title: `${pluginName} was disabled`,
      body: reason,
      type: 'info',
    }).execute(),
  ));
}
```

- [ ] **Step 2: Write the failing worker test**

Create `apps/api/src/__tests__/license-check.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

vi.mock('../lib/plugin-disable', () => ({
  disablePluginRuntime: vi.fn().mockResolvedValue(undefined),
}));

import { runLicenseCheck } from '../workers/license-check';
import { disablePluginRuntime } from '../lib/plugin-disable';

const KEY_OK = '11111111-1111-4111-8111-111111111111';
const KEY_BAD = '22222222-2222-4222-8222-222222222222';

function mockDb(rows: Array<Record<string, unknown>>) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const selectChain: Record<string, unknown> = {};
  for (const f of ['select', 'where']) {
    selectChain[f] = vi.fn().mockReturnValue(selectChain);
  }
  selectChain['execute'] = vi.fn().mockResolvedValue(rows);

  const makeUpdateChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain['set'] = vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      return chain;
    });
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['execute'] = vi.fn().mockResolvedValue(undefined);
    return chain;
  };

  const db = {
    selectFrom: vi.fn().mockReturnValue(selectChain),
    updateTable: vi.fn((table: string) => makeUpdateChain(table)),
  } as unknown as Kysely<Database>;

  return { db, updates };
}

function mockFetch(results: Array<{ key: string; valid: boolean; status: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: results, error: null }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env['MARKETPLACE_API_URL'] = 'https://platform.test';
  process.env['MARKETPLACE_SERVICE_TOKEN'] = 'svc-token';
  vi.mocked(disablePluginRuntime).mockClear();
});

afterEach(() => {
  delete process.env['MARKETPLACE_API_URL'];
  delete process.env['MARKETPLACE_SERVICE_TOKEN'];
});

const ROWS = [
  { id: 'wp-1', workspace_id: 'ws-1', plugin_id: 'crm-plus', name: 'CRM Plus', license_key: KEY_OK, enabled: true },
  { id: 'wp-2', workspace_id: 'ws-1', plugin_id: 'infra-pro', name: 'Infra Pro', license_key: KEY_BAD, enabled: true },
];

describe('runLicenseCheck', () => {
  it('is a no-op when MARKETPLACE_API_URL unset', async () => {
    delete process.env['MARKETPLACE_API_URL'];
    const { db } = mockDb(ROWS);
    const fetchFn = mockFetch([]);
    await runLicenseCheck(db, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('records status and disables only unusable licenses', async () => {
    const { db, updates } = mockDb(ROWS);
    const fetchFn = mockFetch([
      { key: KEY_OK, valid: true, status: 'grace' },
      { key: KEY_BAD, valid: false, status: 'revoked' },
    ]);
    await runLicenseCheck(db, fetchFn);

    // one /check POST per workspace with instance_id = workspace id
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://platform.test/v1/licenses/check');
    expect(JSON.parse(init.body as string)).toEqual({ instance_id: 'ws-1', keys: [KEY_OK, KEY_BAD] });

    // grace: status recorded, still enabled, no teardown
    const graceUpdate = updates.find(u => u.values['license_status'] === 'grace');
    expect(graceUpdate).toBeDefined();
    expect(graceUpdate!.values['enabled']).toBeUndefined();

    // revoked: disabled + teardown
    const revokedUpdate = updates.find(u => u.values['license_status'] === 'revoked');
    expect(revokedUpdate).toBeDefined();
    expect(revokedUpdate!.values['enabled']).toBe(false);
    expect(disablePluginRuntime).toHaveBeenCalledTimes(1);
    expect(disablePluginRuntime).toHaveBeenCalledWith(db, 'ws-1', 'infra-pro', 'Infra Pro', expect.stringContaining('revoked'));
  });

  it('skips non-uuid license keys (platform rejects them)', async () => {
    const { db } = mockDb([
      { id: 'wp-3', workspace_id: 'ws-2', plugin_id: 'x', name: 'X', license_key: 'not-a-uuid', enabled: true },
    ]);
    const fetchFn = mockFetch([]);
    await runLicenseCheck(db, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/__tests__/license-check.test.ts`
Expected: FAIL — `../workers/license-check` not found.

- [ ] **Step 4: Implement the worker**

Create `apps/api/src/workers/license-check.ts`:

```ts
// Periodically re-checks paid marketplace plugin licenses against the
// platform (/v1/licenses/check) and auto-disables plugins whose license is
// no longer usable. This is the poll fallback the platform's push design
// assumes ("the instance's daily poll will catch up").
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from '../lib/logger';
import { USABLE_LICENSE_STATUSES } from '../lib/marketplace-license';
import { disablePluginRuntime } from '../lib/plugin-disable';

const INTERVAL_MS = 30 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LicenseStatus = 'active' | 'grace' | 'expired' | 'revoked' | 'bound_elsewhere' | 'not_found';

interface CheckResult {
  key: string;
  valid: boolean;
  status: string;
}

export async function runLicenseCheck(
  db: Kysely<Database>,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const marketplaceUrl = process.env['MARKETPLACE_API_URL'] ?? '';
  if (!marketplaceUrl) return;
  const svcToken = process.env['MARKETPLACE_SERVICE_TOKEN'] ?? '';

  const rows = await db
    .selectFrom('workspace_plugins')
    .select(['id', 'workspace_id', 'plugin_id', 'name', 'license_key', 'enabled'])
    .where('pricing_type', '=', 'paid')
    .where('source', '=', 'marketplace')
    .where('license_key', 'is not', null)
    .execute();

  const checkable = rows.filter(r => r.license_key !== null && UUID_RE.test(r.license_key));
  if (checkable.length === 0) return;

  const byWorkspace = new Map<string, typeof checkable>();
  for (const r of checkable) {
    const list = byWorkspace.get(r.workspace_id) ?? [];
    list.push(r);
    byWorkspace.set(r.workspace_id, list);
  }

  for (const [workspaceId, plugins] of byWorkspace) {
    try {
      const res = await fetchFn(`${marketplaceUrl}/v1/licenses/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-service-token': svcToken },
        body: JSON.stringify({ instance_id: workspaceId, keys: plugins.map(p => p.license_key) }),
      });
      if (!res.ok) {
        logger.warn({ workspaceId, status: res.status }, '[license-check] platform check failed');
        continue;
      }
      const json = await (res.json() as Promise<{ data: CheckResult[] | null }>);
      const byKey = new Map((json.data ?? []).map(r => [r.key, r]));
      const now = new Date();

      for (const plugin of plugins) {
        const result = byKey.get(plugin.license_key!);
        if (!result) continue;
        const status = result.status as LicenseStatus;
        const usable = USABLE_LICENSE_STATUSES.has(status);

        if (!usable && plugin.enabled) {
          await db
            .updateTable('workspace_plugins')
            .set({ enabled: false, license_status: status, license_checked_at: now })
            .where('id', '=', plugin.id)
            .execute();
          await disablePluginRuntime(
            db, workspaceId, plugin.plugin_id, plugin.name,
            `License is ${status.replace('_', ' ')} — the plugin was disabled. Renew or update the key in Settings → Plugins.`,
          );
          logger.warn({ workspaceId, pluginId: plugin.plugin_id, status }, '[license-check] plugin auto-disabled');
        } else {
          await db
            .updateTable('workspace_plugins')
            .set({ license_status: status, license_checked_at: now })
            .where('id', '=', plugin.id)
            .execute();
        }
      }
    } catch (err) {
      logger.error({ err, workspaceId }, '[license-check] workspace check failed');
    }
  }
}

export function startLicenseCheck(db: Kysely<Database>): void {
  // Run shortly after startup, then every 30 min
  void runLicenseCheck(db).catch(err => logger.error({ err }, '[license-check] initial run failed'));
  setInterval(() => {
    void runLicenseCheck(db).catch(err => logger.error({ err }, '[license-check] run failed'));
  }, INTERVAL_MS);
  logger.info('license check worker started (30-min polling)');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/__tests__/license-check.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Start the worker**

In `apps/api/src/index.ts`, after `import { startHubRetention } from './workers/hub-retention';` (line 91) add:

```ts
import { startLicenseCheck } from './workers/license-check';
```

and after `startHubRetention(db);` (line 503) add:

```ts
// Start license re-check worker (paid marketplace plugins, 30-min cycle)
startLicenseCheck(db);
```

- [ ] **Step 7: Typecheck + full API tests**

Run: `pnpm lint && pnpm test`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd /home/kavin/Projects/Vencore
git add apps/api/src/lib/plugin-disable.ts apps/api/src/workers/license-check.ts apps/api/src/__tests__/license-check.test.ts apps/api/src/index.ts
git commit -m "feat(api): license re-check worker with auto-disable"
```

---

### Task 9: UI — slug install, license status badge, error surfacing

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/plugins/page.tsx`

**Interfaces:**
- Consumes: `POST /api/plugins/marketplace/install/:slug` (Task 7); `license_status` on the plugin rows (Task 5 — returned automatically by `GET /api/plugins` which does `selectAll`).

- [ ] **Step 1: Extend the `WorkspacePlugin` interface**

In the interface at the top of the file, after `platform_plugin_id: string | null;` add:

```ts
  license_status: 'active' | 'grace' | 'expired' | 'revoked' | 'bound_elsewhere' | 'not_found' | null;
```

- [ ] **Step 2: Install by slug**

In `installFromMarketplace`, change the fetch URL from:

```ts
      const res = await fetch(`${apiUrl}/api/plugins/marketplace/install/${mp.id}`, {
```

to:

```ts
      const res = await fetch(`${apiUrl}/api/plugins/marketplace/install/${mp.slug}`, {
```

- [ ] **Step 3: Add a license status badge component**

Next to the existing `StarIcon` component definition, add:

```tsx
const LICENSE_BADGE: Record<string, { label: string; fg: string; bg: string }> = {
  grace: { label: 'License expiring — renew soon', fg: 'var(--amber)', bg: 'var(--amber-bg)' },
  expired: { label: 'License expired', fg: 'var(--red)', bg: 'var(--red-bg)' },
  revoked: { label: 'License revoked', fg: 'var(--red)', bg: 'var(--red-bg)' },
  bound_elsewhere: { label: 'License in use elsewhere', fg: 'var(--red)', bg: 'var(--red-bg)' },
  not_found: { label: 'License not found', fg: 'var(--red)', bg: 'var(--red-bg)' },
};

function LicenseBadge({ status }: { status: string | null }) {
  if (!status || !(status in LICENSE_BADGE)) return null;
  const b = LICENSE_BADGE[status]!;
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
      color: b.fg, background: b.bg, whiteSpace: 'nowrap',
    }}>
      {b.label}
    </span>
  );
}
```

(`active` intentionally renders nothing — healthy is the quiet default.)

- [ ] **Step 4: Render the badge on installed paid plugins**

In the installed-plugins list item JSX, locate where the paid star renders:

```tsx
{plugin.pricing_type === 'paid' && <StarIcon />}
```

and directly after it add:

```tsx
{plugin.pricing_type === 'paid' && <LicenseBadge status={plugin.license_status} />}
```

- [ ] **Step 5: Verify in browser**

Run web + api dev servers (`.claude/launch.json` names if present, else `pnpm dev` at repo root), open Settings → Plugins:
- Marketplace section renders (empty list is fine without `MARKETPLACE_API_URL`).
- No console errors; installed plugins list unchanged for free plugins.

- [ ] **Step 6: Commit**

```bash
cd /home/kavin/Projects/Vencore
git add "apps/web/app/(dashboard)/settings/plugins/page.tsx"
git commit -m "feat(web): install marketplace plugins by slug; license status badge"
```

---

### Task 10: End-to-end verification + wrap-up

**Files:** none new. Both repos.

- [ ] **Step 1: Full test suites**

```bash
cd /home/kavin/Projects/vencore-platform/apps/api && pnpm exec tsc --noEmit && pnpm vitest run
cd /home/kavin/Projects/Vencore/apps/api && pnpm lint && pnpm test
```

Expected: all green. Report any failure verbatim; do not proceed with failures.

- [ ] **Step 2: Manual contract pass (needs both stacks + `MARKETPLACE_API_URL`/`MARKETPLACE_SERVICE_TOKEN` set in Vencore `.env` pointing at the local platform API)**

1. Vencore Settings → Plugins: marketplace list shows the platform's approved plugins.
2. Install a free plugin → succeeds, appears in installed list.
3. Install a paid plugin with a valid key → succeeds; platform `license_keys` row shows `instance_id` = workspace id, `last_checked_at` set.
4. Try the same key from a second workspace → 409 `BOUND_ELSEWHERE` shown.
5. Revoke the key in the platform admin → run one worker cycle (restart the API or wait ≤30 min) → plugin auto-disabled, red "License revoked" badge.
6. Deactivate: disable the plugin in workspace 1 → platform key becomes unbound; re-enable from workspace 2 with that key now succeeds.

If the platform stack cannot run locally, state exactly which of these steps were skipped.

- [ ] **Step 3: Update the codebase graph (Vencore repo rule)**

Run `/graphify . --update` per CLAUDE.md (new worker + lib + migration = significant change).

- [ ] **Step 4: Finish branches**

Use superpowers:finishing-a-development-branch for each repo (`feat/marketplace-plugins-license` in Vencore, `feat/license-hardening` in vencore-platform). Never push to main.
