# CRM Module Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `contacts`, `companies`, `pipelines`, and `tasks` modules into a single `crm` module (one registry entry, one toggle, one sidebar item at `/crm` with tabbed sub-pages, merged web code), plus two new dashboard widgets (Alerts, Activity).

**Architecture:** One new `CRM_MODULE` definition replaces four registry entries; permission keys stay unchanged so no permission data migrates. A DB migration consolidates `workspace_modules` rows (enabled = AND of the four) and rewrites sidebar layout item keys to `/crm`. Web pages move under `app/(dashboard)/crm/` behind a shared tab layout; feature code moves under `modules/crm/`; old URLs get permanent redirects. Alerts/Activity widgets join the existing dashboard widget registry.

**Tech Stack:** Kysely migrations (`packages/db`), Express + Zod (`apps/api`), Vitest (root runner: `npx vitest run <path>`), Next.js App Router + React Query (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-07-12-crm-module-merge-design.md`

## Global Constraints

- Branch: `feat/crm-module` (already checked out, tracks `origin/development`). Never commit to `main`.
- Every DB query scoped by `workspace_id`.
- API responses: `{ data, error: null }` or `{ data: null, error: { code, message } }`.
- No `any` in new code (test mocks may cast). No `console.log` in production paths.
- Never modify existing migration files — new file only.
- JSONB array columns are written with `JSON.stringify(...)`.
- Permission keys stay verbatim: `contacts:*`, `companies:*`, `pipelines:*`, `tasks:*` — only their owning module changes to `crm`.
- The `activity` module is NOT merged — leave every `activity` reference alone.
- The dangling `/items` nav entry from `pipelines` is dropped, not carried over (no `/items` route exists).
- Web has no component-test harness; web verification is via preview tools (Task 9).
- Design tokens per CLAUDE.md (`--border`, `--surface`, `--text`, `--text2`, `--text3`, `--red`, `--red-bg`, `--amber`, `--amber-bg`).
- Commit messages: conventional commits, no AI/tool attribution lines of any kind.
- Test runner is the root vitest: `npx vitest run <path>` from repo root (RTK-wrapped: `rtk vitest run <path>`).

---

### Task 1: `packages/modules` — CRM module definition

**Files:**
- Create: `packages/modules/src/crm/index.ts`
- Modify: `packages/modules/src/index.ts`
- Modify: `packages/modules/src/index.test.ts`
- Delete: `packages/modules/src/contacts/`, `packages/modules/src/companies/`, `packages/modules/src/pipelines/`, `packages/modules/src/tasks/` (directories)

**Interfaces:**
- Consumes: existing `ModuleDefinition` type from `packages/modules/src/types.ts`.
- Produces: `CRM_MODULE: ModuleDefinition` with `id: 'crm'`, exported from `@vencore/modules`; `MODULE_REGISTRY` no longer contains `contacts`, `companies`, `pipelines`, `tasks`. Tasks 2–8 rely on module id `'crm'`.

- [ ] **Step 1: Update the test to describe the merged registry**

In `packages/modules/src/index.test.ts`, make these edits:

Replace the `getModuleForPermission` known-permission test body:

```ts
  it('returns correct moduleId for known permission', () => {
    expect(getModuleForPermission('contacts:create')).toBe('crm');
    expect(getModuleForPermission('pipelines:stage.edit')).toBe('crm');
    expect(getModuleForPermission('tasks:delete')).toBe('crm');
    expect(getModuleForPermission('servers:delete')).toBe('servers');
    expect(getModuleForPermission('analytics:view')).toBe('analytics');
  });
```

Replace the `has 8 modules` test (its count is stale anyway) with:

```ts
  it('contains crm and not the merged module ids', () => {
    const ids = MODULE_REGISTRY.map(m => m.id);
    expect(ids).toContain('crm');
    for (const old of ['contacts', 'companies', 'pipelines', 'tasks']) {
      expect(ids).not.toContain(old);
    }
  });

  it('crm module carries all merged permission keys', () => {
    const crm = MODULE_REGISTRY.find(m => m.id === 'crm');
    const keys = crm!.permissions.map(p => p.key);
    expect(keys).toEqual(expect.arrayContaining([
      'contacts:view', 'contacts:delete',
      'companies:view', 'companies:delete',
      'pipelines:view', 'pipelines:config', 'pipelines:field.delete',
      'tasks:view', 'tasks:delete',
    ]));
    expect(keys).toHaveLength(21);
  });
```

Keep the member/admin permission tests unchanged (they reference keys, not module ids).

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run packages/modules/src/index.test.ts`
Expected: FAIL — `crm` not in registry, `getModuleForPermission('contacts:create')` returns `'contacts'`.

- [ ] **Step 3: Create `packages/modules/src/crm/index.ts`**

```ts
import type { ModuleDefinition } from '../types';

export const CRM_MODULE: ModuleDefinition = {
  id: 'crm',
  name: 'CRM',
  description: 'Contacts, companies, deals pipeline, and tasks.',
  icon: 'Kanban',
  defaultEnabled: true,
  permissions: [
    { key: 'contacts:view',   label: 'View contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:create', label: 'Create contacts', defaultRoles: ['admin', 'member'] },
    { key: 'contacts:edit',   label: 'Edit contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:delete', label: 'Delete contacts', defaultRoles: ['admin'] },
    { key: 'companies:view',   label: 'View companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:create', label: 'Create companies', defaultRoles: ['admin', 'member'] },
    { key: 'companies:edit',   label: 'Edit companies',   defaultRoles: ['admin', 'member'] },
    { key: 'companies:delete', label: 'Delete companies', defaultRoles: ['admin'] },
    { key: 'pipelines:view',         label: 'View pipelines & deals',                       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:create',       label: 'Create deals & records',                       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:edit',         label: 'Edit deals & records',                         defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:delete',       label: 'Delete deals & records',                       defaultRoles: ['admin'] },
    { key: 'pipelines:config',       label: 'Change pipeline settings (name, description, default)', defaultRoles: ['admin'] },
    { key: 'pipelines:stage.edit',   label: 'Edit stages (rename, reorder, recolor)',       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:stage.delete', label: 'Delete stages',                                defaultRoles: ['admin'] },
    { key: 'pipelines:field.edit',   label: 'Edit fields (rename, reorder, toggle required, edit options)', defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:field.delete', label: 'Delete fields',                                defaultRoles: ['admin'] },
    { key: 'tasks:view',   label: 'View tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:create', label: 'Create tasks', defaultRoles: ['admin', 'member'] },
    { key: 'tasks:edit',   label: 'Edit tasks',   defaultRoles: ['admin', 'member'] },
    { key: 'tasks:delete', label: 'Delete tasks', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'CRM', path: '/crm', icon: 'Kanban' }],
  apiPrefixes: ['/contacts', '/companies', '/deals', '/pipelines', '/stages', '/items', '/item-groups', '/conversions', '/record-types', '/records', '/tasks'],
  workers: ['task-due-notifier'],
  emitsActivity: true,
};
```

- [ ] **Step 4: Update `packages/modules/src/index.ts`**

Remove these four export lines:

```ts
export * from './contacts';
export * from './companies';
export * from './pipelines';
export * from './tasks';
```

Add in their place:

```ts
export * from './crm';
```

Remove these four imports:

```ts
import { CONTACTS_MODULE } from './contacts';
import { COMPANIES_MODULE } from './companies';
import { PIPELINES_MODULE } from './pipelines';
import { TASKS_MODULE } from './tasks';
```

Add:

```ts
import { CRM_MODULE } from './crm';
```

In `MODULE_REGISTRY`, replace the four entries `CONTACTS_MODULE, COMPANIES_MODULE, PIPELINES_MODULE, TASKS_MODULE` with the single entry `CRM_MODULE` (keep it after `DASHBOARD_MODULE`).

- [ ] **Step 5: Delete the merged module directories**

```bash
rtk git rm -r packages/modules/src/contacts packages/modules/src/companies packages/modules/src/pipelines packages/modules/src/tasks
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `rtk vitest run packages/modules/src/index.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Check for stray imports of the deleted modules**

Run: `rtk grep -rn "CONTACTS_MODULE\|COMPANIES_MODULE\|PIPELINES_MODULE\|TASKS_MODULE" --include="*.ts" apps packages`
Expected: no matches outside this plan's later tasks. If `apps/api` matches appear, they are handled in Task 2.

- [ ] **Step 8: Commit**

```bash
rtk git add -A packages/modules
rtk git commit -m "feat(modules): merge contacts, companies, pipelines, tasks into crm module"
```

---

### Task 2: `apps/api` — registry consumers (seeding, provider map, route mounts)

**Files:**
- Modify: `apps/api/src/lib/seed-modules.ts`
- Modify: `apps/api/src/routes/workspace-modules.ts`
- Modify: `apps/api/src/index.ts:370-385`
- Modify: `apps/api/src/__tests__/workspace-modules.test.ts`

**Interfaces:**
- Consumes: `MODULE_REGISTRY` / `MODULE_IDS` now containing `crm` (Task 1).
- Produces: API routes `/api/contacts`, `/api/companies`, `/api/pipelines`, `/api/pipelines/:pipelineId/*`, `/api/items`, `/api/tasks`, `/api/tasks/unified` all gated by `requireModule('crm')`. `PATCH /api/workspace/modules/crm` toggles the merged module and (de)registers the `vencore-crm` hook provider.

- [ ] **Step 1: Update `workspace-modules.test.ts` to describe the merged module**

Replace the `mockModuleRows` constant:

```ts
const mockModuleRows = [
  { module_id: 'crm', enabled: true },
  { module_id: 'servers', enabled: true },
  { module_id: 'messaging', enabled: false },
];
```

Then search the file for every remaining occurrence of `'contacts'`, `'companies'`, `'pipelines'`, `'tasks'` used as a module id (PATCH URLs like `/api/workspace/modules/contacts`, provider-registration assertions for `vencore-crm`) and replace the module id with `'crm'`. Assertions that `vencore-crm` gets registered/deregistered stay — `crm` maps to that provider after Step 3.

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run apps/api/src/__tests__/workspace-modules.test.ts`
Expected: FAIL — `crm` rejected as `INVALID_MODULE`? No: `MODULE_IDS` already contains `crm` after Task 1, but the provider-map assertions fail because `MODULE_PROVIDER_MAP` has no `crm` entry yet.
(If everything passes already, continue — the provider map change in Step 3 is still required for runtime behavior; verify with the Step 5 grep.)

- [ ] **Step 3: Update `MODULE_PROVIDER_MAP` in `apps/api/src/routes/workspace-modules.ts`**

Replace the map with:

```ts
const MODULE_PROVIDER_MAP: Record<string, { providerId: string; name: string } | null> = {
  'crm':        { providerId: 'vencore-crm',       name: 'Vencore CRM' },
  'messaging':  { providerId: 'vencore-messaging', name: 'Vencore Messaging' },
  'servers':    { providerId: 'vencore-infra',     name: 'Vencore Infra' },
  'databases':  { providerId: 'vencore-infra',     name: 'Vencore Infra' },
  'analytics':  null,
  'activity':   null,
  'websites':   null,
  'dashboard':  null,
  'projects':   null,
  'alerts':     null,
};
```

- [ ] **Step 4: Update `FEATURE_MODULE_MAP` in `apps/api/src/lib/seed-modules.ts`**

```ts
const FEATURE_MODULE_MAP: Record<string, string[]> = {
  crm:       ['crm', 'activity'],
  infra:     ['websites', 'servers', 'databases'],
  analytics: ['analytics'],
  alerts:    [],  // no module yet — handled by alerts system
};
```

Also change the stale comment `// Insert all 8, skip conflicts (idempotent)` to `// Insert one row per registry module, skip conflicts (idempotent)`.

- [ ] **Step 5: Update route mounts in `apps/api/src/index.ts`**

Change the module id on these eight mounts (lines ~370–385) from their current ids to `'crm'`:

```ts
app.use('/api/contacts', requireAuth, requireModule('crm'), createContactsRouter(db, requirePermission));
app.use('/api/companies', requireAuth, requireModule('crm'), createCompaniesRouter(db, requirePermission));
app.use('/api/pipelines', requireAuth, requireModule('crm'), createPipelinesRouter(db, requirePermission));
app.use('/api/pipelines/:pipelineId/fields', requireAuth, requireModule('crm'), createPipelineFieldsRouter(db, requirePermission));
app.use('/api/pipelines/:pipelineId/items', requireAuth, requireModule('crm'), createPipelineItemsRouter(db, requirePermission));
app.use('/api/items', requireAuth, requireModule('crm'), createItemRouter(db, requirePermission));
app.use('/api/tasks/unified', requireAuth, requireModule('crm'), createUnifiedTasksRouter(db, requirePermission));
app.use('/api/tasks', requireAuth, requireModule('crm'), createTasksRouter(db, requirePermission));
```

There is one more `requireModule('pipelines')` around line 381 (multi-line mount) — change it to `'crm'` as well. Do NOT touch `requireModule('activity')` on `/api/activity`.

Then verify nothing references the old ids as modules:

Run: `rtk grep -n "requireModule('contacts'\|requireModule('companies'\|requireModule('pipelines'\|requireModule('tasks'" apps/api/src`
Expected: no matches.

- [ ] **Step 6: Run tests to verify they pass**

Run: `rtk vitest run apps/api/src/__tests__/workspace-modules.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the whole API test suite to catch other registry-dependent tests**

Run: `rtk vitest run apps/api`
Expected: PASS. If a test fails because it references one of the four old module ids (e.g. permission or group tests using `getModuleForPermission`), update that reference to `'crm'` — permission keys themselves never change.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/api
rtk git commit -m "feat(api): gate crm routes and providers by merged crm module"
```

---

### Task 3: `apps/api` — sidebar layout seeds

**Files:**
- Modify: `apps/api/src/lib/sidebar-layout.ts`
- Modify: `apps/api/src/lib/sidebar-layout.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BUILTIN_ITEM_KEYS` containing `/crm` (not `/pipeline`, `/contacts`, `/companies`, `/tasks`); seed group `Sales` = `['/crm', '/activity']`. The Task 4 migration and Task 5 web fallback mirror these keys.

- [ ] **Step 1: Update the seed test**

In `sidebar-layout.test.ts`, replace the first `seedGroups` assertion block:

```ts
  it('returns the five seed groups with General as the only default', () => {
    const groups = seedGroups()
    expect(groups.map(g => g.label)).toEqual(['Sales', 'Infra', 'Projects', 'Insights', 'General'])
    expect(groups.filter(g => g.is_default).map(g => g.label)).toEqual(['General'])
    expect(groups.find(g => g.label === 'Sales')!.item_keys).toEqual(['/crm', '/activity'])
    expect(groups.find(g => g.label === 'Insights')!.item_keys).toEqual(['/analytics', '/alerts'])
    expect(groups.flatMap(g => g.item_keys)).not.toContain('/settings')
    expect(groups.flatMap(g => g.item_keys)).not.toContain('/pipeline')
  })
```

The `mergeLayout` and `validateLayout` tests use `/pipeline` only as an arbitrary key — leave them unchanged.

- [ ] **Step 2: Run tests to verify the seed test fails**

Run: `rtk vitest run apps/api/src/lib/sidebar-layout.test.ts`
Expected: FAIL on the seed assertion only.

- [ ] **Step 3: Update `sidebar-layout.ts`**

```ts
export const BUILTIN_ITEM_KEYS: readonly string[] = [
  '/crm', '/activity',
  '/servers', '/databases', '/websites',
  '/messaging', '/projects',
  '/analytics', '/alerts',
  '/dashboard',
];
```

```ts
const SEED: ReadonlyArray<Readonly<{ label: string; is_default: boolean; item_keys: readonly string[] }>> = [
  { label: 'Sales',    is_default: false, item_keys: ['/crm', '/activity'] },
  { label: 'Infra',    is_default: false, item_keys: ['/servers', '/databases', '/websites'] },
  { label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
  { label: 'Insights', is_default: false, item_keys: ['/analytics', '/alerts'] },
  { label: 'General',  is_default: true,  item_keys: ['/dashboard'] },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run apps/api/src/lib/sidebar-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/lib/sidebar-layout.ts apps/api/src/lib/sidebar-layout.test.ts
rtk git commit -m "feat(api): sidebar seeds use /crm item key"
```

---

### Task 4: DB migration — module rows + sidebar key rewrite

**Files:**
- Create: `packages/db/migrations/20260712_001_crm_module_merge.ts`
- Create: `packages/db/migrations/20260712_001_crm_module_merge.test.ts`

**Interfaces:**
- Consumes: tables `workspace_modules`, `workspace_sidebar_groups`, `user_sidebar_prefs` (shapes in `packages/db/src/schema.ts` and `packages/db/migrations/20260711_001_sidebar_layout.ts`).
- Produces: exported pure helpers `deriveCrmEnabled(enabledByModule: Record<string, boolean | undefined>): boolean` and `rewriteKeysForCrm(keys: string[]): string[]` (tested); migrated data.

- [ ] **Step 1: Write the failing helper tests**

Create `packages/db/migrations/20260712_001_crm_module_merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveCrmEnabled, rewriteKeysForCrm } from './20260712_001_crm_module_merge';

describe('deriveCrmEnabled', () => {
  it('true only when all four are enabled', () => {
    expect(deriveCrmEnabled({ contacts: true, companies: true, pipelines: true, tasks: true })).toBe(true);
    expect(deriveCrmEnabled({ contacts: true, companies: true, pipelines: false, tasks: true })).toBe(false);
  });

  it('missing rows count as enabled (defaultEnabled)', () => {
    expect(deriveCrmEnabled({ contacts: true })).toBe(true);
    expect(deriveCrmEnabled({})).toBe(true);
    expect(deriveCrmEnabled({ tasks: false })).toBe(false);
  });
});

describe('rewriteKeysForCrm', () => {
  it('replaces the first old key in place and drops the rest', () => {
    expect(rewriteKeysForCrm(['/pipeline', '/contacts', '/companies', '/tasks', '/activity']))
      .toEqual(['/crm', '/activity']);
  });

  it('keeps position when old keys are interleaved', () => {
    expect(rewriteKeysForCrm(['/dashboard', '/contacts', '/servers', '/tasks']))
      .toEqual(['/dashboard', '/crm', '/servers']);
  });

  it('leaves untouched lists alone', () => {
    expect(rewriteKeysForCrm(['/dashboard', '/alerts'])).toEqual(['/dashboard', '/alerts']);
  });

  it('does not duplicate an existing /crm key', () => {
    expect(rewriteKeysForCrm(['/crm', '/contacts', '/tasks'])).toEqual(['/crm']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run packages/db/migrations/20260712_001_crm_module_merge.test.ts`
Expected: FAIL — module has no such exports.

- [ ] **Step 3: Write the migration**

Create `packages/db/migrations/20260712_001_crm_module_merge.ts`:

```ts
import { type Kysely, sql } from 'kysely';

const OLD_MODULE_IDS = ['contacts', 'companies', 'pipelines', 'tasks'] as const;
const OLD_ITEM_KEYS = ['/pipeline', '/contacts', '/companies', '/tasks'] as const;

export function deriveCrmEnabled(enabledByModule: Record<string, boolean | undefined>): boolean {
  return OLD_MODULE_IDS.every(id => enabledByModule[id] !== false);
}

export function rewriteKeysForCrm(keys: string[]): string[] {
  const out: string[] = [];
  let placed = keys.includes('/crm');
  for (const key of keys) {
    if ((OLD_ITEM_KEYS as readonly string[]).includes(key)) {
      if (!placed) {
        out.push('/crm');
        placed = true;
      }
      continue;
    }
    out.push(key);
  }
  return out;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Consolidate workspace_modules: crm enabled only when all four were enabled.
  //    Missing rows count as enabled (all four had defaultEnabled: true), which
  //    bool_and over present rows matches.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id, 'crm', bool_and(enabled)
    from workspace_modules
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
  `.execute(db);

  // 2. Rewrite sidebar group item keys.
  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    const next = rewriteKeysForCrm(row.item_keys);
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
    const next = rewriteKeysForCrm(row.pinned_keys);
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
  // Re-expand crm into the four modules with crm's enabled value.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select wm.workspace_id, old.module_id, wm.enabled
    from workspace_modules wm
    cross join (values ('contacts'), ('companies'), ('pipelines'), ('tasks')) as old(module_id)
    where wm.module_id = 'crm'
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`delete from workspace_modules where module_id = 'crm'`.execute(db);

  // Expand '/crm' back to the four keys in stored layouts and pins.
  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    if (!row.item_keys.includes('/crm')) continue;
    const next = row.item_keys.flatMap(k =>
      k === '/crm' ? ['/pipeline', '/contacts', '/companies', '/tasks'] : [k],
    );
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
    if (!row.pinned_keys.includes('/crm')) continue;
    const next = row.pinned_keys.flatMap(k =>
      k === '/crm' ? ['/pipeline', '/contacts', '/companies', '/tasks'] : [k],
    );
    await sql`
      update user_sidebar_prefs
      set pinned_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
      where user_id = ${row.user_id} and workspace_id = ${row.workspace_id}
    `.execute(db);
  }
}
```

Note: `on conflict (workspace_id, module_id)` relies on the existing unique constraint used by `seed-modules.ts` (`onConflict(oc => oc.columns(['workspace_id', 'module_id']))`). If the migration fails with "no unique constraint matching", check the constraint name with `\d workspace_modules` and adjust to `on conflict on constraint <name>`.

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `rtk vitest run packages/db/migrations/20260712_001_crm_module_merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the migration against the dev database**

Run: `pnpm --filter @vencore/db db:migrate`
Expected: migration `20260712_001_crm_module_merge` listed as executed, no errors.
Verify: `workspace_modules` has a `crm` row per workspace and no `contacts`/`companies`/`pipelines`/`tasks` rows.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/db/migrations
rtk git commit -m "feat(db): consolidate crm workspace modules and sidebar keys"
```

---

### Task 5: Web — nav items, fallback groups, settings toggle, module guards

**Files:**
- Modify: `apps/web/modules/shared/components/Sidebar.tsx:41-55`
- Modify: `apps/web/modules/shared/hooks/useSidebarLayout.ts:20-26`
- Modify: `apps/web/app/(dashboard)/settings/modules/page.tsx` (MODULE_META)
- Modify: every `<ModuleGuard moduleId="contacts|companies|pipelines|tasks">` and `isEnabled('contacts'|'companies'|'pipelines'|'tasks')` call site

**Interfaces:**
- Consumes: module id `'crm'` (Task 1), item key `/crm` (Task 3).
- Produces: sidebar renders one CRM item; settings shows one CRM toggle. Route `/crm` used here is created in Task 6 — the sidebar link 404s until Task 6 lands; that is fine mid-branch, both tasks ship in the same PR.

- [ ] **Step 1: Update `NAV_ITEMS` in `Sidebar.tsx`**

Replace the four CRM entries (`'/pipeline'`, `'/contacts'`, `'/companies'`, `'/tasks'`) with one:

```ts
const NAV_ITEMS: Record<string, NavItemDef> = {
  '/crm':       { label: 'CRM',       icon: 'pipeline',  moduleId: 'crm',       feature: 'crm' },
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

- [ ] **Step 2: Update `FALLBACK_GROUPS` in `useSidebarLayout.ts`**

```ts
export const FALLBACK_GROUPS: SidebarGroup[] = [
  { id: null, label: 'Sales',    is_default: false, item_keys: ['/crm', '/activity'] },
  { id: null, label: 'Infra',    is_default: false, item_keys: ['/servers', '/databases', '/websites'] },
  { id: null, label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
  { id: null, label: 'Insights', is_default: false, item_keys: ['/analytics', '/alerts'] },
  { id: null, label: 'General',  is_default: true,  item_keys: ['/dashboard'] },
];
```

- [ ] **Step 3: Update `MODULE_META` in `settings/modules/page.tsx`**

Replace the four entries (`contacts`, `companies`, `pipelines`, `tasks`) with one, keeping list order (after `dashboard`):

```ts
  { id: 'crm', name: 'CRM', description: 'Contacts, companies, deals pipeline, and tasks.', settingsHref: '/settings/pipelines' },
```

- [ ] **Step 4: Update module guards and enablement checks**

Find all call sites:

Run: `rtk grep -rn "moduleId=\"contacts\"\|moduleId=\"companies\"\|moduleId=\"pipelines\"\|moduleId=\"tasks\"\|isEnabled('contacts')\|isEnabled('companies')\|isEnabled('pipelines')\|isEnabled('tasks')" apps/web --include="*.tsx" --include="*.ts"`

Known sites (there may be more — fix every match):
- `apps/web/modules/contacts/pages/page.tsx:13` → `moduleId="crm"`
- `apps/web/modules/companies/pages/page.tsx:38` → `moduleId="crm"`
- `apps/web/app/(dashboard)/tasks/page.tsx:96` → `moduleId="crm"`
- `apps/web/modules/contacts/components/ContactsWidget.tsx` (`isEnabled('contacts')`) → `isEnabled('crm')`
- `apps/web/modules/pipeline/components/PipelineWidget.tsx` (if it checks `isEnabled('pipelines')`) → `isEnabled('crm')`
- `apps/web/modules/tasks/components/TasksWidget.tsx` (if it checks `isEnabled('tasks')`) → `isEnabled('crm')`

Do NOT change `moduleId="activity"` or `isEnabled('activity')`.

- [ ] **Step 5: Typecheck the web app**

Run: `rtk npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no new errors (pre-existing errors, if any, unchanged).

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web
rtk git commit -m "feat(web): single crm nav item, toggle, and module guards"
```

---

### Task 6: Web — `/crm` routes, tab layout, redirects

**Files:**
- Create: `apps/web/app/(dashboard)/crm/layout.tsx`
- Create: `apps/web/app/(dashboard)/crm/page.tsx`
- Move: `apps/web/app/(dashboard)/pipeline/` → `apps/web/app/(dashboard)/crm/pipeline/`
- Move: `apps/web/app/(dashboard)/contacts/` → `apps/web/app/(dashboard)/crm/contacts/`
- Move: `apps/web/app/(dashboard)/companies/` → `apps/web/app/(dashboard)/crm/companies/`
- Move: `apps/web/app/(dashboard)/tasks/` → `apps/web/app/(dashboard)/crm/tasks/`
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: module id `'crm'` (Task 1), `useAuth().hasPermission(key)` from `apps/web/modules/shared/lib/AuthContext.tsx`.
- Produces: routes `/crm`, `/crm/pipeline`, `/crm/pipeline/[pipelineId]`, `/crm/contacts`, `/crm/companies`, `/crm/tasks`; permanent redirects from the old paths. Task 7's import rewrite runs after these moves.

- [ ] **Step 1: Move the route directories**

```bash
mkdir "apps/web/app/(dashboard)/crm"
rtk git mv "apps/web/app/(dashboard)/pipeline" "apps/web/app/(dashboard)/crm/pipeline"
rtk git mv "apps/web/app/(dashboard)/contacts" "apps/web/app/(dashboard)/crm/contacts"
rtk git mv "apps/web/app/(dashboard)/companies" "apps/web/app/(dashboard)/crm/companies"
rtk git mv "apps/web/app/(dashboard)/tasks" "apps/web/app/(dashboard)/crm/tasks"
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/crm/layout.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';

const TABS = [
  { href: '/crm/pipeline',  label: 'Pipeline',  permission: 'pipelines:view' },
  { href: '/crm/contacts',  label: 'Contacts',  permission: 'contacts:view' },
  { href: '/crm/companies', label: 'Companies', permission: 'companies:view' },
  { href: '/crm/tasks',     label: 'Tasks',     permission: 'tasks:view' },
];

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const tabs = TABS.filter(t => hasPermission(t.permission));

  return (
    <ModuleGuard moduleId="crm">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{
          display: 'flex', gap: 4, padding: '6px 20px 0',
          borderBottom: '1px solid var(--border)', background: 'var(--surface)',
          flexShrink: 0,
        }}>
          {tabs.map(t => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  padding: '8px 14px', fontSize: 13.5, textDecoration: 'none',
                  color: active ? 'var(--text)' : 'var(--text2)',
                  fontWeight: active ? 500 : 400,
                  borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
      </div>
    </ModuleGuard>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/crm/page.tsx`**

```tsx
import { redirect } from 'next/navigation';

export default function CrmIndexPage() {
  redirect('/crm/pipeline');
}
```

- [ ] **Step 4: Add redirects to `apps/web/next.config.ts`**

Add a `redirects()` entry to the existing `nextConfig` object (alongside `rewrites()`):

```ts
  async redirects() {
    return [
      { source: '/pipeline', destination: '/crm/pipeline', permanent: true },
      { source: '/pipeline/:path*', destination: '/crm/pipeline/:path*', permanent: true },
      { source: '/contacts', destination: '/crm/contacts', permanent: true },
      { source: '/contacts/:path*', destination: '/crm/contacts/:path*', permanent: true },
      { source: '/companies', destination: '/crm/companies', permanent: true },
      { source: '/companies/:path*', destination: '/crm/companies/:path*', permanent: true },
      { source: '/tasks', destination: '/crm/tasks', permanent: true },
      { source: '/tasks/:path*', destination: '/crm/tasks/:path*', permanent: true },
    ];
  },
```

(Next.js preserves query strings on redirects, so existing deep links like `/contacts?contact=<id>` keep working.)

- [ ] **Step 5: Update internal navigation links**

Find hard-coded old paths:

Run: `rtk grep -rn "router.push('/contacts\|router.push('/pipeline\|router.push('/companies\|router.push('/tasks\|href=\"/contacts\|href=\"/pipeline\|href=\"/companies\|href=\"/tasks\|push(\`/contacts\|push(\`/pipeline\|push(\`/companies\|push(\`/tasks" apps/web --include="*.tsx" --include="*.ts"`

For every match that navigates to a CRM page, prefix the path with `/crm` (e.g. `router.push(\`/contacts?contact=${id}\`)` → `router.push(\`/crm/contacts?contact=${id}\`)`). Rules:
- Skip `/settings/...` hrefs (e.g. `/settings/pipelines`, `/settings/tasks`).
- Skip API paths (`/api/...`).
- Skip `/projects/...` task links (project tasks are a different module).
- The redirects added in Step 4 are the safety net for anything missed — but update all matches anyway.

- [ ] **Step 6: Typecheck and commit**

Run: `rtk npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no new errors.

```bash
rtk git add -A apps/web
rtk git commit -m "feat(web): crm tab layout, nested routes, and redirects from old paths"
```

---

### Task 7: Web — merge feature code under `modules/crm/`

**Files:**
- Move: `apps/web/modules/pipeline/` → `apps/web/modules/crm/pipeline/`
- Move: `apps/web/modules/contacts/` → `apps/web/modules/crm/contacts/`
- Move: `apps/web/modules/companies/` → `apps/web/modules/crm/companies/`
- Move: `apps/web/modules/tasks/` → `apps/web/modules/crm/tasks/`
- Modify: every file importing `@/modules/pipeline/`, `@/modules/contacts/`, `@/modules/companies/`, `@/modules/tasks/` (~37 files, mechanical)

**Interfaces:**
- Consumes: route moves from Task 6 (the moved `app/(dashboard)/crm/*/page.tsx` re-export files also get their imports rewritten here).
- Produces: all CRM feature code under `@/modules/crm/*`. Task 8 imports `@/modules/crm/contacts/components/ContactsWidget` etc.

- [ ] **Step 1: Move the directories**

```bash
mkdir apps/web/modules/crm
rtk git mv apps/web/modules/pipeline apps/web/modules/crm/pipeline
rtk git mv apps/web/modules/contacts apps/web/modules/crm/contacts
rtk git mv apps/web/modules/companies apps/web/modules/crm/companies
rtk git mv apps/web/modules/tasks apps/web/modules/crm/tasks
```

- [ ] **Step 2: Rewrite import paths**

PowerShell (run from repo root):

```powershell
Get-ChildItem apps/web -Recurse -Include *.ts,*.tsx | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  $n = $c -replace '@/modules/pipeline/', '@/modules/crm/pipeline/' `
         -replace '@/modules/contacts/', '@/modules/crm/contacts/' `
         -replace '@/modules/companies/', '@/modules/crm/companies/' `
         -replace '@/modules/tasks/', '@/modules/crm/tasks/'
  if ($n -ne $c) { Set-Content $_.FullName $n -NoNewline -Encoding utf8 }
}
```

- [ ] **Step 3: Verify no stale imports remain**

Run: `rtk grep -rn "@/modules/pipeline/\|@/modules/contacts/\|@/modules/companies/\|@/modules/tasks/" apps/web --include="*.tsx" --include="*.ts"`
Expected: no matches.

- [ ] **Step 4: Typecheck**

Run: `rtk npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no new errors. If the rewrite corrupted a file encoding (PowerShell UTF-8 BOM), fix with `git diff` inspection — only import lines should have changed:

Run: `rtk git diff --stat`
Expected: only moved files plus import-line changes in ~37 files.

- [ ] **Step 5: Commit**

```bash
rtk git add -A apps/web
rtk git commit -m "refactor(web): move crm feature code under modules/crm"
```

---

### Task 8: Dashboard widgets — Alerts and Activity

**Files:**
- Create: `apps/web/modules/alerts/components/AlertsWidget.tsx`
- Create: `apps/web/modules/activity/components/ActivityWidget.tsx`
- Modify: `apps/web/modules/shared/lib/register-module-widgets.ts`

**Interfaces:**
- Consumes: `registerDashboardWidget` from `@/modules/shared/lib/dashboard-registry`; `apiFetch` from `@/modules/shared/lib/api`; `listActivity` from `@vencore/api-client`; `Alert`, `Activity` types from `@vencore/types`; `WidgetSkeleton`, `WidgetError`, `EmptyState` from `@/modules/shared/components/ui/WidgetHelpers`.
- Produces: widget ids `core:alerts` and `core:activity` available in the dashboard Add Widget panel.

- [ ] **Step 1: Create `apps/web/modules/alerts/components/AlertsWidget.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { Alert } from '@vencore/types';

const SEVERITY_STYLE: Record<string, { fg: string; bg: string }> = {
  critical: { fg: 'var(--red)', bg: 'var(--red-bg)' },
  warning: { fg: 'var(--amber)', bg: 'var(--amber-bg)' },
};

function relativeTime(value: Date | string): string {
  const diff = Date.now() - new Date(value).getTime();
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AlertsWidget() {
  const { isEnabled } = useModules();
  const enabled = isEnabled('alerts');
  const getToken = useApiToken();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['widget', 'alerts'],
    queryFn: async () =>
      apiFetch<{ data: Alert[]; total: number; error: null }>(
        '/api/alerts?resolved=false&severity=critical,warning&limit=6',
        { token: await getToken() },
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
  });

  const ackMut = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/alerts/${id}/acknowledge`, { method: 'PATCH', token: await getToken() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['widget', 'alerts'] }),
  });

  if (!enabled) return <EmptyState href="/settings/modules" label="Enable the Alerts module" />;
  if (query.isLoading) return <WidgetSkeleton />;
  if (query.isError) return <WidgetError onRetry={() => void query.refetch()} />;

  const alerts = query.data?.data ?? [];
  if (alerts.length === 0) return <EmptyState href="/alerts" label="No unresolved alerts" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      {alerts.map(alert => {
        const style = SEVERITY_STYLE[alert.severity] ?? { fg: 'var(--text2)', bg: 'var(--surface2)' };
        return (
          <div
            key={alert.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--surface)' }}
          >
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
              color: style.fg, background: style.bg, borderRadius: 6, padding: '2px 7px', flexShrink: 0,
            }}>
              {alert.severity}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alert.message}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
              {relativeTime(alert.created_at)}
            </span>
            {!alert.acknowledged && (
              <button
                title="Acknowledge"
                onClick={() => ackMut.mutate(alert.id)}
                disabled={ackMut.isPending}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', color: 'var(--text2)', padding: '2px 6px',
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                }}
              >
                <Icon name="check" size={12} />
              </button>
            )}
          </div>
        );
      })}
      <Link
        href="/alerts"
        style={{
          marginTop: 'auto', fontSize: 12, color: 'var(--text3)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border)',
        }}
      >
        <Icon name="open" size={11} />
        View all alerts
      </Link>
    </div>
  );
}
```

Note: check `Icon` supports the name `'check'` (`rtk grep -n "check" apps/web/modules/shared/components/ui/Icon.tsx`). If not, use an existing affirmative icon name from that file (fall back to `'tasks'`).

- [ ] **Step 2: Create `apps/web/modules/activity/components/ActivityWidget.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listActivity } from '@vencore/api-client';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';

const TYPE_ICON: Record<string, string> = {
  email: 'message-square',
  call: 'contacts',
  note: 'edit',
  meeting: 'tasks',
  deal_change: 'pipeline',
  infra_alert: 'alerts',
};

function relativeTime(value: Date | string): string {
  const diff = Date.now() - new Date(value).getTime();
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ActivityWidget() {
  const { isEnabled } = useModules();
  const enabled = isEnabled('activity');
  const getToken = useApiToken();

  const query = useQuery({
    queryKey: ['widget', 'activity'],
    queryFn: async () => listActivity(await getToken(), { limit: 8 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
  });

  if (!enabled) return <EmptyState href="/settings/modules" label="Enable the Activity module" />;
  if (query.isLoading) return <WidgetSkeleton />;
  if (query.isError) return <WidgetError onRetry={() => void query.refetch()} />;

  const items = query.data?.data ?? [];
  if (items.length === 0) return <EmptyState href="/activity" label="No activity yet" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 6, background: 'var(--surface2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text2)', flexShrink: 0,
          }}>
            <Icon name={TYPE_ICON[item.type] ?? 'activity'} size={12} />
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.body ?? item.type.replace('_', ' ')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
            {relativeTime(item.created_at)}
          </span>
        </div>
      ))}
      <Link
        href="/activity"
        style={{
          marginTop: 'auto', fontSize: 12, color: 'var(--text3)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border)',
        }}
      >
        <Icon name="open" size={11} />
        View all activity
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Register both widgets in `register-module-widgets.ts`**

The file's existing imports were already rewritten to `@/modules/crm/...` by Task 7. Append imports and registrations:

```ts
import { AlertsWidget } from '@/modules/alerts/components/AlertsWidget';
import { ActivityWidget } from '@/modules/activity/components/ActivityWidget';
```

```ts
registerDashboardWidget({
  id: 'core:alerts',
  label: 'Alerts',
  description: 'Unresolved critical and warning alerts with quick acknowledge',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  component: AlertsWidget,
});

registerDashboardWidget({
  id: 'core:activity',
  label: 'Activity',
  description: 'Latest workspace activity across all records',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  component: ActivityWidget,
});
```

- [ ] **Step 4: Typecheck**

Run: `rtk npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web
rtk git commit -m "feat(web): alerts and activity dashboard widgets"
```

---

### Task 9: Full verification

**Files:** none (verification only, plus any fixes it surfaces).

**Interfaces:**
- Consumes: everything above.
- Produces: verified branch ready for user testing and PR.

- [ ] **Step 1: Full test suite**

Run: `rtk vitest run`
Expected: PASS. Fix any straggler test that still references the old module ids (never rename permission keys).

- [ ] **Step 2: Typecheck both apps**

Run: `rtk npx tsc --noEmit -p apps/api/tsconfig.json` then `rtk npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Preview verification (dev servers via preview tools)**

Start the web + api dev servers with the preview tools, then verify:

1. Sidebar shows a single **CRM** item in the Sales group (plus Activity), no Pipeline/Contacts/Companies/Tasks items.
2. `/crm` redirects to `/crm/pipeline`; tab bar shows Pipeline | Contacts | Companies | Tasks; each tab renders its page.
3. Old URLs `/pipeline`, `/contacts`, `/companies`, `/tasks` redirect permanently to the `/crm/*` equivalents (check `/contacts?contact=<id>` keeps its query).
4. Settings → Modules shows one CRM toggle. Toggling it off hides the CRM nav item and makes `/api/contacts` return `403 MODULE_DISABLED`; toggling back on restores access.
5. Dashboard → Add Widget lists **Alerts** and **Activity**; both render data (or their empty states) and the alert acknowledge button works.
6. Sidebar pins: pinning CRM works; no ghost pins from old keys.

- [ ] **Step 4: Update the knowledge graph**

Run: `graphify update .`

- [ ] **Step 5: Commit any verification fixes**

```bash
rtk git add -A
rtk git commit -m "fix: crm merge verification fixes"
```

(Skip if nothing changed.)

- [ ] **Step 6: Hand off**

Stop here. The user tests manually; PR creation goes through the finish-vencore-branch flow when they ask.
