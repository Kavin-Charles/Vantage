# Infrastructure Module Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `servers`, `databases`, `websites`, and `alerts` modules into a single `infra` parent module with per-page child modules (`infra:servers`, `infra:databases`, `infra:websites`, `infra:alerts`), pages under `/infra/*`, generalizing the CRM parent/child machinery so both share one code path.

**Architecture:** Mirrors the completed CRM module merge (spec: `docs/superpowers/specs/2026-07-13-infra-module-merge-design.md`). One registry definition + submodule list in `packages/modules`, one DB migration that splits old rows into parent + children and rewrites sidebar keys 1:1, a generic parent-AND-child API gate replacing the CRM-specific one, and web route/code moves under `infra/`.

**Tech Stack:** TypeScript strict, Express, Kysely migrations (raw `sql` tags), Next.js App Router, vitest.

## Global Constraints

- Branch: `feat/infra-module` (already created off `origin/development`). Never commit to `main`.
- Permission keys unchanged: `servers:view`, `servers:ssh`, `databases:edit`, `websites:create`, `alerts:configure`, etc. No `user_permissions` migration.
- API endpoint URLs unchanged (`/api/servers`, `/api/databases`, `/api/websites`, `/api/alerts`, `/api/alert-thresholds`).
- `/api/agent` stays ungated by module middleware (agents authenticate by `agent_token` inside the router).
- Never modify existing migration files. New migration file only.
- Commit messages: conventional commits, no AI attribution of any kind (no Co-Authored-By, no "Generated with" footers).
- All commands below run from repo root `D:\Projects\VencoreRepos\Vencore` unless stated. Prefix shell commands with `rtk` where shown.
- Web has no component-test harness; web tasks verify via `tsc`/build and preview.

---

### Task 1: Module registry — `INFRA_MODULE`, shared `SubModule` type

**Files:**
- Modify: `packages/modules/src/types.ts`
- Create: `packages/modules/src/infra/index.ts`
- Modify: `packages/modules/src/crm/index.ts` (use shared type)
- Modify: `packages/modules/src/index.ts` (registry swap)
- Delete: `packages/modules/src/servers/`, `packages/modules/src/databases/`, `packages/modules/src/websites/`, `packages/modules/src/alerts/`
- Test: `packages/modules/src/index.test.ts`

**Interfaces:**
- Consumes: existing `ModuleDefinition` from `packages/modules/src/types.ts`.
- Produces (later tasks rely on these exact exports from `@vencore/modules`):
  - `interface SubModule { id: string; label: string; path: string; permission: string; legacyModuleId: string }`
  - `INFRA_MODULE: ModuleDefinition` (id `'infra'`)
  - `INFRA_SUBMODULES: readonly SubModule[]`
  - `INFRA_SUBMODULE_IDS: readonly string[]` — `['infra:servers','infra:databases','infra:websites','infra:alerts']`
  - `CRM_SUBMODULES: readonly SubModule[]` (unchanged values, retyped)

- [ ] **Step 1: Write the failing tests**

In `packages/modules/src/index.test.ts`, change the `getModuleForPermission` expectation and add an infra registry block. Replace the line:

```ts
    expect(getModuleForPermission('servers:delete')).toBe('servers');
```

with:

```ts
    expect(getModuleForPermission('servers:delete')).toBe('infra');
    expect(getModuleForPermission('websites:view')).toBe('infra');
    expect(getModuleForPermission('alerts:configure')).toBe('infra');
```

Add inside the `describe('MODULE_REGISTRY', ...)` block:

```ts
  it('contains infra and not the merged infra module ids', () => {
    const ids = MODULE_REGISTRY.map(m => m.id);
    expect(ids).toContain('infra');
    for (const old of ['servers', 'databases', 'websites', 'alerts']) {
      expect(ids).not.toContain(old);
    }
  });

  it('infra module carries all merged permission keys', () => {
    const infra = MODULE_REGISTRY.find(m => m.id === 'infra');
    const keys = infra!.permissions.map(p => p.key);
    expect(keys).toEqual(expect.arrayContaining([
      'servers:view', 'servers:ssh', 'servers:delete',
      'databases:view', 'databases:delete',
      'websites:view', 'websites:delete',
      'alerts:view', 'alerts:acknowledge', 'alerts:resolve', 'alerts:configure',
    ]));
    expect(keys).toHaveLength(17);
  });
```

Also add at the top of the file, in the import from `'./index'`: `INFRA_SUBMODULE_IDS`, and add:

```ts
describe('INFRA_SUBMODULES', () => {
  it('exposes the four child module ids', () => {
    expect(INFRA_SUBMODULE_IDS).toEqual([
      'infra:servers', 'infra:databases', 'infra:websites', 'infra:alerts',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter @vencore/modules test`
Expected: FAIL — `INFRA_SUBMODULE_IDS` not exported; `getModuleForPermission('servers:delete')` returns `'servers'`.

- [ ] **Step 3: Add the shared `SubModule` type**

Append to `packages/modules/src/types.ts`:

```ts
// A parent module's per-page child. Each child gates one sidebar entry, its
// page, and its API routes; a child is only effective when the parent module
// is also enabled.
export interface SubModule {
  id: string;
  label: string;
  path: string;
  permission: string;
  legacyModuleId: string;
}
```

In `packages/modules/src/crm/index.ts`, delete the `CrmSubModule` interface and its comment block, import the shared type instead, and retype the list. The top of the submodule section becomes:

```ts
import type { ModuleDefinition, SubModule } from '../types';
```

(replacing the existing `import type { ModuleDefinition } from '../types';`) and:

```ts
export const CRM_SUBMODULES: readonly SubModule[] = [
  { id: 'crm:pipeline',  label: 'Pipeline',  path: '/crm/pipeline',  permission: 'pipelines:view', legacyModuleId: 'pipelines' },
  { id: 'crm:contacts',  label: 'Contacts',  path: '/crm/contacts',  permission: 'contacts:view',  legacyModuleId: 'contacts'  },
  { id: 'crm:companies', label: 'Companies', path: '/crm/companies', permission: 'companies:view', legacyModuleId: 'companies' },
  { id: 'crm:tasks',     label: 'Tasks',     path: '/crm/tasks',     permission: 'tasks:view',     legacyModuleId: 'tasks'     },
];
```

(values identical to today — only the type annotation changes; keep the `CRM_SUBMODULE_IDS` export as-is).

- [ ] **Step 4: Create `packages/modules/src/infra/index.ts`**

```ts
import type { ModuleDefinition, SubModule } from '../types';

export const INFRA_MODULE: ModuleDefinition = {
  id: 'infra',
  name: 'Infrastructure',
  description: 'Servers, databases, website uptime, and alerting.',
  icon: 'Server',
  defaultEnabled: true,
  permissions: [
    { key: 'servers:view',   label: 'View servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:create', label: 'Add servers',    defaultRoles: ['admin', 'member'] },
    { key: 'servers:edit',   label: 'Edit servers',   defaultRoles: ['admin', 'member'] },
    { key: 'servers:delete', label: 'Delete servers', defaultRoles: ['admin'] },
    { key: 'servers:ssh',    label: 'SSH access (terminal, files, services)', defaultRoles: ['admin'] },
    { key: 'databases:view',   label: 'View databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:create', label: 'Add databases',    defaultRoles: ['admin', 'member'] },
    { key: 'databases:edit',   label: 'Edit databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:delete', label: 'Delete databases', defaultRoles: ['admin'] },
    { key: 'websites:view',   label: 'View websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:create', label: 'Add websites',    defaultRoles: ['admin', 'member'] },
    { key: 'websites:edit',   label: 'Edit websites',   defaultRoles: ['admin', 'member'] },
    { key: 'websites:delete', label: 'Delete websites', defaultRoles: ['admin'] },
    { key: 'alerts:view',        label: 'View alerts',          defaultRoles: ['admin', 'member'] },
    { key: 'alerts:acknowledge', label: 'Acknowledge alerts',   defaultRoles: ['admin', 'member'] },
    { key: 'alerts:resolve',     label: 'Resolve alerts',       defaultRoles: ['admin'] },
    { key: 'alerts:configure',   label: 'Configure thresholds', defaultRoles: ['admin'] },
  ],
  nav: [
    { label: 'Servers',   path: '/infra/servers',   icon: 'Server' },
    { label: 'Databases', path: '/infra/databases', icon: 'Database' },
    { label: 'Websites',  path: '/infra/websites',  icon: 'Globe' },
    { label: 'Alerts',    path: '/infra/alerts',    icon: 'Bell' },
  ],
  apiPrefixes: ['/servers', '/deployments', '/agent', '/ssh', '/databases', '/websites', '/alerts', '/alert-thresholds'],
  workers: ['website-checker', 'alert-eval'],
  emitsActivity: true,
  emitsAlerts: true,
};

export const INFRA_SUBMODULES: readonly SubModule[] = [
  { id: 'infra:servers',   label: 'Servers',   path: '/infra/servers',   permission: 'servers:view',   legacyModuleId: 'servers'   },
  { id: 'infra:databases', label: 'Databases', path: '/infra/databases', permission: 'databases:view', legacyModuleId: 'databases' },
  { id: 'infra:websites',  label: 'Websites',  path: '/infra/websites',  permission: 'websites:view',  legacyModuleId: 'websites'  },
  { id: 'infra:alerts',    label: 'Alerts',    path: '/infra/alerts',    permission: 'alerts:view',    legacyModuleId: 'alerts'    },
];

export const INFRA_SUBMODULE_IDS: readonly string[] = INFRA_SUBMODULES.map(s => s.id);
```

- [ ] **Step 5: Swap the registry**

In `packages/modules/src/index.ts`:
- Replace the four export lines `export * from './websites'; export * from './servers'; export * from './databases';` and `export * from './alerts';` with a single `export * from './infra';`
- Replace the four imports (`WEBSITES_MODULE`, `SERVERS_MODULE`, `DATABASES_MODULE`, `ALERTS_MODULE`) with `import { INFRA_MODULE } from './infra';`
- In `MODULE_REGISTRY`, replace the four entries with `INFRA_MODULE` (place it after `CRM_MODULE`). Result:

```ts
export const MODULE_REGISTRY: ModuleDefinition[] = [
  DASHBOARD_MODULE,
  CRM_MODULE,
  INFRA_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
  PROJECTS_MODULE,
  MESSAGING_MODULE,
];
```

Then delete the four directories:

```bash
rtk git rm -r packages/modules/src/servers packages/modules/src/databases packages/modules/src/websites packages/modules/src/alerts
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `rtk pnpm --filter @vencore/modules test`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
rtk git add packages/modules && rtk git commit -m "feat(modules): merge servers, databases, websites, alerts into infra module"
```

---

### Task 2: DB migration — split old modules into `infra` parent + children

**Files:**
- Create: `packages/db/migrations/20260713_001_infra_module_merge.ts`
- Test: `packages/db/migrations/20260713_001_infra_module_merge.test.ts`

**Interfaces:**
- Produces: exported pure helpers `deriveInfraEnabled(enabledByModule: Record<string, boolean | undefined>): boolean` and `rewriteKeysForInfra(keys: string[]): string[]` (tested directly), plus Kysely `up`/`down`.
- Template: `packages/db/migrations/20260712_001_crm_module_merge.ts` — same structure, infra ids/keys, 1:1 key map.

- [ ] **Step 1: Write the failing test** — `packages/db/migrations/20260713_001_infra_module_merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveInfraEnabled, rewriteKeysForInfra } from './20260713_001_infra_module_merge';

describe('deriveInfraEnabled (parent = any old module enabled)', () => {
  it('true when any of the four is enabled', () => {
    expect(deriveInfraEnabled({ servers: true, databases: true, websites: true, alerts: true })).toBe(true);
    expect(deriveInfraEnabled({ servers: false, databases: false, websites: false, alerts: true })).toBe(true);
  });

  it('false only when all four are explicitly disabled', () => {
    expect(deriveInfraEnabled({ servers: false, databases: false, websites: false, alerts: false })).toBe(false);
  });

  it('missing rows count as enabled (defaultEnabled)', () => {
    expect(deriveInfraEnabled({})).toBe(true);
    expect(deriveInfraEnabled({ alerts: false })).toBe(true);
    expect(deriveInfraEnabled({ servers: false })).toBe(true);
  });
});

describe('rewriteKeysForInfra (per-page nested keys)', () => {
  it('maps each old key to its nested /infra/* key in place', () => {
    expect(rewriteKeysForInfra(['/servers', '/databases', '/websites', '/alerts', '/analytics']))
      .toEqual(['/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts', '/analytics']);
  });

  it('keeps position when old keys are interleaved', () => {
    expect(rewriteKeysForInfra(['/dashboard', '/servers', '/crm/contacts', '/alerts']))
      .toEqual(['/dashboard', '/infra/servers', '/crm/contacts', '/infra/alerts']);
  });

  it('leaves untouched lists alone', () => {
    expect(rewriteKeysForInfra(['/dashboard', '/analytics'])).toEqual(['/dashboard', '/analytics']);
  });

  it('dedupes when a mapped key already exists', () => {
    expect(rewriteKeysForInfra(['/infra/servers', '/servers', '/databases'])).toEqual(['/infra/servers', '/infra/databases']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/db/migrations/20260713_001_infra_module_merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration** — `packages/db/migrations/20260713_001_infra_module_merge.ts`. Mirror the CRM migration exactly, with infra ids. Full file:

```ts
import { type Kysely, sql } from 'kysely';

const OLD_MODULE_IDS = ['servers', 'databases', 'websites', 'alerts'] as const;

// Old top-level sidebar key -> new nested infra key. Each infra page keeps its
// own sidebar entry, so keys map one-to-one.
const ITEM_KEY_MAP: Record<string, string> = {
  '/servers': '/infra/servers',
  '/databases': '/infra/databases',
  '/websites': '/infra/websites',
  '/alerts': '/infra/alerts',
};

// The `infra` parent module is enabled when ANY of the four old modules was
// enabled; a missing old row counts as enabled (all four had defaultEnabled).
export function deriveInfraEnabled(enabledByModule: Record<string, boolean | undefined>): boolean {
  return OLD_MODULE_IDS.some(id => enabledByModule[id] !== false);
}

export function rewriteKeysForInfra(keys: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const mapped = ITEM_KEY_MAP[key] ?? key;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Split the four old infra modules into an `infra` parent plus per-page
  //    child modules. Each child preserves the old module's exact enabled
  //    state; the parent is enabled when ANY old module was enabled (missing
  //    rows counted as enabled).
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id,
      case module_id
        when 'servers'   then 'infra:servers'
        when 'databases' then 'infra:databases'
        when 'websites'  then 'infra:websites'
        when 'alerts'    then 'infra:alerts'
      end,
      enabled
    from workspace_modules
    where module_id in ('servers', 'databases', 'websites', 'alerts')
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id, 'infra', bool_or(enabled)
    from workspace_modules
    where module_id in ('servers', 'databases', 'websites', 'alerts')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  // 1b. Safety net: give every workspace any infra parent/child row it still
  //     lacks (defaulting to enabled). Covers workspaces that had none of the
  //     four old rows, and legacy workspaces that only had some of them — a
  //     missing old row meant that module was at defaultEnabled: true. The
  //     child-split above ran first with DO NOTHING, so explicitly-disabled
  //     children are never overwritten here.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select w.id, m.mid, true
    from workspaces w
    cross join (values ('infra'), ('infra:servers'), ('infra:databases'), ('infra:websites'), ('infra:alerts')) as m(mid)
    where not exists (
      select 1 from workspace_modules wm
      where wm.workspace_id = w.id and wm.module_id = m.mid
    )
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('servers', 'databases', 'websites', 'alerts')
  `.execute(db);

  // 1c. Consolidate module_event_settings: infra row aggregates activity_on
  //     and alerts_on from the four old modules with bool_and (infra only
  //     stays on when every old module was on). No safety-net insert — a
  //     missing module_event_settings row already defaults to enabled
  //     (`?? true` in log-activity.ts / alert-service.ts).
  await sql`
    insert into module_event_settings (workspace_id, module_id, activity_on, alerts_on)
    select workspace_id, 'infra', bool_and(activity_on), bool_and(alerts_on)
    from module_event_settings
    where module_id in ('servers', 'databases', 'websites', 'alerts')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from module_event_settings
    where module_id in ('servers', 'databases', 'websites', 'alerts')
  `.execute(db);

  // 2. Rewrite sidebar group item keys.
  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    const next = rewriteKeysForInfra(row.item_keys);
    if (JSON.stringify(next) !== JSON.stringify(row.item_keys)) {
      await sql`
        update workspace_sidebar_groups
        set item_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
        where id = ${row.id}
      `.execute(db);
    }
  }

  // 3. Rewrite pinned keys.
  const prefs = await sql<{ user_id: string; workspace_id: string; pinned_keys: string[] }>`
    select user_id, workspace_id, pinned_keys from user_sidebar_prefs
  `.execute(db);
  for (const row of prefs.rows) {
    const next = rewriteKeysForInfra(row.pinned_keys);
    if (JSON.stringify(next) !== JSON.stringify(row.pinned_keys)) {
      await sql`
        update user_sidebar_prefs
        set pinned_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
        where user_id = ${row.user_id} and workspace_id = ${row.workspace_id}
      `.execute(db);
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-expand the infra child modules back into the four old top-level
  // modules, preserving each child's enabled state.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id,
      case module_id
        when 'infra:servers'   then 'servers'
        when 'infra:databases' then 'databases'
        when 'infra:websites'  then 'websites'
        when 'infra:alerts'    then 'alerts'
      end,
      enabled
    from workspace_modules
    where module_id in ('infra:servers', 'infra:databases', 'infra:websites', 'infra:alerts')
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('infra', 'infra:servers', 'infra:databases', 'infra:websites', 'infra:alerts')
  `.execute(db);

  // Re-expand infra module_event_settings into the four modules with infra's values.
  await sql`
    insert into module_event_settings (workspace_id, module_id, activity_on, alerts_on)
    select mes.workspace_id, old.module_id, mes.activity_on, mes.alerts_on
    from module_event_settings mes
    cross join (values ('servers'), ('databases'), ('websites'), ('alerts')) as old(module_id)
    where mes.module_id = 'infra'
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`delete from module_event_settings where module_id = 'infra'`.execute(db);

  // Map the nested '/infra/*' keys back to the old top-level keys in layouts/pins.
  const REVERSE_KEY_MAP: Record<string, string> = {
    '/infra/servers': '/servers',
    '/infra/databases': '/databases',
    '/infra/websites': '/websites',
    '/infra/alerts': '/alerts',
  };
  const reverseKeys = (keys: string[]): string[] => keys.map(k => REVERSE_KEY_MAP[k] ?? k);

  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    const next = reverseKeys(row.item_keys);
    if (JSON.stringify(next) === JSON.stringify(row.item_keys)) continue;
    await sql`
      update workspace_sidebar_groups
      set item_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
      where id = ${row.id}
    `.execute(db);
  }

  const prefs = await sql<{ user_id: string; workspace_id: string; pinned_keys: string[] }>`
    select user_id, workspace_id, pinned_keys from user_sidebar_prefs
  `.execute(db);
  for (const row of prefs.rows) {
    const next = reverseKeys(row.pinned_keys);
    if (JSON.stringify(next) === JSON.stringify(row.pinned_keys)) continue;
    await sql`
      update user_sidebar_prefs
      set pinned_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
      where user_id = ${row.user_id} and workspace_id = ${row.workspace_id}
    `.execute(db);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/db/migrations/20260713_001_infra_module_merge.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add packages/db/migrations && rtk git commit -m "feat(db): split infra workspace modules into parent and children"
```

---

### Task 3: API — generic `requireModuleFeature` gate + route rewiring

**Files:**
- Modify: `apps/api/src/middleware/module.ts` (replace `createRequireCrmFeature`)
- Modify: `apps/api/src/index.ts` (CRM call sites + infra mounts, lines ~352-356, ~376-391, ~452-469)
- Test: `apps/api/src/__tests__/module-middleware.test.ts`

**Interfaces:**
- Consumes: `isModuleEnabled` (private helper already in `module.ts`).
- Produces: `createRequireModuleFeature(db: Kysely<Database>)` returning `(parentId: string) => (subModuleId: string) => express middleware`. Passes only when BOTH parent and child are enabled; 403 `MODULE_DISABLED` otherwise. `createRequireCrmFeature` is deleted.

- [ ] **Step 1: Write the failing tests** — append to `apps/api/src/__tests__/module-middleware.test.ts`:

```ts
import { createRequireModuleFeature } from '../middleware/module';

describe('requireModuleFeature middleware (parent AND child)', () => {
  beforeEach(() => __clearModuleCacheForTesting());

  function dbWithRows(rows: Record<string, boolean | undefined>) {
    // executeTakeFirst resolves per module_id: the mock captures the id from
    // the second .where() call ('module_id', '=', id)
    let capturedId = '';
    const chain: any = {
      where: vi.fn((col: string, _op: string, val: string) => {
        if (col === 'module_id') capturedId = val;
        return chain;
      }),
      select: vi.fn().mockReturnValue(chain),
      executeTakeFirst: vi.fn(() =>
        Promise.resolve(rows[capturedId] === undefined ? undefined : { enabled: rows[capturedId] }),
      ),
    };
    return { selectFrom: vi.fn().mockReturnValue(chain) } as unknown as Kysely<Database>;
  }

  it('calls next() when parent and child are both enabled', async () => {
    const db = dbWithRows({ infra: true, 'infra:servers': true });
    const middleware = createRequireModuleFeature(db)('infra')('infra:servers');
    const next = vi.fn();
    await middleware(mockReq('ws-1') as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when parent is disabled', async () => {
    const db = dbWithRows({ infra: false, 'infra:servers': true });
    const middleware = createRequireModuleFeature(db)('infra')('infra:servers');
    const next = vi.fn();
    const res = mockRes();
    await middleware(mockReq('ws-2') as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when child is disabled', async () => {
    const db = dbWithRows({ crm: true, 'crm:contacts': false });
    const middleware = createRequireModuleFeature(db)('crm')('crm:contacts');
    const next = vi.fn();
    const res = mockRes();
    await middleware(mockReq('ws-3') as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter @vencore/api test -- module-middleware`
Expected: FAIL — `createRequireModuleFeature` not exported.

- [ ] **Step 3: Replace the CRM-specific gate in `apps/api/src/middleware/module.ts`**

Delete the whole `createRequireCrmFeature` function (including its doc comment) and add in its place:

```ts
/**
 * Gate a parent module's sub-page: the request passes only when BOTH the
 * parent module (e.g. `crm`, `infra`) and the given child module
 * (e.g. `crm:contacts`, `infra:servers`) are enabled.
 */
export function createRequireModuleFeature(db: Kysely<Database>) {
  return function requireModuleFeature(parentId: string) {
    return function (subModuleId: string) {
      return async function (
        req: Request,
        res: Response,
        next: NextFunction,
      ): Promise<void> {
        try {
          const { workspace } = req as AuthenticatedRequest;
          const parentEnabled = await isModuleEnabled(db, workspace.id, parentId);
          const childEnabled = await isModuleEnabled(db, workspace.id, subModuleId);
          if (!parentEnabled || !childEnabled) {
            res.status(403).json({
              data: null,
              error: {
                code: 'MODULE_DISABLED',
                message: `${subModuleId} is disabled for this workspace.`,
              },
            });
            return;
          }
          next();
        } catch (err) {
          next(err);
        }
      };
    };
  };
}
```

- [ ] **Step 4: Rewire `apps/api/src/index.ts`**

Change the import (line ~18) to:

```ts
import { createRequireModule, createRequireModuleFeature } from './middleware/module';
```

Replace line ~354 (`const requireCrmFeature = createRequireCrmFeature(db);`) with:

```ts
const requireModuleFeature = createRequireModuleFeature(db);
const requireCrmFeature = requireModuleFeature('crm');
const requireInfraFeature = requireModuleFeature('infra');
```

All existing `requireCrmFeature('crm:...')` call sites keep working unchanged (same call shape). Then change the infra mounts:

```ts
app.use('/api/alerts', requireAuth, requireInfraFeature('infra:alerts'), createAlertsRouter(db));
```

(replacing `requireModule('alerts')` at line ~393), and in the "Infra routes" block (~452-456):

```ts
app.use('/api/servers', requireAuth, requireInfraFeature('infra:servers'), createServersRouter(db, requirePermission));
app.use('/api/sse', requireAuth, createSseRouter(db));
app.use('/api/databases', requireAuth, requireInfraFeature('infra:databases'), createInfraDatabasesRouter(db));
app.use('/api/websites', requireAuth, requireInfraFeature('infra:websites'), createWebsitesRouter(db, env.CRON_SECRET, requirePermission));
app.use('/api/alert-thresholds', requireAuth, requireInfraFeature('infra:alerts'), createAlertThresholdsRouter(db));
```

and the SSH actions mount (~469):

```ts
app.use('/api/servers/:id/ssh', requireAuth, requireInfraFeature('infra:servers'), requirePermission('servers:ssh'), createSshActionsRouter(db));
```

Do NOT touch `/api/agent` (stays ungated) or `/api/ssh` (keypair router, stays `requireAuth` only).

- [ ] **Step 5: Run tests to verify they pass**

Run: `rtk pnpm --filter @vencore/api test -- module-middleware`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/api/src/middleware/module.ts apps/api/src/index.ts apps/api/src/__tests__/module-middleware.test.ts
rtk git commit -m "feat(api): generic parent/child module gate, wire infra sub-modules"
```

---

### Task 4: API — seeding, module PATCH, sidebar seeds, emitters, test fixtures

**Files:**
- Modify: `apps/api/src/lib/seed-modules.ts`
- Modify: `apps/api/src/routes/workspace-modules.ts`
- Modify: `apps/api/src/lib/sidebar-layout.ts`
- Modify: `apps/api/src/routes/infra-databases.ts` (4 emitter sites)
- Test: `apps/api/src/__tests__/workspace-modules.test.ts`, `apps/api/src/lib/sidebar-layout.test.ts`, `apps/api/src/middleware/ssh-permission.test.ts`, `apps/api/src/middleware/permission.test.ts`

**Interfaces:**
- Consumes: `INFRA_SUBMODULE_IDS`, `CRM_SUBMODULE_IDS` from `@vencore/modules` (Task 1).
- Produces: seeded `workspace_modules` rows include `infra` + its four children; PATCH accepts `infra:*` ids; `BUILTIN_ITEM_KEYS` and seeds use `/infra/*` keys.

- [ ] **Step 1: Update failing tests first**

`apps/api/src/lib/sidebar-layout.test.ts`: update every occurrence of `/servers`, `/databases`, `/websites`, `/alerts` in expected keys to `/infra/servers`, `/infra/databases`, `/infra/websites`, `/infra/alerts`, and expect the seed `Infra` group to be `['/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts']` and `Insights` to be `['/analytics']`.

`apps/api/src/__tests__/workspace-modules.test.ts`: replace the fixture row `{ module_id: 'servers', enabled: true }` with `{ module_id: 'infra', enabled: true }` and add a PATCH case for a child id. The file already has an equivalent test for `crm:*` ids — read it and copy its mock/setup shape exactly, asserting for `infra:servers`:

```ts
  it('PATCH accepts an infra child module id and upserts the row', async () => {
    // same db/app mock setup as the existing crm:* child test in this file,
    // with moduleId 'infra:servers' and body { enabled: false } — expect 200
    // and an insert...onConflict upsert for module_id 'infra:servers'.
  });
```

(Write the real body by copying the existing `crm:*` test in the same file — it is the source of truth for the mock shape; only the module id changes.)

`apps/api/src/middleware/ssh-permission.test.ts`: change `const ENABLED = [{ module_id: 'servers' }, { module_id: 'contacts' }];` to `const ENABLED = [{ module_id: 'infra' }, { module_id: 'crm' }];` (permission gating checks the owning module id from the registry, which is now `infra`; `contacts` was already stale — `crm` is the current owner of `contacts:*`).

`apps/api/src/middleware/permission.test.ts`: in the three `resolvePermissions(...)` calls replace `['crm', 'websites', 'servers', 'analytics', 'activity']` with `['crm', 'infra', 'analytics', 'activity']`, and `['websites']` with `['infra']`. Assertions on returned permission keys stay unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter @vencore/api test`
Expected: FAIL — sidebar seeds still emit old keys; PATCH rejects `infra:servers`.

- [ ] **Step 3: Update `apps/api/src/lib/sidebar-layout.ts`**

```ts
export const BUILTIN_ITEM_KEYS: readonly string[] = [
  '/crm/pipeline', '/crm/contacts', '/crm/companies', '/crm/tasks', '/activity',
  '/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts',
  '/messaging', '/projects',
  '/analytics',
  '/dashboard',
];

const SEED: ReadonlyArray<Readonly<{ label: string; is_default: boolean; item_keys: readonly string[] }>> = [
  { label: 'Sales',    is_default: false, item_keys: ['/crm/pipeline', '/crm/contacts', '/crm/companies', '/crm/tasks', '/activity'] },
  { label: 'Infra',    is_default: false, item_keys: ['/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts'] },
  { label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
  { label: 'Insights', is_default: false, item_keys: ['/analytics'] },
  { label: 'General',  is_default: true,  item_keys: ['/dashboard'] },
];
```

(rest of the file unchanged).

- [ ] **Step 4: Update `apps/api/src/lib/seed-modules.ts`**

Replace the file's import + map + row-building with:

```ts
import { CRM_SUBMODULE_IDS, INFRA_SUBMODULE_IDS } from '@vencore/modules';

// Maps installer feature flags → module IDs they control
const FEATURE_MODULE_MAP: Record<string, string[]> = {
  crm:       ['crm', 'activity', ...CRM_SUBMODULE_IDS],
  infra:     ['infra:servers', 'infra:databases', 'infra:websites'],
  analytics: ['analytics'],
  alerts:    ['infra:alerts'],
};

const ALL_SUBMODULE_IDS = [...CRM_SUBMODULE_IDS, ...INFRA_SUBMODULE_IDS];
```

and build rows as:

```ts
  const rows = [
    ...MODULE_REGISTRY.map(m => ({
      workspace_id: workspaceId,
      module_id: m.id,
      // The infra parent stays enabled unless every one of its children is
      // disabled by installer features (infra + alerts both deselected).
      enabled:
        m.id === 'infra'
          ? INFRA_SUBMODULE_IDS.some(id => !disabledModules.has(id))
          : disabledModules.has(m.id) ? false : m.defaultEnabled,
    })),
    // Parent-module children (crm:*/infra:*) — enabled by default, gated at
    // runtime by their parent.
    ...ALL_SUBMODULE_IDS.map(id => ({
      workspace_id: workspaceId,
      module_id: id,
      enabled: !disabledModules.has(id),
    })),
  ];
```

(the surrounding function body — disabled-set build and the insert — is unchanged).

- [ ] **Step 5: Update `apps/api/src/routes/workspace-modules.ts`**

Import change:

```ts
import { CRM_SUBMODULE_IDS, INFRA_SUBMODULE_IDS } from '@vencore/modules';
```

Allowed-id check becomes:

```ts
      if (
        !MODULE_IDS.includes(moduleId) &&
        !CRM_SUBMODULE_IDS.includes(moduleId) &&
        !INFRA_SUBMODULE_IDS.includes(moduleId)
      ) {
```

`MODULE_PROVIDER_MAP` becomes (old `servers`/`databases`/`websites`/`alerts` keys removed, `infra` added — the vencore-infra hook provider now follows the parent toggle):

```ts
const MODULE_PROVIDER_MAP: Record<string, { providerId: string; name: string } | null> = {
  'crm':        { providerId: 'vencore-crm',       name: 'Vencore CRM' },
  'messaging':  { providerId: 'vencore-messaging', name: 'Vencore Messaging' },
  'infra':      { providerId: 'vencore-infra',     name: 'Vencore Infra' },
  'analytics':  null,
  'activity':   null,
  'dashboard':  null,
  'projects':   null,
};
```

- [ ] **Step 6: Update emitters in `apps/api/src/routes/infra-databases.ts`**

Replace all four occurrences (lines ~295, ~340, ~379, ~518) of:

```ts
        source_module_id: 'databases',
```

with:

```ts
        source_module_id: 'infra',
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `rtk pnpm --filter @vencore/api test`
Expected: PASS (all suites).

- [ ] **Step 8: Commit**

```bash
rtk git add apps/api packages
rtk git commit -m "feat(api): seed infra children, sidebar keys, module PATCH and emitters use infra id"
```

---

### Task 5: Web — route moves, infra layout, redirects

**Files:**
- Move: `apps/web/app/(dashboard)/servers` → `apps/web/app/(dashboard)/infra/servers` (and same for `databases`, `websites`, `alerts`)
- Create: `apps/web/app/(dashboard)/infra/layout.tsx`, `apps/web/app/(dashboard)/infra/page.tsx`
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: `ModuleGuard` from `@/modules/shared/components/ModuleGuard`; child module ids from Task 1.
- Produces: pages served at `/infra/servers`, `/infra/servers/[id]`, `/infra/databases`, `/infra/databases/[id]`, `/infra/websites`, `/infra/alerts`; old URLs 308-redirect.

- [ ] **Step 1: Move the route directories**

```bash
mkdir "apps/web/app/(dashboard)/infra"
rtk git mv "apps/web/app/(dashboard)/servers"   "apps/web/app/(dashboard)/infra/servers"
rtk git mv "apps/web/app/(dashboard)/databases" "apps/web/app/(dashboard)/infra/databases"
rtk git mv "apps/web/app/(dashboard)/websites"  "apps/web/app/(dashboard)/infra/websites"
rtk git mv "apps/web/app/(dashboard)/alerts"    "apps/web/app/(dashboard)/infra/alerts"
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/infra/layout.tsx`** (mirror of `crm/layout.tsx`):

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';

const SUB_MODULE_BY_SEGMENT: Record<string, string> = {
  servers: 'infra:servers',
  databases: 'infra:databases',
  websites: 'infra:websites',
  alerts: 'infra:alerts',
};

export default function InfraLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const segment = pathname.split('/')[2] ?? '';
  const moduleId = SUB_MODULE_BY_SEGMENT[segment] ?? 'infra';

  return <ModuleGuard moduleId={moduleId}>{children}</ModuleGuard>;
}
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/infra/page.tsx`**:

```tsx
import { redirect } from 'next/navigation';

export default function InfraIndexPage() {
  redirect('/infra/servers');
}
```

- [ ] **Step 4: Add redirects in `apps/web/next.config.ts`** — append inside the existing `redirects()` array, after the `/tasks/:path*` entry:

```ts
      { source: '/servers', destination: '/infra/servers', permanent: true },
      { source: '/servers/:path*', destination: '/infra/servers/:path*', permanent: true },
      { source: '/databases', destination: '/infra/databases', permanent: true },
      { source: '/databases/:path*', destination: '/infra/databases/:path*', permanent: true },
      { source: '/websites', destination: '/infra/websites', permanent: true },
      { source: '/websites/:path*', destination: '/infra/websites/:path*', permanent: true },
      { source: '/alerts', destination: '/infra/alerts', permanent: true },
      { source: '/alerts/:path*', destination: '/infra/alerts/:path*', permanent: true },
```

- [ ] **Step 5: Commit** (imports inside moved files are fixed in Task 6; the tree may not typecheck until then, so commit the move as-is)

```bash
rtk git add -A apps/web/app apps/web/next.config.ts
rtk git commit -m "feat(web): move infra pages under /infra with redirects and module guard"
```

---

### Task 6: Web — feature-code move, imports, nav/links, generic child check, settings

**Files:**
- Move: `apps/web/modules/servers` → `apps/web/modules/infra/servers`; `apps/web/modules/databases` → `apps/web/modules/infra/databases`; `apps/web/modules/alerts` → `apps/web/modules/infra/alerts`
- Modify: all importers of the moved dirs (20 files — find with grep, listed below)
- Modify: `apps/web/modules/shared/contexts/modules.tsx`
- Modify: `apps/web/modules/shared/components/Sidebar.tsx`
- Modify: `apps/web/modules/shared/components/Topbar.tsx`
- Modify: `apps/web/modules/shared/hooks/useSidebarLayout.ts`
- Modify: `apps/web/app/(dashboard)/settings/modules/page.tsx`
- Modify: old-path links in `apps/web/app/(dashboard)/infra/servers/page.tsx`, `.../infra/servers/[id]/page.tsx`, `apps/web/modules/infra/databases/pages/page.tsx`, `.../databases/components/detail/DatabaseHeader.tsx`, `.../infra/alerts/components/AlertsWidget.tsx`, `.../infra/servers/components/ServersWidget.tsx`

**Interfaces:**
- Consumes: module rows from `GET /api/workspace/modules` (now containing `infra` + `infra:*`).
- Produces: `useModules().isEnabled('infra:servers')` returns parent-AND-child; sidebar renders four `/infra/*` entries; settings page shows Infrastructure with chevron sub-toggles.

- [ ] **Step 1: Move directories and fix imports**

```bash
mkdir apps/web/modules/infra
rtk git mv apps/web/modules/servers   apps/web/modules/infra/servers
rtk git mv apps/web/modules/databases apps/web/modules/infra/databases
rtk git mv apps/web/modules/alerts    apps/web/modules/infra/alerts
```

Then rewrite import specifiers across `apps/web` (20 known files; use search-replace, not manual edits):
- `@/modules/servers/` → `@/modules/infra/servers/`
- `@/modules/databases/` → `@/modules/infra/databases/`
- `@/modules/alerts/` → `@/modules/infra/alerts/`

Known importer files: `modules/shared/lib/register-module-widgets.ts`, `app/(dashboard)/infra/servers/page.tsx`, `app/(dashboard)/infra/servers/[id]/page.tsx`, `app/(dashboard)/infra/databases/page.tsx`, `app/(dashboard)/infra/databases/[id]/page.tsx`, `app/(dashboard)/infra/alerts/page.tsx`, `app/(dashboard)/settings/ssh/page.tsx`, and files inside the moved dirs themselves (`infra/servers/components/detail/*.tsx`, `infra/databases/pages/*`, `infra/databases/components/detail/AlertsTab.tsx`, `infra/servers/components/ServersWidget.tsx`). Verify none remain:

```bash
grep -rEn "@/modules/(servers|databases|alerts)/" apps/web --include=*.ts --include=*.tsx
```

Expected: no matches.

- [ ] **Step 2: Generalize the child check in `apps/web/modules/shared/contexts/modules.tsx`**

Replace the `isEnabled` body with:

```ts
  function isEnabled(moduleId: string): boolean {
    // Child modules (`parent:child`) are effective only when their parent is
    // on; a missing child row defaults to enabled.
    const sep = moduleId.indexOf(':');
    if (sep > 0) {
      const parentId = moduleId.slice(0, sep);
      const parent = modules.find(m => m.module_id === parentId);
      if (!(parent?.enabled ?? false)) return false;
      const child = modules.find(m => m.module_id === moduleId);
      return child?.enabled ?? true;
    }
    const row = modules.find(m => m.module_id === moduleId);
    return row?.enabled ?? false;
  }
```

- [ ] **Step 3: Sidebar entries — `apps/web/modules/shared/components/Sidebar.tsx`**

In `NAV_ITEMS`, replace the four old entries:

```ts
  '/infra/servers':   { label: 'Servers',   icon: 'servers',   moduleId: 'infra:servers',   feature: 'infra' },
  '/infra/databases': { label: 'Databases', icon: 'databases', moduleId: 'infra:databases', feature: 'infra' },
  '/infra/websites':  { label: 'Websites',  icon: 'websites',  moduleId: 'infra:websites',  feature: 'infra' },
```

and change the `'/alerts'` entry key/moduleId (keep `dot: true`, keep no `feature` flag so the alerts entry survives an installer `infra: false` selection, matching current behavior):

```ts
  '/infra/alerts':    { label: 'Alerts',    icon: 'alerts',    moduleId: 'infra:alerts', dot: true },
```

Also update the critical-dot check (line ~318): `href === '/alerts'` → `href === '/infra/alerts'`.

- [ ] **Step 4: Topbar titles — `apps/web/modules/shared/components/Topbar.tsx`**

Replace the four old keys in `PAGE_TITLES`:

```ts
  '/infra/servers': 'Servers',
  '/infra/databases': 'Databases',
  '/infra/websites': 'Websites',
  '/infra/alerts': 'Alerts',
```

and extend the segment resolution to handle nested infra paths:

```ts
  const segment =
    parts[0] === 'crm' || parts[0] === 'infra'
      ? `/${parts[0]}/${parts[1] ?? ''}`
      : '/' + (parts[0] ?? '');
```

- [ ] **Step 5: Client sidebar seed — `apps/web/modules/shared/hooks/useSidebarLayout.ts`**

Update the fallback seed groups (line ~22-24) to match the API seed from Task 4:

```ts
  { id: null, label: 'Infra',    is_default: false, item_keys: ['/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts'] },
```

and the `Insights` line becomes `item_keys: ['/analytics']`.

- [ ] **Step 6: Old-path links → `/infra/*`**

In the files listed in **Files**, update every `router.push`/`href` target:
- `'/servers'` → `'/infra/servers'`, `` `/servers/${s.id}` `` → `` `/infra/servers/${s.id}` `` (servers list page ×2, server detail back button, `ServersWidget` ×2)
- `` `/databases/${db.id}` `` → `` `/infra/databases/${db.id}` `` (databases list page ×3 incl. `?tab=alerts` variant), `'/databases'` → `'/infra/databases'` (`DatabaseHeader`)
- `"/alerts"` → `"/infra/alerts"` (`AlertsWidget` ×2)

Verify no stragglers:

```bash
grep -rEn "['\"\`]/(servers|databases|websites|alerts)(/|['\"\`?])" apps/web/app apps/web/modules --include=*.tsx --include=*.ts
```

Expected: no matches (all hits now start with `/infra/`).

- [ ] **Step 7: Settings modules page — `apps/web/app/(dashboard)/settings/modules/page.tsx`**

Add an infra submodule list next to the CRM one and collapse the three standalone rows into one Infrastructure row:

```ts
const INFRA_SUBMODULES: SubModuleMeta[] = [
  { id: 'infra:servers',   name: 'Servers' },
  { id: 'infra:databases', name: 'Databases' },
  { id: 'infra:websites',  name: 'Websites' },
  { id: 'infra:alerts',    name: 'Alerts' },
];
```

In `MODULE_META`, replace the `websites`, `servers`, `databases` entries with a single entry placed after `crm` (there is no `alerts` entry today — the Alerts toggle becomes the `infra:alerts` sub-toggle):

```ts
  { id: 'infra', name: 'Infrastructure', description: 'Servers, databases, website uptime, and alerting.', settingsHref: null, subModules: INFRA_SUBMODULES },
```

The existing generic rendering (chevron expand + sub-toggle rows keyed off `mod.subModules`) handles it with no further JSX changes.

- [ ] **Step 8: Typecheck the web app**

Run: `rtk npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no errors. (If path aliases make this awkward, `rtk pnpm --filter ./apps/web build` is the fallback; expect a clean build.)

- [ ] **Step 9: Commit**

```bash
rtk git add -A apps/web
rtk git commit -m "feat(web): infra sidebar entries, sub-module toggles, generic child module checks"
```

---

### Task 7: Full verification + graph refresh

**Files:**
- No new source changes expected (fixes only if verification fails).

- [ ] **Step 1: Run every test suite**

```bash
rtk pnpm --filter @vencore/modules test
rtk pnpm --filter @vencore/api test
npx vitest run packages/db/migrations/20260713_001_infra_module_merge.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Build web**

Run: `rtk pnpm --filter ./apps/web build`
Expected: clean build; route list shows `/infra/servers`, `/infra/databases`, `/infra/websites`, `/infra/alerts` and no top-level `/servers` etc.

- [ ] **Step 3: Preview verification** (use the Browser pane preview tools with the dev servers; migration must run against the dev DB first — `pnpm --filter @vencore/db migrate` or the repo's usual migration command):
  - Sidebar shows Servers, Databases, Websites, Alerts entries pointing at `/infra/*`; old URLs `/servers`, `/databases/<id>`, `/alerts` redirect.
  - `/infra` redirects to `/infra/servers`.
  - Settings → Modules shows one Infrastructure toggle; chevron reveals four sub-toggles; toggling Websites off hides the sidebar entry and `GET /api/websites` returns 403 `MODULE_DISABLED`.
  - Toggling Infrastructure off hides all four entries and 403s `/api/servers`, `/api/databases`, `/api/websites`, `/api/alerts`, `/api/alert-thresholds`.
  - Dashboard: Servers and Alerts widgets render and their links land on `/infra/servers` / `/infra/alerts`.
  - Settings → Activity/Alerts (module events) lists a single Infrastructure row.

- [ ] **Step 4: Refresh the knowledge graph**

Run: `graphify update .`

- [ ] **Step 5: Commit any verification fixes + graph output**

```bash
rtk git add -A && rtk git commit -m "chore: refresh graphify output for infra module merge"
```

---

## Self-Review Notes

- Spec coverage: registry (Task 1), migration incl. `module_event_settings` (Task 2), generic gate + route wiring (Task 3), seeding/PATCH/sidebar/emitters (Task 4), routes + redirects (Task 5), web move + nav + settings + generic child check (Task 6), testing (Tasks 1-4 inline, Task 7 end-to-end). `/api/agent` deliberately untouched per amended spec.
- The tree does not typecheck between Tasks 5 and 6 (moved pages still import old paths); Tasks 5 and 6 must land in that order.
- Type consistency: `SubModule` defined once (Task 1) and consumed by Tasks 3-6 via ids only; `createRequireModuleFeature(db)(parentId)(childId)` shape used identically in Tasks 3 and its tests.
