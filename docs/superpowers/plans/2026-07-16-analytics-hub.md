# Analytics Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Analytics module into a dynamic hub where CRM, Infrastructure, and Project Management each contribute sections that render only when their source is active.

**Architecture:** Reuse the existing hub-sections resolver (`GET /api/hub/sections/:page`) and extend it with a builtin section registry so core modules — not just plugins — contribute sections. Sections gate on `requires_contract` (CRM, true provider discovery) or `requires_module` (Infra/PM, module-enabled check). The Analytics page becomes a slot outlet with an `overview` grid slot (one headline tile per source) and a `panels` stack slot (full sections). Two new rollup endpoints: `/api/analytics/infra` and `/api/analytics/pm`.

**Tech Stack:** Express + Kysely (api), Next.js App Router + TanStack Query (web), Vitest (tests), Zod (validation).

**Spec:** `docs/superpowers/specs/2026-07-16-analytics-hub-design.md`

## Global Constraints

- Every DB query filters by `workspace_id` (multi-tenant rule).
- All API responses: `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`.
- All analytics endpoints require the `analytics:view` permission.
- TypeScript strict, no `any` (existing `db as Kysely<any>` casts for plugin-runtime calls are the established exception — match them).
- No new DB migrations. No changes to `PluginSectionDef` (plugin manifest shape unchanged); `requires_module` is host-only.
- PM rollups exclude `status = 'DELETED'` projects. Project status enum: `'ACTIVE' | 'ARCHIVED' | 'DELETED'`.
- Prefix all shell commands with `rtk` (e.g. `rtk git commit`, `rtk npx vitest run`).
- Commit messages: conventional-commit style, no AI attribution of any kind.
- UI follows design tokens (`var(--surface)`, `var(--border)`, `var(--text)`, `var(--text2)`, `var(--text3)`, `var(--green)`, `var(--amber)`, `var(--red)`, `var(--radius-lg)` etc.). Match the existing analytics page style.
- Web components: frontend has no component-test harness in use — frontend tasks verify via typecheck + browser preview instead of unit tests. Backend pure functions get full TDD.

---

### Task 1: Analytics page in the slot catalog + builtin section registry

**Files:**
- Modify: `packages/plugin-types/src/index.ts` (SLOT_CATALOG, ~line 407)
- Create: `apps/api/src/lib/builtin-sections.ts`
- Test: `apps/api/src/lib/builtin-sections.test.ts`

**Interfaces:**
- Consumes: `SLOT_CATALOG`, `isKnownSlot` from `@vencore/plugin-types`.
- Produces:
  - `BUILTIN_ANALYTICS_SECTIONS: BuiltinSectionDef[]`
  - `resolveBuiltinSections(page: string, ctx: BuiltinGateContext, defs?: readonly BuiltinSectionDef[]): ResolvedBuiltinSection[]`
  - `requiredContracts(defs?: readonly BuiltinSectionDef[]): string[]`
  - `ResolvedBuiltinSection = { kind: 'builtin'; plugin_id: string; id: string; slot_id: string; label: string; priority: number }` (`plugin_id` carries the module id so the resolved shape matches the existing `ResolvedSection` consumed by `SlotOutlet`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/builtin-sections.test.ts
import { describe, it, expect } from 'vitest'
import { SLOT_CATALOG, isKnownSlot } from '@vencore/plugin-types'
import {
  BUILTIN_ANALYTICS_SECTIONS,
  resolveBuiltinSections,
  requiredContracts,
} from './builtin-sections'

describe('SLOT_CATALOG analytics page', () => {
  it('exposes overview (grid) and panels (stack) slots', () => {
    expect(SLOT_CATALOG['analytics']).toEqual([
      { id: 'overview', layout: 'grid' },
      { id: 'panels', layout: 'stack' },
    ])
    expect(isKnownSlot('analytics:overview')).toBe(true)
    expect(isKnownSlot('analytics:panels')).toBe(true)
    expect(isKnownSlot('analytics:bogus')).toBe(false)
  })
})

describe('BUILTIN_ANALYTICS_SECTIONS', () => {
  it('declares exactly one gate per section and only known slots', () => {
    for (const d of BUILTIN_ANALYTICS_SECTIONS) {
      const gates = [d.requires_contract, d.requires_module].filter(Boolean)
      expect(gates).toHaveLength(1)
      expect(isKnownSlot(d.slot)).toBe(true)
    }
  })

  it('covers crm, infra, projects in both slots', () => {
    const ids = BUILTIN_ANALYTICS_SECTIONS.map(d => d.id).sort()
    expect(ids).toEqual([
      'crm-overview', 'crm-panel',
      'infra-overview', 'infra-panel',
      'pm-overview', 'pm-panel',
    ])
  })
})

describe('resolveBuiltinSections', () => {
  const allOn = {
    enabledModules: new Set(['infra', 'projects']),
    activeContracts: new Set(['crm.deal@v1']),
  }

  it('returns all six sections when every gate passes', () => {
    const out = resolveBuiltinSections('analytics', allOn)
    expect(out).toHaveLength(6)
    expect(out.every(s => s.kind === 'builtin')).toBe(true)
  })

  it('drops contract-gated sections when no provider is active', () => {
    const out = resolveBuiltinSections('analytics', {
      enabledModules: new Set(['infra', 'projects']),
      activeContracts: new Set(),
    })
    expect(out.map(s => s.id).sort()).toEqual(
      ['infra-overview', 'infra-panel', 'pm-overview', 'pm-panel'])
  })

  it('drops module-gated sections when the module is disabled', () => {
    const out = resolveBuiltinSections('analytics', {
      enabledModules: new Set(['projects']),
      activeContracts: new Set(['crm.deal@v1']),
    })
    expect(out.map(s => s.id).sort()).toEqual(
      ['crm-overview', 'crm-panel', 'pm-overview', 'pm-panel'])
  })

  it('returns empty when nothing is active', () => {
    expect(resolveBuiltinSections('analytics', {
      enabledModules: new Set(), activeContracts: new Set(),
    })).toEqual([])
  })

  it('ignores sections targeting other pages', () => {
    expect(resolveBuiltinSections('dashboard', allOn)).toEqual([])
  })

  it('maps slot to slot_id and module_id to plugin_id', () => {
    const out = resolveBuiltinSections('analytics', allOn)
    const crm = out.find(s => s.id === 'crm-panel')!
    expect(crm.slot_id).toBe('panels')
    expect(crm.plugin_id).toBe('crm')
  })
})

describe('requiredContracts', () => {
  it('returns the distinct contracts referenced by the registry', () => {
    expect(requiredContracts()).toEqual(['crm.deal@v1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && rtk npx vitest run src/lib/builtin-sections.test.ts`
Expected: FAIL — `Cannot find module './builtin-sections'` (and the SLOT_CATALOG assertion fails until step 3).

- [ ] **Step 3: Add analytics page to SLOT_CATALOG**

In `packages/plugin-types/src/index.ts`, inside `SLOT_CATALOG` (after the `'deal-list'` entry, ~line 428):

```ts
  'contact-list': [{ id: 'toolbar', layout: 'inline' }, { id: 'extras', layout: 'stack' }],
  'deal-list': [{ id: 'toolbar', layout: 'inline' }, { id: 'extras', layout: 'stack' }],
  'analytics': [
    { id: 'overview', layout: 'grid' },
    { id: 'panels', layout: 'stack' },
  ],
};
```

- [ ] **Step 4: Create the builtin section registry**

```ts
// apps/api/src/lib/builtin-sections.ts
/**
 * Builtin module sections — core modules contributing UI sections to page
 * slots alongside plugins. A section declares exactly one gate:
 *   requires_contract — renders when the contract has an active provider
 *                       (true discovery: builtin or plugin provider both count)
 *   requires_module   — renders when the builtin module is enabled for the
 *                       workspace (for modules without hub contracts)
 * Host-only: this never touches the plugin manifest shape.
 */

export interface BuiltinSectionDef {
  module_id: string;
  /** Stable section id — also the client-side render key. */
  id: string;
  /** Target slot as `page:slotId`, e.g. "analytics:panels". */
  slot: string;
  label: string;
  /** Lower renders first. */
  priority: number;
  requires_contract?: string;
  requires_module?: string;
}

export const BUILTIN_ANALYTICS_SECTIONS: BuiltinSectionDef[] = [
  { module_id: 'crm', id: 'crm-overview', slot: 'analytics:overview', label: 'CRM', priority: 10, requires_contract: 'crm.deal@v1' },
  { module_id: 'infra', id: 'infra-overview', slot: 'analytics:overview', label: 'Infrastructure', priority: 20, requires_module: 'infra' },
  { module_id: 'projects', id: 'pm-overview', slot: 'analytics:overview', label: 'Projects', priority: 30, requires_module: 'projects' },
  { module_id: 'crm', id: 'crm-panel', slot: 'analytics:panels', label: 'CRM Analytics', priority: 10, requires_contract: 'crm.deal@v1' },
  { module_id: 'infra', id: 'infra-panel', slot: 'analytics:panels', label: 'Infrastructure Analytics', priority: 20, requires_module: 'infra' },
  { module_id: 'projects', id: 'pm-panel', slot: 'analytics:panels', label: 'Project Analytics', priority: 30, requires_module: 'projects' },
];

export interface BuiltinGateContext {
  enabledModules: ReadonlySet<string>;
  /** Contracts that currently have an active provider in the workspace. */
  activeContracts: ReadonlySet<string>;
}

export interface ResolvedBuiltinSection {
  kind: 'builtin';
  /** Module id, in the plugin_id seat so the shape matches plugin sections. */
  plugin_id: string;
  id: string;
  slot_id: string;
  label: string;
  priority: number;
}

export function resolveBuiltinSections(
  page: string,
  ctx: BuiltinGateContext,
  defs: readonly BuiltinSectionDef[] = BUILTIN_ANALYTICS_SECTIONS,
): ResolvedBuiltinSection[] {
  const out: ResolvedBuiltinSection[] = [];
  for (const d of defs) {
    const [slotPage, slotId] = d.slot.split(':');
    if (slotPage !== page || !slotId) continue;
    if (d.requires_contract && !ctx.activeContracts.has(d.requires_contract)) continue;
    if (d.requires_module && !ctx.enabledModules.has(d.requires_module)) continue;
    out.push({
      kind: 'builtin',
      plugin_id: d.module_id,
      id: d.id,
      slot_id: slotId,
      label: d.label,
      priority: d.priority,
    });
  }
  return out;
}

/** Distinct contracts the registry gates on — the route resolves these once. */
export function requiredContracts(
  defs: readonly BuiltinSectionDef[] = BUILTIN_ANALYTICS_SECTIONS,
): string[] {
  return [...new Set(defs.map(d => d.requires_contract).filter((c): c is string => !!c))];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && rtk npx vitest run src/lib/builtin-sections.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
rtk git add packages/plugin-types/src/index.ts apps/api/src/lib/builtin-sections.ts apps/api/src/lib/builtin-sections.test.ts
rtk git commit -m "feat(api): builtin section registry + analytics slot catalog page"
```

---

### Task 2: Merge builtin sections into the hub-sections resolver

**Files:**
- Modify: `apps/api/src/routes/hub-sections.ts`

**Interfaces:**
- Consumes: `resolveBuiltinSections`, `requiredContracts`, `BuiltinGateContext` from Task 1; `getActiveProviderForContract` from `@vencore/plugin-runtime`; `workspace_modules` table (`module_id`, `enabled`, `workspace_id`).
- Produces: `GET /api/hub/sections/:page` now returns `ResolvedSection[]` where each entry has `kind: 'builtin' | 'plugin'`. Builtin entries carry the module id in `plugin_id`. Existing consumers (`SlotOutlet`) are unaffected — extra field, and builtin sections only target the new `analytics` page.

No route-level unit test: gate logic is fully covered by the Task 1 pure-function tests; the route change is DB glue verified in Task 7's browser check.

- [ ] **Step 1: Extend the resolver**

Replace the body of `apps/api/src/routes/hub-sections.ts` with:

```ts
/**
 * Section resolver — returns the UI sections that should render on a page,
 * ordered and filtered. The frontend uses this to decide which registered
 * section components to mount and in what order.
 *
 * Two sources merge here:
 *  - plugin sections (manifest `sections`, gated by requires_contract)
 *  - builtin module sections (BUILTIN_ANALYTICS_SECTIONS, gated by
 *    requires_contract or requires_module)
 *
 * Additive by design: core page content is untouched; sections fill declared
 * slots around it. A plugin section targeting an unknown slot is redirected to
 * the page's `extras` slot rather than dropped.
 */
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest } from '@vencore/plugin-types';
import { SLOT_CATALOG, isKnownSlot } from '@vencore/plugin-types';
import { getActiveProviderForContract } from '@vencore/plugin-runtime';
import type { AuthenticatedRequest } from '../middleware/auth';
import { resolveBuiltinSections, requiredContracts } from '../lib/builtin-sections';

interface ResolvedSection {
  kind: 'builtin' | 'plugin';
  plugin_id: string;
  id: string;
  slot_id: string;
  label: string | null;
  priority: number;
}

export function createHubSectionsRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/hub/sections/:page
  router.get('/:page', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const page = req.params['page']!;
      if (!SLOT_CATALOG[page]) {
        res.json({ data: [], error: null });
        return;
      }

      const resolved: ResolvedSection[] = [];

      // ── Builtin module sections ─────────────────────────────────────────
      const moduleRows = await db.selectFrom('workspace_modules')
        .select('module_id')
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();
      const enabledModules = new Set(moduleRows.map(r => r.module_id));

      const activeContracts = new Set<string>();
      for (const contract of requiredContracts()) {
        const active = await getActiveProviderForContract(db as Kysely<any>, workspace.id, contract);
        if (active) activeContracts.add(contract);
      }

      resolved.push(...resolveBuiltinSections(page, { enabledModules, activeContracts }));

      // ── Plugin sections ─────────────────────────────────────────────────
      const plugins = await db.selectFrom('workspace_plugins')
        .select(['plugin_id', 'manifest'])
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();

      for (const p of plugins) {
        const mf = p.manifest as unknown as PluginManifest;
        for (const section of mf.sections ?? []) {
          const [slotPage, slotId] = section.slot.split(':');
          if (slotPage !== page) continue;

          // Contract-dependent sections only render when a provider is active
          if (section.requires_contract) {
            const active = await getActiveProviderForContract(db as Kysely<any>, workspace.id, section.requires_contract);
            if (!active) continue;
          }

          // Unknown slot → route to the page's extras slot
          const targetSlot = isKnownSlot(section.slot) ? slotId! : 'extras';
          resolved.push({
            kind: 'plugin',
            plugin_id: p.plugin_id,
            id: section.id,
            slot_id: targetSlot,
            label: section.label ?? null,
            priority: section.priority ?? 100,
          });
        }
      }

      resolved.sort((a, b) => a.priority - b.priority || a.plugin_id.localeCompare(b.plugin_id));
      res.json({ data: resolved, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && rtk npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full api test suite (regression)**

Run: `cd apps/api && rtk npx vitest run`
Expected: PASS — no existing test regressions.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/routes/hub-sections.ts
rtk git commit -m "feat(api): hub-sections resolver merges builtin module sections"
```

---

### Task 3: Infra + PM rollup summarizers (pure functions)

**Files:**
- Create: `apps/api/src/lib/analytics-summaries.ts`
- Test: `apps/api/src/lib/analytics-summaries.test.ts`

**Interfaces:**
- Produces:
  - `summarizeInfra(servers, websites, alerts, now?): InfraSummary`
  - `summarizePm(activeProjectCount, taskStats, velocityRows, workloadRows): PmSummary`
  - `InfraSummary = { servers: { online, degraded, offline, stopped, avg_cpu, avg_mem, avg_disk }, websites: { total, avg_uptime, ssl_expiring_soon }, alerts: { critical, warning, info } }` (all numbers)
  - `PmSummary = { projects: { active }, tasks: { total, done, overdue, open, completion_rate }, velocity: Array<{ sprint_name, velocity, end_date }>, workload: Array<{ user_id, name, total, done, overdue }> }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/analytics-summaries.test.ts
import { describe, it, expect } from 'vitest'
import { summarizeInfra, summarizePm } from './analytics-summaries'

describe('summarizeInfra', () => {
  const now = new Date('2026-07-16T00:00:00Z')

  it('counts servers by status and averages metrics over online servers', () => {
    const out = summarizeInfra(
      [
        { status: 'online', cpu_pct: 40, mem_pct: 60, disk_pct: 20 },
        { status: 'online', cpu_pct: 60, mem_pct: null, disk_pct: 40 },
        { status: 'degraded', cpu_pct: 90, mem_pct: 90, disk_pct: 90 },
        { status: 'offline', cpu_pct: null, mem_pct: null, disk_pct: null },
        { status: 'stopped', cpu_pct: null, mem_pct: null, disk_pct: null },
      ],
      [], [], now,
    )
    expect(out.servers).toEqual({
      online: 2, degraded: 1, offline: 1, stopped: 1,
      avg_cpu: 50, avg_mem: 60, avg_disk: 30,
    })
  })

  it('averages website uptime and counts ssl expiring within 30 days', () => {
    const out = summarizeInfra([], [
      { uptime_pct_30d: 99.8, ssl_expiry_date: new Date('2026-07-20') },  // expiring soon
      { uptime_pct_30d: 98.2, ssl_expiry_date: new Date('2027-01-01') },  // fine
      { uptime_pct_30d: null, ssl_expiry_date: new Date('2026-07-01') },  // already expired → counts
      { uptime_pct_30d: 100, ssl_expiry_date: null },                     // unknown → ignored
    ], [], now)
    expect(out.websites.total).toBe(4)
    expect(out.websites.avg_uptime).toBeCloseTo(99.33, 1)
    expect(out.websites.ssl_expiring_soon).toBe(2)
  })

  it('maps alert severity counts and defaults missing severities to zero', () => {
    const out = summarizeInfra([], [], [
      { severity: 'critical', count: '3' },
      { severity: 'warning', count: 1 },
    ], now)
    expect(out.alerts).toEqual({ critical: 3, warning: 1, info: 0 })
  })

  it('returns zeros on an empty workspace', () => {
    const out = summarizeInfra([], [], [], now)
    expect(out.servers.avg_cpu).toBe(0)
    expect(out.websites.avg_uptime).toBe(0)
    expect(out.alerts).toEqual({ critical: 0, warning: 0, info: 0 })
  })
})

describe('summarizePm', () => {
  it('computes completion rate and coerces DB string counts', () => {
    const out = summarizePm(
      '2',
      { total: '10', done: '4', overdue: '1', open: '6' },
      [{ name: 'Sprint 3', velocity: 21, end_date: new Date('2026-07-10') }],
      [{ user_id: 'u1', name: 'Ada', total: '5', done: '2', overdue: '1' }],
    )
    expect(out.projects.active).toBe(2)
    expect(out.tasks).toEqual({ total: 10, done: 4, overdue: 1, open: 6, completion_rate: 40 })
    expect(out.velocity).toEqual([{ sprint_name: 'Sprint 3', velocity: 21, end_date: '2026-07-10T00:00:00.000Z' }])
    expect(out.workload).toEqual([{ user_id: 'u1', name: 'Ada', total: 5, done: 2, overdue: 1 }])
  })

  it('handles zero tasks without dividing by zero', () => {
    const out = summarizePm(0, { total: 0, done: 0, overdue: 0, open: 0 }, [], [])
    expect(out.tasks.completion_rate).toBe(0)
  })

  it('handles missing task stats row (undefined)', () => {
    const out = summarizePm(0, undefined, [], [])
    expect(out.tasks).toEqual({ total: 0, done: 0, overdue: 0, open: 0, completion_rate: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && rtk npx vitest run src/lib/analytics-summaries.test.ts`
Expected: FAIL — `Cannot find module './analytics-summaries'`.

- [ ] **Step 3: Implement the summarizers**

```ts
// apps/api/src/lib/analytics-summaries.ts
/**
 * Pure rollup mappers for the analytics hub endpoints. DB rows in, response
 * shapes out — keeps the SQL glue in routes/analytics.ts thin and testable.
 */

export interface InfraSummary {
  servers: { online: number; degraded: number; offline: number; stopped: number; avg_cpu: number; avg_mem: number; avg_disk: number };
  websites: { total: number; avg_uptime: number; ssl_expiring_soon: number };
  alerts: { critical: number; warning: number; info: number };
}

interface ServerRow { status: string; cpu_pct: number | null; mem_pct: number | null; disk_pct: number | null }
interface WebsiteRow { uptime_pct_30d: number | null; ssl_expiry_date: Date | string | null }
interface AlertCountRow { severity: string; count: number | string }

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeInfra(
  servers: ServerRow[],
  websites: WebsiteRow[],
  alerts: AlertCountRow[],
  now: Date = new Date(),
): InfraSummary {
  const byStatus = (s: string) => servers.filter(r => r.status === s).length;
  const online = servers.filter(r => r.status === 'online');
  const metric = (key: 'cpu_pct' | 'mem_pct' | 'disk_pct') =>
    avg(online.map(r => r[key]).filter((v): v is number => v !== null));

  const sslCutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sslExpiringSoon = websites.filter(w => {
    if (!w.ssl_expiry_date) return false;
    return new Date(w.ssl_expiry_date) <= sslCutoff;
  }).length;

  const alertCount = (sev: string) =>
    Number(alerts.find(a => a.severity === sev)?.count ?? 0);

  return {
    servers: {
      online: byStatus('online'),
      degraded: byStatus('degraded'),
      offline: byStatus('offline'),
      stopped: byStatus('stopped'),
      avg_cpu: metric('cpu_pct'),
      avg_mem: metric('mem_pct'),
      avg_disk: metric('disk_pct'),
    },
    websites: {
      total: websites.length,
      avg_uptime: avg(websites.map(w => w.uptime_pct_30d).filter((v): v is number => v !== null)),
      ssl_expiring_soon: sslExpiringSoon,
    },
    alerts: {
      critical: alertCount('critical'),
      warning: alertCount('warning'),
      info: alertCount('info'),
    },
  };
}

export interface PmSummary {
  projects: { active: number };
  tasks: { total: number; done: number; overdue: number; open: number; completion_rate: number };
  velocity: Array<{ sprint_name: string; velocity: number | null; end_date: string | null }>;
  workload: Array<{ user_id: string; name: string; total: number; done: number; overdue: number }>;
}

interface TaskStatsRow { total: number | string; done: number | string; overdue: number | string; open: number | string }
interface VelocityRow { name: string; velocity: number | null; end_date: Date | string | null }
interface WorkloadRow { user_id: string; name: string; total: number | string; done: number | string; overdue: number | string }

export function summarizePm(
  activeProjectCount: number | string,
  taskStats: TaskStatsRow | undefined,
  velocityRows: VelocityRow[],
  workloadRows: WorkloadRow[],
): PmSummary {
  const total = Number(taskStats?.total ?? 0);
  const done = Number(taskStats?.done ?? 0);
  return {
    projects: { active: Number(activeProjectCount) },
    tasks: {
      total,
      done,
      overdue: Number(taskStats?.overdue ?? 0),
      open: Number(taskStats?.open ?? 0),
      completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
    },
    velocity: velocityRows.map(r => ({
      sprint_name: r.name,
      velocity: r.velocity === null ? null : Number(r.velocity),
      end_date: r.end_date ? new Date(r.end_date).toISOString() : null,
    })),
    workload: workloadRows.map(r => ({
      user_id: r.user_id,
      name: r.name,
      total: Number(r.total),
      done: Number(r.done),
      overdue: Number(r.overdue),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && rtk npx vitest run src/lib/analytics-summaries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/lib/analytics-summaries.ts apps/api/src/lib/analytics-summaries.test.ts
rtk git commit -m "feat(api): infra and pm analytics rollup summarizers"
```

---

### Task 4: `/api/analytics/infra` and `/api/analytics/pm` endpoints

**Files:**
- Modify: `apps/api/src/routes/analytics.ts` (append two handlers inside `createAnalyticsRouter`, before `return router;` at ~line 193)

**Interfaces:**
- Consumes: `summarizeInfra`, `summarizePm` from Task 3; existing `periodSchema` / `getPeriodStart` in the same file; tables `servers`, `websites`, `alerts`, `projects`, `project_tasks`, `project_task_statuses`, `project_task_assignees`, `sprints`, `users`.
- Produces:
  - `GET /api/analytics/infra?period=30d|90d|12m` → `{ data: InfraSummary, error: null }`. Period applies to the alert counts only (`created_at >= periodStart`); servers/websites are current-state snapshots.
  - `GET /api/analytics/pm?period=` → `{ data: PmSummary, error: null }`. Period accepted for interface consistency; rollup is current-state.
  - Both behind `requirePermission('analytics:view')`. The router is already mounted at `/api/analytics` with `requireAuth` + `requireModule('analytics')` (`apps/api/src/index.ts:437`) — no mounting change needed.

- [ ] **Step 1: Add the import**

At the top of `apps/api/src/routes/analytics.ts`:

```ts
import { summarizeInfra, summarizePm } from '../lib/analytics-summaries';
```

- [ ] **Step 2: Add the infra handler**

Insert before `return router;`:

```ts
  // GET /api/analytics/infra?period= — infra rollup (servers/websites snapshot;
  // period filters the open-alert counts)
  router.get('/infra', requirePermission('analytics:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { period } = periodSchema.parse(req.query);
      const periodStart = getPeriodStart(period);

      const servers = await db.selectFrom('servers')
        .select(['status', 'cpu_pct', 'mem_pct', 'disk_pct'])
        .where('workspace_id', '=', workspace.id)
        .execute();

      const websites = await db.selectFrom('websites')
        .select(['uptime_pct_30d', 'ssl_expiry_date'])
        .where('workspace_id', '=', workspace.id)
        .execute();

      const alerts = await db.selectFrom('alerts')
        .select(['severity', sql<string>`COUNT(*)`.as('count')])
        .where('workspace_id', '=', workspace.id)
        .where('resolved', '=', false)
        .where('created_at', '>=', periodStart as never)
        .groupBy('severity')
        .execute();

      res.json({ data: summarizeInfra(servers, websites, alerts), error: null });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 3: Add the pm handler**

Insert after the infra handler:

```ts
  // GET /api/analytics/pm?period= — workspace-wide project management rollup
  router.get('/pm', requirePermission('analytics:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      periodSchema.parse(req.query); // accepted for interface consistency

      const activeProjects = await db.selectFrom('projects')
        .select(sql<string>`COUNT(*)`.as('count'))
        .where('workspace_id', '=', workspace.id)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirstOrThrow();

      const taskStats = await db.selectFrom('project_tasks as t')
        .innerJoin('projects as p', 'p.id', 't.project_id')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED')
        .select([
          sql<string>`COUNT(t.id)`.as('total'),
          sql<string>`COUNT(CASE WHEN s.is_done THEN t.id END)`.as('done'),
          sql<string>`COUNT(CASE WHEN t.due_date < NOW() AND NOT s.is_done THEN t.id END)`.as('overdue'),
          sql<string>`COUNT(CASE WHEN NOT s.is_done THEN t.id END)`.as('open'),
        ])
        .executeTakeFirst();

      const velocityRows = await db.selectFrom('sprints as sp')
        .innerJoin('projects as p', 'p.id', 'sp.project_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED')
        .where('sp.status', 'in', ['COMPLETED', 'ACTIVE'])
        .select(['sp.name', 'sp.velocity', 'sp.end_date'])
        .orderBy('sp.end_date', 'desc')
        .limit(8)
        .execute();

      const workloadRows = await db.selectFrom('project_task_assignees as a')
        .innerJoin('project_tasks as t', 't.id', 'a.task_id')
        .innerJoin('projects as p', 'p.id', 't.project_id')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .innerJoin('users as u', 'u.id', 'a.user_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED')
        .groupBy(['a.user_id', 'u.name'])
        .select([
          'a.user_id',
          'u.name',
          sql<string>`COUNT(t.id)`.as('total'),
          sql<string>`COUNT(CASE WHEN s.is_done THEN t.id END)`.as('done'),
          sql<string>`COUNT(CASE WHEN t.due_date < NOW() AND NOT s.is_done THEN t.id END)`.as('overdue'),
        ])
        .orderBy(sql`COUNT(CASE WHEN NOT s.is_done THEN t.id END)`, 'desc')
        .limit(8)
        .execute();

      res.json({
        data: summarizePm(activeProjects.count, taskStats, velocityRows, workloadRows),
        error: null,
      });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 4: Typecheck + regression suite**

Run: `cd apps/api && rtk npx tsc --noEmit && rtk npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/routes/analytics.ts
rtk git commit -m "feat(api): infra and pm analytics rollup endpoints"
```

---

### Task 5: Web fetchers + types + shared OverviewTile

**Files:**
- Modify: `apps/web/modules/analytics/lib/analytics.ts` (append)
- Create: `apps/web/modules/analytics/sections/OverviewTile.tsx`

**Interfaces:**
- Consumes: `apiFetch` from `@/modules/shared/lib/api` (already imported in the lib).
- Produces:
  - Types `InfraAnalytics`, `PmAnalytics`, `ResolvedAnalyticsSection`, `AnalyticsSectionProps`.
  - `getInfraAnalytics(token, period)`, `getPmAnalytics(token, period)`, `getAnalyticsSections(token)`.
  - `<OverviewTile label value sub isLoading />` — presentational KPI tile used by all three overview tiles.

- [ ] **Step 1: Append types + fetchers to the analytics lib**

Append to `apps/web/modules/analytics/lib/analytics.ts`:

```ts
// ── Analytics hub ─────────────────────────────────────────────────────────────

export interface InfraAnalytics {
  servers: { online: number; degraded: number; offline: number; stopped: number; avg_cpu: number; avg_mem: number; avg_disk: number };
  websites: { total: number; avg_uptime: number; ssl_expiring_soon: number };
  alerts: { critical: number; warning: number; info: number };
}

export interface PmAnalytics {
  projects: { active: number };
  tasks: { total: number; done: number; overdue: number; open: number; completion_rate: number };
  velocity: Array<{ sprint_name: string; velocity: number | null; end_date: string | null }>;
  workload: Array<{ user_id: string; name: string; total: number; done: number; overdue: number }>;
}

export interface ResolvedAnalyticsSection {
  kind: 'builtin' | 'plugin';
  plugin_id: string;
  id: string;
  slot_id: string;
  label: string | null;
  priority: number;
}

export interface AnalyticsSectionProps {
  period: Period;
}

export function getInfraAnalytics(token: string, period: Period) {
  return apiFetch<{ data: InfraAnalytics; error: null }>(
    `/api/analytics/infra?period=${period}`,
    { token },
  );
}

export function getPmAnalytics(token: string, period: Period) {
  return apiFetch<{ data: PmAnalytics; error: null }>(
    `/api/analytics/pm?period=${period}`,
    { token },
  );
}

export function getAnalyticsSections(token: string) {
  return apiFetch<{ data: ResolvedAnalyticsSection[]; error: null }>(
    '/api/hub/sections/analytics',
    { token },
  );
}
```

- [ ] **Step 2: Create the shared tile**

```tsx
// apps/web/modules/analytics/sections/OverviewTile.tsx
'use client';

interface Props {
  label: string;
  value: string;
  sub?: string;
  isLoading?: boolean;
}

export function OverviewTile({ label, value, sub, isLoading }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, lineHeight: 1.1, color: 'var(--text)' }}>
        {isLoading ? '—' : value}
      </div>
      {sub && !isLoading && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && rtk npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/modules/analytics/lib/analytics.ts apps/web/modules/analytics/sections/OverviewTile.tsx
rtk git commit -m "feat(web): analytics hub fetchers, types, shared overview tile"
```

---

### Task 6: CRM, Infra, and PM section components

**Files:**
- Create: `apps/web/modules/analytics/sections/CrmOverviewTile.tsx`
- Create: `apps/web/modules/analytics/sections/CrmAnalyticsSection.tsx`
- Create: `apps/web/modules/analytics/sections/InfraOverviewTile.tsx`
- Create: `apps/web/modules/analytics/sections/InfraAnalyticsSection.tsx`
- Create: `apps/web/modules/analytics/sections/PmOverviewTile.tsx`
- Create: `apps/web/modules/analytics/sections/PmAnalyticsSection.tsx`

**Interfaces:**
- Consumes: Task 5 fetchers/types; existing `KpiCards`, `RevenueChart`, `PipelineChart`, `RepLeaderboard` components; `useApiToken`; TanStack `useQuery`; `ContextMenu`/`useContextMenu`.
- Produces: six components, each `React.FC<AnalyticsSectionProps>` (`{ period: Period }`), registered in Task 7.

All panel sections share this card style (repeat it in each file — no shared style module needed for one constant):

```ts
const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};
```

- [ ] **Step 1: CRM overview tile**

```tsx
// apps/web/modules/analytics/sections/CrmOverviewTile.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRevenue, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { OverviewTile } from './OverviewTile';

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function CrmOverviewTile({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-revenue', period],
    queryFn: async () => getRevenue(await getToken(), period),
  });

  return (
    <OverviewTile
      label="Revenue"
      value={fmtMoney(data?.data?.total_revenue ?? 0)}
      sub={`${data?.data?.deals_won ?? 0} deals won`}
      isLoading={isLoading}
    />
  );
}
```

- [ ] **Step 2: CRM panel section (moved from the current page body)**

```tsx
// apps/web/modules/analytics/sections/CrmAnalyticsSection.tsx
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRevenue, getPipeline, getTeam, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { KpiCards } from '../components/KpiCards';
import { RevenueChart } from '../components/RevenueChart';
import { PipelineChart } from '../components/PipelineChart';
import { RepLeaderboard } from '../components/RepLeaderboard';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

export function CrmAnalyticsSection({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data: revenueData, isLoading: revLoading } = useQuery({
    queryKey: ['analytics-revenue', period],
    queryFn: async () => getRevenue(await getToken(), period),
  });
  const { data: pipelineData, isLoading: pipeLoading } = useQuery({
    queryKey: ['analytics-pipeline', period],
    queryFn: async () => getPipeline(await getToken(), period),
  });
  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['analytics-team', period],
    queryFn: async () => getTeam(await getToken(), period),
  });

  function chartMenu(queryKey: string, rows: Record<string, unknown>[] | undefined, filename: string) {
    const items: ContextMenuItem[] = [
      { icon: 'refresh', label: 'Refresh', onClick: () => void qc.invalidateQueries({ queryKey: [queryKey, period] }) },
      { icon: 'open', label: 'Export CSV', disabled: !rows || rows.length === 0, onClick: () => downloadCsv(filename, rows ?? []) },
    ];
    return (e: React.MouseEvent) => openMenu(e, items);
  }

  return (
    <div>
      <KpiCards data={revenueData?.data} isLoading={revLoading} />

      <div
        onContextMenu={chartMenu('analytics-revenue', revenueData?.data?.series as Record<string, unknown>[] | undefined, 'revenue.csv')}
        style={{ ...card, padding: '20px 24px' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          Revenue over time
        </div>
        <RevenueChart series={revenueData?.data?.series ?? []} isLoading={revLoading} period={period} />
      </div>

      <div
        onContextMenu={chartMenu('analytics-pipeline', pipelineData?.data?.stages as Record<string, unknown>[] | undefined, 'pipeline.csv')}
        style={{ ...card, padding: '20px 24px' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          Pipeline by stage
        </div>
        <PipelineChart stages={pipelineData?.data?.stages ?? []} isLoading={pipeLoading} />
      </div>

      <div
        onContextMenu={chartMenu('analytics-team', teamData?.data?.reps as Record<string, unknown>[] | undefined, 'rep-leaderboard.csv')}
        style={{ ...card, overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 24px 0', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Rep leaderboard
        </div>
        <RepLeaderboard reps={teamData?.data?.reps} isLoading={teamLoading} />
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
```

- [ ] **Step 3: Infra overview tile**

```tsx
// apps/web/modules/analytics/sections/InfraOverviewTile.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getInfraAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { OverviewTile } from './OverviewTile';

export function InfraOverviewTile({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-infra', period],
    queryFn: async () => getInfraAnalytics(await getToken(), period),
  });

  const s = data?.data?.servers;
  const total = s ? s.online + s.degraded + s.offline + s.stopped : 0;
  const critical = data?.data?.alerts.critical ?? 0;

  return (
    <OverviewTile
      label="Servers online"
      value={`${s?.online ?? 0}/${total}`}
      sub={critical > 0 ? `${critical} critical alert${critical === 1 ? '' : 's'}` : 'No critical alerts'}
      isLoading={isLoading}
    />
  );
}
```

- [ ] **Step 4: Infra panel section**

```tsx
// apps/web/modules/analytics/sections/InfraAnalyticsSection.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getInfraAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--text)';
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color }}>{value}</div>
    </div>
  );
}

export function InfraAnalyticsSection({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics-infra', period],
    queryFn: async () => getInfraAnalytics(await getToken(), period),
  });

  if (isError) {
    return (
      <div style={{ ...card, padding: '20px 24px', color: 'var(--text2)', fontSize: 13 }}>
        Failed to load infrastructure analytics.
      </div>
    );
  }

  const d = data?.data;
  const pct = (n: number | undefined) => (n === undefined ? '—' : `${n.toFixed(0)}%`);

  return (
    <div style={{ ...card, padding: '20px 24px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
        Infrastructure
      </div>
      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <Stat label="Online" value={String(d?.servers.online ?? 0)} tone="green" />
            <Stat label="Degraded" value={String(d?.servers.degraded ?? 0)} tone={d?.servers.degraded ? 'amber' : undefined} />
            <Stat label="Offline" value={String(d?.servers.offline ?? 0)} tone={d?.servers.offline ? 'red' : undefined} />
            <Stat label="Avg CPU" value={pct(d?.servers.avg_cpu)} />
            <Stat label="Avg memory" value={pct(d?.servers.avg_mem)} />
            <Stat label="Avg disk" value={pct(d?.servers.avg_disk)} />
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <Stat label="Websites" value={String(d?.websites.total ?? 0)} />
            <Stat label="Avg uptime (30d)" value={d?.websites.avg_uptime !== undefined ? `${d.websites.avg_uptime.toFixed(2)}%` : '—'} />
            <Stat label="SSL expiring <30d" value={String(d?.websites.ssl_expiring_soon ?? 0)} tone={d?.websites.ssl_expiring_soon ? 'amber' : undefined} />
            <Stat label="Critical alerts" value={String(d?.alerts.critical ?? 0)} tone={d?.alerts.critical ? 'red' : undefined} />
            <Stat label="Warnings" value={String(d?.alerts.warning ?? 0)} tone={d?.alerts.warning ? 'amber' : undefined} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: PM overview tile**

```tsx
// apps/web/modules/analytics/sections/PmOverviewTile.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPmAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { OverviewTile } from './OverviewTile';

export function PmOverviewTile({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-pm', period],
    queryFn: async () => getPmAnalytics(await getToken(), period),
  });

  return (
    <OverviewTile
      label="Task completion"
      value={`${data?.data?.tasks.completion_rate ?? 0}%`}
      sub={`${data?.data?.projects.active ?? 0} active projects`}
      isLoading={isLoading}
    />
  );
}
```

- [ ] **Step 6: PM panel section**

```tsx
// apps/web/modules/analytics/sections/PmAnalyticsSection.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPmAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--text)';
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color }}>{value}</div>
    </div>
  );
}

export function PmAnalyticsSection({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics-pm', period],
    queryFn: async () => getPmAnalytics(await getToken(), period),
  });

  if (isError) {
    return (
      <div style={{ ...card, padding: '20px 24px', color: 'var(--text2)', fontSize: 13 }}>
        Failed to load project analytics.
      </div>
    );
  }

  const d = data?.data;
  const maxVelocity = Math.max(1, ...(d?.velocity ?? []).map(v => v.velocity ?? 0));

  return (
    <div style={{ ...card, padding: '20px 24px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
        Projects
      </div>
      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <Stat label="Active projects" value={String(d?.projects.active ?? 0)} />
            <Stat label="Open tasks" value={String(d?.tasks.open ?? 0)} />
            <Stat label="Done" value={String(d?.tasks.done ?? 0)} tone="green" />
            <Stat label="Overdue" value={String(d?.tasks.overdue ?? 0)} tone={d?.tasks.overdue ? 'red' : undefined} />
            <Stat label="Completion" value={`${d?.tasks.completion_rate ?? 0}%`} />
          </div>

          {(d?.velocity.length ?? 0) > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Sprint velocity (recent)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d!.velocity.map((v, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text2)', width: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {v.sprint_name}
                    </div>
                    <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${((v.velocity ?? 0) / maxVelocity) * 100}%`, height: '100%', background: 'var(--green)', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text)', width: 32, textAlign: 'right' }}>{v.velocity ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(d?.workload.length ?? 0) > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Workload (open tasks by assignee)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d!.workload.map(w => (
                  <div key={w.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <div style={{ color: 'var(--text)', width: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                    <div style={{ color: 'var(--text2)' }}>{w.total - w.done} open</div>
                    {w.overdue > 0 && <div style={{ color: 'var(--red)' }}>{w.overdue} overdue</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && rtk npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/web/modules/analytics/sections/
rtk git commit -m "feat(web): crm, infra, pm analytics section components"
```

---

### Task 7: Section registry + Analytics page as slot outlet

**Files:**
- Create: `apps/web/modules/analytics/sections/registry.ts`
- Modify: `apps/web/modules/analytics/pages/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: all six section components (Task 6), `getAnalyticsSections` + `ResolvedAnalyticsSection` + `AnalyticsSectionProps` (Task 5), `usePluginRegistry` from `@/modules/shared/contexts/PluginRuntimeContext` (plugin fallback, same pattern as `SlotOutlet.tsx`), `ModuleGuard`, `Topbar`.
- Produces: `ANALYTICS_SECTION_COMPONENTS: Record<string, ComponentType<AnalyticsSectionProps>>`; the rewritten `/analytics` page.

- [ ] **Step 1: Create the client registry**

```ts
// apps/web/modules/analytics/sections/registry.ts
import type { ComponentType } from 'react';
import type { AnalyticsSectionProps } from '../lib/analytics';
import { CrmOverviewTile } from './CrmOverviewTile';
import { CrmAnalyticsSection } from './CrmAnalyticsSection';
import { InfraOverviewTile } from './InfraOverviewTile';
import { InfraAnalyticsSection } from './InfraAnalyticsSection';
import { PmOverviewTile } from './PmOverviewTile';
import { PmAnalyticsSection } from './PmAnalyticsSection';

/** Builtin analytics sections — keys match BUILTIN_ANALYTICS_SECTIONS ids. */
export const ANALYTICS_SECTION_COMPONENTS: Record<string, ComponentType<AnalyticsSectionProps>> = {
  'crm-overview': CrmOverviewTile,
  'infra-overview': InfraOverviewTile,
  'pm-overview': PmOverviewTile,
  'crm-panel': CrmAnalyticsSection,
  'infra-panel': InfraAnalyticsSection,
  'pm-panel': PmAnalyticsSection,
};
```

- [ ] **Step 2: Rewrite the analytics page**

Replace the full contents of `apps/web/modules/analytics/pages/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { usePluginRegistry } from '@/modules/shared/contexts/PluginRuntimeContext';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import {
  getAnalyticsSections,
  type Period,
  type ResolvedAnalyticsSection,
} from '@/modules/analytics/lib/analytics';
import { ANALYTICS_SECTION_COMPONENTS } from '../sections/registry';

const PERIODS: { label: string; value: Period }[] = [
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '12M', value: '12m' },
];

function SectionRenderer({ section, period }: { section: ResolvedAnalyticsSection; period: Period }) {
  const { registry } = usePluginRegistry();

  if (section.kind === 'builtin') {
    const Component = ANALYTICS_SECTION_COMPONENTS[section.id];
    if (!Component) return null;
    return <Component period={period} />;
  }

  // Plugin section — same fallback path as SlotOutlet
  const def = registry.sections.get(`${section.plugin_id}:${section.id}`);
  if (!def) return null;
  const PluginComponent = def.component;
  return <PluginComponent />;
}

export default function AnalyticsPage() {
  const getToken = useApiToken();
  const [period, setPeriod] = useState<Period>('30d');

  const { data: sectionsData, isLoading } = useQuery({
    queryKey: ['analytics-sections'],
    queryFn: async () => getAnalyticsSections(await getToken()),
  });

  const sections = sectionsData?.data ?? [];
  const overview = sections.filter(s => s.slot_id === 'overview');
  const panels = sections.filter(s => s.slot_id === 'panels');

  const periodToggle = (
    <div style={{ display: 'flex', gap: 3, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', padding: 3 }}>
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => setPeriod(p.value)}
          style={{
            padding: '4px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            background: period === p.value ? 'var(--surface)' : 'transparent',
            color: period === p.value ? 'var(--text)' : 'var(--text2)',
            boxShadow: period === p.value ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            transition: 'all .15s',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <ModuleGuard moduleId="analytics">
      <Topbar action={periodToggle} />

      <div style={{ padding: 24 }}>
        {!isLoading && sections.length === 0 && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px 24px',
              textAlign: 'center',
              color: 'var(--text2)',
              fontSize: 13,
            }}
          >
            No analytics sources enabled — enable a module to see analytics here.
          </div>
        )}

        {overview.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(overview.length, 3)}, 1fr)`,
              gap: 16,
              marginBottom: 16,
            }}
          >
            {overview.map(s => (
              <SectionRenderer key={`${s.plugin_id}:${s.id}`} section={s} period={period} />
            ))}
          </div>
        )}

        {panels.map(s => (
          <SectionRenderer key={`${s.plugin_id}:${s.id}`} section={s} period={period} />
        ))}
      </div>
    </ModuleGuard>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && rtk npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser verification**

Start the dev servers (use the existing `.claude/launch.json` config / preview tooling; api + web). Then verify on `/analytics`:

1. All modules on: overview strip shows 3 tiles (Revenue, Servers online, Task completion); below it CRM panel (KPIs + 2 charts + leaderboard), Infrastructure panel, Projects panel — in that order.
2. Period toggle switches 30D/90D/12M and CRM charts refetch (network tab: `?period=90d`).
3. Disable the `projects` module in settings → reload `/analytics` → Projects tile + panel gone, no errors.
4. Re-enable `projects` → sections return.
5. Console: no errors; `/api/hub/sections/analytics` returns 6 entries with `kind: 'builtin'`.

Expected: all five checks pass.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/modules/analytics/sections/registry.ts apps/web/modules/analytics/pages/page.tsx
rtk git commit -m "feat(web): analytics page renders dynamic hub sections"
```

---

### Task 8: Final verification + graph update

**Files:** none (verification only)

- [ ] **Step 1: Full test suites**

Run: `cd apps/api && rtk npx vitest run`
Expected: PASS, zero failures.

Run: `cd apps/web && rtk npx tsc --noEmit && cd ../api && rtk npx tsc --noEmit`
Expected: no type errors in either app.

- [ ] **Step 2: Production build check**

Run: `rtk pnpm --filter web build` (from repo root)
Expected: build succeeds; `/analytics` route compiles.

- [ ] **Step 3: Update the knowledge graph**

Run: `graphify update .`
Expected: graph updated with new routes/components.

- [ ] **Step 4: Commit any graph output changes**

```bash
rtk git add graphify-out/
rtk git commit -m "chore: update knowledge graph for analytics hub"
```
