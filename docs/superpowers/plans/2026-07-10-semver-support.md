# Semver Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real semantic versioning across Vencore — release tagging feeding the instance updater, plus plugin version rules (strict upgrade enforcement, SDK compat warnings, host version range blocking).

**Architecture:** The `semver` npm package becomes the single comparison engine, wrapped in `apps/api/src/lib/version.ts`. A new `checkVersionRules` helper gates both plugin install paths (marketplace + zip upload) before any side effect. The release pipeline gains an auto-created GitHub Release on tag push; the updater already consumes GHCR tags and needs only prerelease filtering.

**Tech Stack:** TypeScript, Express, Kysely, Zod, Vitest, `semver` npm package, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-10-semver-support-design.md`

## Global Constraints

- All API error responses use `{ data: null, error: { code, message } }`; version-gate rejections use HTTP 409.
- Error messages must include both versions involved.
- `checkVersionRules` runs before any side effect (file save, build, migration, upsert).
- Dev instances (`VENCORE_VERSION` unset → `0.0.0-dev`, or invalid semver) skip the `host_version` check.
- The updater must only ever offer **stable** versions (no prerelease tags).
- SDK major mismatch warns, never blocks. Missing `sdk_version` produces no warning.
- No `any` types. TypeScript strict.
- Run API tests with: `pnpm -C apps/api test` (vitest). Single file: `pnpm -C apps/api exec vitest run src/__tests__/<file>.test.ts`.
- Commit messages: conventional commits, no AI attribution of any kind.
- Work happens on branch `feat/semver-support` (already created, spec committed).

---

### Task 1: Semver engine (`version.ts`) + refactor update-check/system onto it

**Files:**
- Create: `apps/api/src/lib/version.ts`
- Create: `apps/api/src/__tests__/version.test.ts`
- Modify: `apps/api/src/lib/update-check.ts` (remove hand-rolled helpers, lines 11–28)
- Modify: `apps/api/src/routes/system.ts:5,47`
- Modify: `apps/api/src/__tests__/update-check.test.ts` (unit describe block at line 29 moves to version.test.ts)
- Modify: `apps/api/package.json` (add `semver`, `@types/semver`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (later tasks rely on these exact exports from `apps/api/src/lib/version.ts`):
  - `SUPPORTED_SDK_MAJOR: number`
  - `isStableSemver(v: string): boolean` — valid semver AND no prerelease
  - `compareSemver(a: string, b: string): number`
  - `pickLatest(tags: string[]): string | null` — highest **stable** semver, ignores prereleases and junk
  - `export { valid as semverValid, validRange as semverValidRange, gt as semverGt, satisfies as semverSatisfies, major as semverMajor, prerelease as semverPrerelease } from 'semver';`

- [ ] **Step 1: Install dependency**

```bash
pnpm -C apps/api add semver
pnpm -C apps/api add -D @types/semver
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/__tests__/version.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isStableSemver,
  compareSemver,
  pickLatest,
  SUPPORTED_SDK_MAJOR,
} from '../lib/version';

describe('isStableSemver', () => {
  it('accepts plain X.Y.Z', () => {
    expect(isStableSemver('1.2.3')).toBe(true);
    expect(isStableSemver('0.1.0')).toBe(true);
  });

  it('rejects prereleases and junk', () => {
    expect(isStableSemver('1.2.3-rc.1')).toBe(false);
    expect(isStableSemver('0.0.0-dev')).toBe(false);
    expect(isStableSemver('latest')).toBe(false);
    expect(isStableSemver('1.2')).toBe(false);
  });
});

describe('compareSemver', () => {
  it('orders numerically, not lexically', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('orders prereleases below their release', () => {
    expect(compareSemver('1.2.0-dev.1', '1.2.0')).toBeLessThan(0);
    expect(compareSemver('1.2.0-dev.2', '1.2.0-dev.1')).toBeGreaterThan(0);
  });
});

describe('pickLatest', () => {
  it('picks the highest stable version', () => {
    expect(pickLatest(['latest', '1.2', '1.2.3', '1.10.0', '1.9.9'])).toBe('1.10.0');
  });

  it('ignores prerelease tags', () => {
    expect(pickLatest(['1.2.3', '2.0.0-rc.1'])).toBe('1.2.3');
  });

  it('returns null when nothing stable', () => {
    expect(pickLatest(['latest', 'main'])).toBeNull();
    expect(pickLatest(['2.0.0-rc.1'])).toBeNull();
    expect(pickLatest([])).toBeNull();
  });
});

describe('SUPPORTED_SDK_MAJOR', () => {
  it('is a non-negative integer', () => {
    expect(Number.isInteger(SUPPORTED_SDK_MAJOR)).toBe(true);
    expect(SUPPORTED_SDK_MAJOR).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -C apps/api exec vitest run src/__tests__/version.test.ts`
Expected: FAIL — cannot resolve `../lib/version`.

- [ ] **Step 4: Write minimal implementation**

Create `apps/api/src/lib/version.ts`:

```typescript
import semver from 'semver';

export {
  valid as semverValid,
  validRange as semverValidRange,
  gt as semverGt,
  satisfies as semverSatisfies,
  major as semverMajor,
  prerelease as semverPrerelease,
} from 'semver';

/** SDK major version this host supports. Bump when @vencore/plugin-runtime breaks compat. */
export const SUPPORTED_SDK_MAJOR = 0;

/** Valid semver with no prerelease component. */
export function isStableSemver(v: string): boolean {
  return semver.valid(v) !== null && semver.prerelease(v) === null;
}

export function compareSemver(a: string, b: string): number {
  return semver.compare(a, b);
}

/** Highest stable semver among arbitrary registry tags, or null. */
export function pickLatest(tags: string[]): string | null {
  const stable = tags.filter(isStableSemver);
  if (stable.length === 0) return null;
  return stable.sort(compareSemver).at(-1) ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C apps/api exec vitest run src/__tests__/version.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Refactor `update-check.ts` onto version.ts**

In `apps/api/src/lib/update-check.ts`:

Delete the three hand-rolled functions (`isSemver`, `compareSemver`, `pickLatest`, currently lines 11–28) and add the import:

```typescript
import { isStableSemver, compareSemver, pickLatest } from './version';
```

The `updateAvailable` computation inside `runUpdateCheck` becomes:

```typescript
const updateAvailable =
  latest !== null && isStableSemver(running) && compareSemver(latest, running) > 0;
```

(Behavior preserved: a dev instance running `0.0.0-dev` never sees updates — old `isSemver` rejected it via regex, `isStableSemver` rejects it via prerelease.)

- [ ] **Step 7: Update `system.ts` import**

In `apps/api/src/routes/system.ts` line 5:

```typescript
import { currentVersion, runUpdateCheck } from '../lib/update-check';
import { isStableSemver, compareSemver } from '../lib/version';
```

Line 47, replace `isSemver(running)` with `isStableSemver(running)`:

```typescript
const updateAvailable =
  latest !== null && isStableSemver(running) && compareSemver(latest, running) > 0;
```

- [ ] **Step 8: Move unit tests out of update-check.test.ts**

In `apps/api/src/__tests__/update-check.test.ts`, delete the `describe('compareSemver / pickLatest / isSemver', ...)` block (starts line 29) — those cases now live in `version.test.ts`. Keep all `runUpdateCheck`/GHCR integration tests unchanged.

- [ ] **Step 9: Run full API test suite + typecheck**

Run: `pnpm -C apps/api test && pnpm -C apps/api lint`
Expected: all tests PASS, tsc clean.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/lib/version.ts apps/api/src/lib/update-check.ts apps/api/src/routes/system.ts apps/api/src/__tests__/version.test.ts apps/api/src/__tests__/update-check.test.ts
git commit -m "feat(api): add semver engine, refactor update-check onto semver package"
```

---

### Task 2: `checkVersionRules` gate helper

**Files:**
- Create: `apps/api/src/lib/plugin-version-rules.ts`
- Create: `apps/api/src/__tests__/plugin-version-rules.test.ts`

**Interfaces:**
- Consumes: `SUPPORTED_SDK_MAJOR`, `semverGt`, `semverValid`, `semverSatisfies`, `semverMajor` from `../lib/version` (Task 1); `currentVersion()` from `../lib/update-check` (existing).
- Produces (Task 3 relies on):

```typescript
export interface VersionRuleInput {
  id: string;
  version: string;
  sdk_version?: string;
  host_version?: string;
}

export interface VersionRuleResult {
  error: { code: 'VERSION_NOT_BUMPED' | 'HOST_VERSION_UNSATISFIED'; message: string } | null;
  warnings: string[];
}

export async function checkVersionRules(
  db: Kysely<Database>,
  workspaceId: string,
  mf: VersionRuleInput,
): Promise<VersionRuleResult>;
```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/plugin-version-rules.test.ts`. Mock DB follows the chain pattern used in `update-check.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkVersionRules } from '../lib/plugin-version-rules';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

function mockDb(existingVersion: string | null) {
  const chain: Record<string, unknown> = {};
  for (const f of ['select', 'where']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['executeTakeFirst'] = vi
    .fn()
    .mockResolvedValue(existingVersion === null ? undefined : { version: existingVersion });
  return { selectFrom: vi.fn().mockReturnValue(chain) } as unknown as Kysely<Database>;
}

const WS = 'ws-1';

afterEach(() => {
  delete process.env['VENCORE_VERSION'];
});

describe('strict bump rule', () => {
  it('passes a fresh install (no existing row)', async () => {
    const r = await checkVersionRules(mockDb(null), WS, { id: 'p', version: '1.0.0' });
    expect(r.error).toBeNull();
  });

  it('passes an upgrade', async () => {
    const r = await checkVersionRules(mockDb('1.0.0'), WS, { id: 'p', version: '1.0.1' });
    expect(r.error).toBeNull();
  });

  it('rejects same version', async () => {
    const r = await checkVersionRules(mockDb('1.2.0'), WS, { id: 'p', version: '1.2.0' });
    expect(r.error?.code).toBe('VERSION_NOT_BUMPED');
    expect(r.error?.message).toContain('1.2.0');
  });

  it('rejects downgrade', async () => {
    const r = await checkVersionRules(mockDb('2.0.0'), WS, { id: 'p', version: '1.9.9' });
    expect(r.error?.code).toBe('VERSION_NOT_BUMPED');
    expect(r.error?.message).toContain('2.0.0');
    expect(r.error?.message).toContain('1.9.9');
  });

  it('orders prerelease chain correctly', async () => {
    const ok = await checkVersionRules(mockDb('1.2.0-dev.1'), WS, { id: 'p', version: '1.2.0-dev.2' });
    expect(ok.error).toBeNull();
    const release = await checkVersionRules(mockDb('1.2.0-dev.2'), WS, { id: 'p', version: '1.2.0' });
    expect(release.error).toBeNull();
    const behind = await checkVersionRules(mockDb('1.2.0'), WS, { id: 'p', version: '1.2.1-dev.1' });
    expect(behind.error).toBeNull();
    const stale = await checkVersionRules(mockDb('1.2.0'), WS, { id: 'p', version: '1.2.0-dev.3' });
    expect(stale.error?.code).toBe('VERSION_NOT_BUMPED');
  });

  it('allows republish over an invalid stored version', async () => {
    const r = await checkVersionRules(mockDb('1.2.3.4'), WS, { id: 'p', version: '1.0.0' });
    expect(r.error).toBeNull();
  });
});

describe('host_version range', () => {
  it('passes when host satisfies range', async () => {
    process.env['VENCORE_VERSION'] = '1.5.0';
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', host_version: '>=1.2.0 <2',
    });
    expect(r.error).toBeNull();
  });

  it('rejects when host outside range', async () => {
    process.env['VENCORE_VERSION'] = '1.1.3';
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', host_version: '>=1.2.0 <2',
    });
    expect(r.error?.code).toBe('HOST_VERSION_UNSATISFIED');
    expect(r.error?.message).toContain('>=1.2.0 <2');
    expect(r.error?.message).toContain('1.1.3');
  });

  it('skips the check on dev instances', async () => {
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', host_version: '>=99.0.0',
    });
    expect(r.error).toBeNull();
  });

  it('no check when host_version absent', async () => {
    process.env['VENCORE_VERSION'] = '0.1.0';
    const r = await checkVersionRules(mockDb(null), WS, { id: 'p', version: '1.0.0' });
    expect(r.error).toBeNull();
  });
});

describe('sdk_version warning', () => {
  it('warns on major mismatch, does not block', async () => {
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', sdk_version: '99.0.0',
    });
    expect(r.error).toBeNull();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('99.0.0');
  });

  it('silent when sdk_version matches supported major', async () => {
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', sdk_version: '0.0.1',
    });
    expect(r.warnings).toHaveLength(0);
  });

  it('silent when sdk_version missing', async () => {
    const r = await checkVersionRules(mockDb(null), WS, { id: 'p', version: '1.0.0' });
    expect(r.warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/api exec vitest run src/__tests__/plugin-version-rules.test.ts`
Expected: FAIL — cannot resolve `../lib/plugin-version-rules`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/lib/plugin-version-rules.ts`:

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { currentVersion } from './update-check';
import {
  SUPPORTED_SDK_MAJOR,
  semverGt,
  semverValid,
  semverSatisfies,
  semverMajor,
} from './version';

export interface VersionRuleInput {
  id: string;
  version: string;
  sdk_version?: string;
  host_version?: string;
}

export interface VersionRuleResult {
  error: { code: 'VERSION_NOT_BUMPED' | 'HOST_VERSION_UNSATISFIED'; message: string } | null;
  warnings: string[];
}

/**
 * Version gate for plugin install/publish. Must run before any side effect
 * (file save, build, migration, upsert). Blocking rules return `error`;
 * non-blocking issues accumulate in `warnings`.
 */
export async function checkVersionRules(
  db: Kysely<Database>,
  workspaceId: string,
  mf: VersionRuleInput,
): Promise<VersionRuleResult> {
  const warnings: string[] = [];

  const existing = await db
    .selectFrom('workspace_plugins')
    .select('version')
    .where('workspace_id', '=', workspaceId)
    .where('plugin_id', '=', mf.id)
    .executeTakeFirst();

  // Rows written before strict validation may hold junk versions — let a
  // republish repair them instead of comparing against garbage.
  if (existing && semverValid(existing.version) !== null && !semverGt(mf.version, existing.version)) {
    return {
      error: {
        code: 'VERSION_NOT_BUMPED',
        message: `Version ${mf.version} must be greater than installed ${existing.version}`,
      },
      warnings,
    };
  }

  const host = currentVersion();
  const hostIsDev = host === '0.0.0-dev' || semverValid(host) === null;
  if (mf.host_version && !hostIsDev && !semverSatisfies(host, mf.host_version)) {
    return {
      error: {
        code: 'HOST_VERSION_UNSATISFIED',
        message: `Plugin requires host ${mf.host_version}, this instance is ${host}`,
      },
      warnings,
    };
  }

  if (mf.sdk_version && semverMajor(mf.sdk_version) !== SUPPORTED_SDK_MAJOR) {
    warnings.push(
      `Plugin was built with SDK ${mf.sdk_version}; this host supports SDK major ${SUPPORTED_SDK_MAJOR}. It may not work correctly.`,
    );
  }

  return { error: null, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/api exec vitest run src/__tests__/plugin-version-rules.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/plugin-version-rules.ts apps/api/src/__tests__/plugin-version-rules.test.ts
git commit -m "feat(api): add checkVersionRules plugin version gate"
```

---

### Task 3: Manifest schema changes + wire gate into both install paths

**Files:**
- Modify: `apps/api/src/routes/plugins.ts` (manifestSchema ~L110–144; marketplace install handler ~L318; upload handler ~L649)
- Modify: `packages/plugin-types/src/index.ts:435-462` (PluginManifest)
- Modify: `plugin-docs/types.mdx` (Manifest section ~L303)
- Create: `apps/api/src/__tests__/plugin-manifest-schema.test.ts`

**Interfaces:**
- Consumes: `checkVersionRules`, `VersionRuleResult` from `../lib/plugin-version-rules` (Task 2); `semverValid`, `semverValidRange` from `../lib/version` (Task 1).
- Produces: `manifestSchema` becomes an exported const from `apps/api/src/routes/plugins.ts`. Install/upload success responses gain optional top-level `warnings: string[]` (Task 4 consumes).

- [ ] **Step 1: Write the failing schema test**

Create `apps/api/src/__tests__/plugin-manifest-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { manifestSchema } from '../routes/plugins';

const base = { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' };

describe('manifest version field', () => {
  it('accepts stable and prerelease semver', () => {
    expect(manifestSchema.safeParse({ ...base, version: '1.2.3' }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...base, version: '1.2.3-dev.1' }).success).toBe(true);
  });

  it('rejects non-semver', () => {
    expect(manifestSchema.safeParse({ ...base, version: '1.2' }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, version: '1.2.3.4' }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, version: 'latest' }).success).toBe(false);
  });
});

describe('manifest sdk_version field', () => {
  it('accepts exact semver, rejects ranges', () => {
    expect(manifestSchema.safeParse({ ...base, sdk_version: '0.0.1' }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...base, sdk_version: '^0.0.1' }).success).toBe(false);
  });

  it('remains optional', () => {
    expect(manifestSchema.safeParse(base).success).toBe(true);
  });
});

describe('manifest host_version field', () => {
  it('accepts valid ranges', () => {
    expect(manifestSchema.safeParse({ ...base, host_version: '>=1.2.0 <2' }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...base, host_version: '^1.2' }).success).toBe(true);
  });

  it('rejects garbage ranges', () => {
    expect(manifestSchema.safeParse({ ...base, host_version: 'not a range' }).success).toBe(false);
  });

  it('remains optional', () => {
    expect(manifestSchema.safeParse(base).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/api exec vitest run src/__tests__/plugin-manifest-schema.test.ts`
Expected: FAIL — `manifestSchema` is not exported (and prerelease versions currently pass the old regex only by prefix accident; garbage host_version passes because the field doesn't exist).

- [ ] **Step 3: Update the schema in `plugins.ts`**

Add to the imports at the top of `apps/api/src/routes/plugins.ts`:

```typescript
import { semverValid, semverValidRange } from '../lib/version';
import { checkVersionRules } from '../lib/plugin-version-rules';
```

Change `const manifestSchema = z.object({` to `export const manifestSchema = z.object({` and replace the three version-related fields:

```typescript
  version: z.string().min(1).max(64)
    .refine((v) => semverValid(v) !== null, 'Version must be valid semver (e.g. 1.2.3 or 1.2.3-dev.1)'),
  sdk_version: z.string().max(64)
    .refine((v) => semverValid(v) !== null, 'sdk_version must be an exact semver version')
    .optional(),
  host_version: z.string().max(128)
    .refine((r) => semverValidRange(r) !== null, 'host_version must be a valid semver range (e.g. ">=1.2.0 <2")')
    .optional(),
```

- [ ] **Step 4: Run schema test to verify it passes**

Run: `pnpm -C apps/api exec vitest run src/__tests__/plugin-manifest-schema.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Wire the gate into the marketplace install handler**

In the marketplace install handler (`router.post('/marketplace/:platformPluginId', ...)`, ~L318): immediately after the `validateHubDeclarations` rejection block (~L376) and before any `savePluginFile`/esbuild/`runMigrations` call, add:

```typescript
      const versionCheck = await checkVersionRules(db, workspace.id, mf);
      if (versionCheck.error) {
        return res.status(409).json({ data: null, error: versionCheck.error });
      }
```

And extend the success response (~L455, currently `return res.status(201).json({ data: plugin, error: null });`):

```typescript
      return res.status(201).json({ data: plugin, error: null, warnings: versionCheck.warnings });
```

- [ ] **Step 6: Wire the gate into the upload handler**

In the upload handler (`router.post('/upload', ...)`, ~L649): immediately after its `validateHubDeclarations` rejection block (~L681) and before the `build.server` entry check, add the identical gate:

```typescript
      const versionCheck = await checkVersionRules(db, workspace.id, mf);
      if (versionCheck.error) {
        return res.status(409).json({ data: null, error: versionCheck.error });
      }
```

Find the upload handler's success response (after `loadPluginBackend(mf.id, workspace.id, db);`, it returns the upserted plugin) and add `warnings: versionCheck.warnings` to it the same way.

- [ ] **Step 7: Update `PluginManifest` in plugin-types**

In `packages/plugin-types/src/index.ts`, inside `PluginManifest` (line 435), replace the `sdk_version` comment and add `host_version`:

```typescript
  /** SDK version this plugin was built with. Host warns on major version mismatch. */
  sdk_version?: string;
  /** Semver range the host instance must satisfy (e.g. ">=1.2.0 <2"). Host blocks install outside the range. */
  host_version?: string;
```

Rebuild the package so the API sees the new type:

```bash
pnpm -C packages/plugin-types build
```

- [ ] **Step 8: Document in plugin-docs**

In `plugin-docs/types.mdx`, Manifest section (~L303): document the semver rules — `version` must be full semver and strictly greater than the installed version on republish; `sdk_version` is exact semver, mismatched major logs a warning; `host_version` is an optional semver range that blocks install when the host is outside it. Match the surrounding prose style.

- [ ] **Step 9: Full test suite + typecheck**

Run: `pnpm -C apps/api test && pnpm -C apps/api lint`
Expected: all PASS, tsc clean.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/routes/plugins.ts apps/api/src/__tests__/plugin-manifest-schema.test.ts packages/plugin-types/src/index.ts plugin-docs/types.mdx
git commit -m "feat(plugins): enforce semver bump and host_version range on install, warn on SDK mismatch"
```

---

### Task 4: Web UI — warnings notice + version requirement display

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/plugins/page.tsx` (upload handler ~L175, marketplace install handler ~L256)
- Modify: `apps/web/app/(dashboard)/settings/plugins/[pluginId]/page.tsx` (detail view)

**Interfaces:**
- Consumes: install/upload responses now shaped `{ data, error: null, warnings?: string[] }`; 409 errors shaped `{ data: null, error: { code, message } }` (Task 3). Manifest may carry `host_version` (Task 3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add warnings state and notice to the plugins settings page**

In `apps/web/app/(dashboard)/settings/plugins/page.tsx`:

Add state next to the existing `error` state (~L129):

```typescript
const [warnings, setWarnings] = useState<string[]>([]);
```

In the upload success path (~L181, where the response json is parsed) and the marketplace install success path (~L277), after confirming `!json.error`:

```typescript
setWarnings((json as { warnings?: string[] }).warnings ?? []);
```

Clear warnings at the start of each upload/install attempt (`setWarnings([])` next to the existing `setError(null)`).

Render the notice near the existing error display, using the design-token amber treatment (match surrounding inline-style conventions in this file):

```tsx
{warnings.length > 0 && (
  <div style={{
    background: 'var(--amber-bg)', color: 'var(--amber)',
    border: '1px solid var(--border)', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, marginBottom: 12,
  }}>
    {warnings.map((w, i) => <div key={i}>{w}</div>)}
  </div>
)}
```

Note: 409 rejections need no new code — the existing `error` state already renders `json.error.message`, which includes both versions. Verify this by reading the upload handler's error branch; if it discards `error.message`, wire it into `setError`.

- [ ] **Step 2: Show version + host requirement on the plugin detail page**

In `apps/web/app/(dashboard)/settings/plugins/[pluginId]/page.tsx`: locate where the installed plugin's metadata (name/version) renders. Add, when the manifest declares it:

```tsx
{manifest.host_version && (
  <span style={{ color: 'var(--text3)', fontSize: 12 }}>
    Requires host {manifest.host_version}
  </span>
)}
```

Adapt variable names to whatever the page calls its manifest object (it renders fields from `plugin.manifest`). Ensure the installed `version` is displayed nearby; if it already is, leave it.

- [ ] **Step 3: Typecheck web**

Run: `pnpm -C apps/web lint`
Expected: clean. (If the web workspace uses `next lint`/tsc differently, run the package's `lint` script as defined.)

- [ ] **Step 4: Manual verification**

Start dev stack, upload a plugin zip twice with the same version. Expected: second upload shows "Version X must be greater than installed X" in the existing error UI. Bump version, add `"sdk_version": "99.0.0"` to plugin.json. Expected: install succeeds, amber warning notice appears.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/plugins/page.tsx" "apps/web/app/(dashboard)/settings/plugins/[pluginId]/page.tsx"
git commit -m "feat(web): surface plugin version warnings and host requirement"
```

---

### Task 5: Release automation — GitHub Release on tag + root version

**Files:**
- Modify: `.github/workflows/docker-publish.yml`
- Modify: `package.json` (repo root)

**Interfaces:**
- Consumes: existing tag-triggered build (workflow already runs on `tags: ["v*"]`).
- Produces: GitHub Releases at `https://github.com/vencorehq/Vencore/releases/tag/vX.Y.Z` — the exact URLs `update-check.ts` already links to.

- [ ] **Step 1: Add release job to docker-publish.yml**

Append a second job to `.github/workflows/docker-publish.yml` (sibling of `build-and-push`):

```yaml
  create-release:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Create GitHub Release
        run: |
          if ! gh release view "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            gh release create "$GITHUB_REF_NAME" \
              --repo "$GITHUB_REPOSITORY" \
              --title "$GITHUB_REF_NAME" \
              --generate-notes
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Add root version field**

In root `package.json`, add after `"name"`:

```json
  "version": "0.1.0",
```

(Documentation only — runtime truth stays `VENCORE_VERSION` from the tag. Bump this alongside future tags.)

- [ ] **Step 3: Validate workflow syntax**

```bash
git diff .github/workflows/docker-publish.yml
```

Eyeball the diff: two-space indent matching the existing job, `create-release` at the same level as `build-and-push` under `jobs:`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/docker-publish.yml package.json
git commit -m "ci: auto-create GitHub Release on version tag, add root version"
```

---

### Post-merge (manual, not part of this branch)

After this branch merges to `main`:

```bash
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0
```

This triggers image builds tagged `0.1.0` + a generated GitHub Release, making the instance updater live end-to-end. **Do not push the tag without the user's go-ahead** (repo rule: no push without asking).
