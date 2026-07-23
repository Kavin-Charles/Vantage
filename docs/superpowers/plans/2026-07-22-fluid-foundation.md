# Fluid Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared "Vencore Fluid" design foundation — a `(fluid)` route group with a glass shell host, a scoped token layer (light+dark), theme-aware primitives, a settings-surface registry, an RBAC-filtered nav model, and widget/panel/hook host seams — so specs 2 (CRM) and 3 (Settings) build on it.

**Architecture:** Additive only. New files under `app/(fluid)/` and `modules/shared/fluid/`. Nothing in `(dashboard)`, `globals.css`, or the 9 non-redesigned modules is modified. Fluid tokens are scoped under a `.fluid-root` class so they never leak globally. Theme reuses the existing `ThemeContext` (which already sets `data-theme` on `<html>`); Fluid dark overrides key off `[data-theme="dark"]`. Pure logic (registries, nav filtering, permission filters) is TDD-tested with vitest `.test.ts` matching the existing web test pattern; style-only components are verified by `tsc --noEmit` + the in-app preview against `_design`/DESIGN.md (the repo has no component-render test infra and this plan does not add any — YAGNI).

**Tech Stack:** Next.js App Router (TypeScript), React, Tailwind v4 (CSS-var tokens), `next/font/google`, Material Symbols Outlined, vitest. Existing: `@vencore/plugin-types`, react-query, RTK.

## Global Constraints

- TypeScript strict mode. **No `any` types.** No `console.log` in production paths.
- Do **not** modify existing migration files, `app/globals.css`, `app/(dashboard)/*`, or non-CRM/Settings modules.
- Fonts via `next/font/google` only — **no CDN**, no external `<link>`.
- Fluid tokens live only under `.fluid-root`; never edit `:root` in `globals.css`.
- Reuse existing `ThemeContext`/`useTheme`, `useAuth().hasPermission`, `useModules().isEnabled`. Do not build parallel systems.
- Git: work on branch `claude/refactor-crm-redesign-94d91e` (already checked out). Sole author Kavin-Charles; **never** add AI/Claude/Anthropic attribution to commits. One small commit per task.
- API response envelope elsewhere is `{ data, error }`; not relevant to this additive UI foundation but keep in mind for later specs.
- Design tokens source of truth: `_design`-equivalent `vencore_fluid/DESIGN.md` (values copied verbatim into Task 1).

---

## File Structure

```
apps/web/
  app/(fluid)/
    layout.tsx                         # FluidShell host (Task 9)
    _probe/page.tsx                    # temporary shell smoke page (Task 9, deleted in spec 2)
  modules/shared/fluid/
    fonts.ts                           # next/font: Space Grotesk, Inter, Material Symbols (Task 1)
    fluid.css                          # scoped .fluid-root token layer, light+dark (Task 1)
    settings-registry.ts               # settings-surface registry (Task 2)
    settings-registry.test.ts          # (Task 2)
    nav/
      nav-model.ts                     # nav item types + base items (Task 3)
      filter-nav.ts                    # pure RBAC/module/plugin nav filtering (Task 3)
      filter-nav.test.ts               # (Task 3)
    ui/
      MSIcon.tsx                       # (Task 4)
      FluidButton.tsx  GlassCard.tsx  FluidBadge.tsx  FluidChip.tsx   # (Task 5)
      FluidInput.tsx  FluidSelect.tsx  PillTabs.tsx  MetricPill.tsx  Avatar.tsx  PageHeader.tsx  EmptyState.tsx  # (Task 6)
      FluidModal.tsx  FluidTable.tsx   # (Task 7)
      index.ts                         # barrel export (Task 7)
    shell/
      FluidSidebar.tsx  FluidTopbar.tsx  # (Task 8)
      FluidShell.tsx                     # (Task 9)
    host/
      FluidWidgetCard.tsx  FluidBentoGrid.tsx  filter-widgets.ts  filter-widgets.test.ts  # (Task 10)
      FluidPanelSlot.tsx  HookFeatureCard.tsx                                             # (Task 10)
  package.json                         # add "test": "vitest run" (Task 2)
plugin-docs/*.mdx                       # @vantage → @vencore (Task 11)
```

---

## Task 1: Fonts + Fluid token layer

**Files:**
- Create: `apps/web/modules/shared/fluid/fonts.ts`
- Create: `apps/web/modules/shared/fluid/fluid.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `spaceGrotesk`, `inter`, `materialSymbols` font objects (each exposes `.variable`); CSS class `.fluid-root` exposing Fluid CSS custom properties; utility classes `.glass-panel`, `.glass-card`.

- [ ] **Step 1: Create the font module**

```ts
// apps/web/modules/shared/fluid/fonts.ts
import { Space_Grotesk, Inter } from 'next/font/google';
import localFont from 'next/font/local';

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fluid-font-display',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--fluid-font-body',
});

// Material Symbols Outlined is an icon font; next/font/google does not expose it,
// so it is self-hosted. Download the variable woff2 once into ./assets and reference it.
export const materialSymbols = localFont({
  src: './assets/material-symbols-outlined.woff2',
  variable: '--fluid-font-icon',
  display: 'block',
});
```

- [ ] **Step 2: Fetch the Material Symbols woff2 into assets**

Run:
```bash
mkdir -p apps/web/modules/shared/fluid/assets
curl -sL "https://fonts.gstatic.com/s/materialsymbolsoutlined/v205/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsI.woff2" \
  -o apps/web/modules/shared/fluid/assets/material-symbols-outlined.woff2
ls -la apps/web/modules/shared/fluid/assets/material-symbols-outlined.woff2
```
Expected: a woff2 file > 100KB is written. (If the pinned URL 404s, open https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined in a browser, copy the current `src: url(...)` woff2 link, and use that. The download is build-time only; no runtime CDN.)

- [ ] **Step 3: Create the scoped token layer**

```css
/* apps/web/modules/shared/fluid/fluid.css */
/* Vencore Fluid tokens — SCOPED to .fluid-root only. Never touches :root/globals.css. */

.fluid-root {
  /* Palette (light) — from vencore_fluid/DESIGN.md */
  --fl-primary: #0048ce;
  --fl-primary-container: #2d62ed;
  --fl-on-primary: #ffffff;
  --fl-on-primary-container: #eff0ff;
  --fl-secondary: #686000;
  --fl-secondary-container: #f3e34c;
  --fl-on-secondary-container: #6d6400;
  --fl-error: #ba1a1a;
  --fl-error-container: #ffdad6;
  --fl-on-error-container: #93000a;

  --fl-surface: #f7f9fb;
  --fl-surface-container-lowest: #ffffff;
  --fl-surface-container-low: #f2f4f6;
  --fl-surface-container: #eceef0;
  --fl-surface-container-high: #e6e8ea;
  --fl-surface-container-highest: #e0e3e5;
  --fl-on-surface: #191c1e;
  --fl-on-surface-variant: #434655;
  --fl-outline: #737686;
  --fl-outline-variant: #c3c5d7;

  /* Glass */
  --fl-glass-bg: rgba(255, 255, 255, 0.6);
  --fl-glass-panel-bg: rgba(255, 255, 255, 0.4);
  --fl-glass-border: rgba(255, 255, 255, 0.4);
  --fl-glass-blur: 16px;

  /* Body gradient */
  --fl-body-gradient:
    radial-gradient(circle at top left, #f7f9fb, #e0e3e5 40%, #f3e34c22 80%),
    radial-gradient(circle at bottom right, #eff0ff 0%, #ffffff 50%);

  /* Type */
  --fl-font-display: var(--fluid-font-display), 'Space Grotesk', system-ui, sans-serif;
  --fl-font-body: var(--fluid-font-body), 'Inter', system-ui, sans-serif;

  /* Radii */
  --fl-radius-input: 12px;
  --fl-radius-card: 24px;
  --fl-radius-pill: 9999px;

  /* Elevation */
  --fl-shadow-float: 0 20px 40px rgba(0, 0, 0, 0.04);
  --fl-shadow-primary: 0 10px 20px rgba(0, 72, 206, 0.15);

  color: var(--fl-on-surface);
  font-family: var(--fl-font-body);
}

/* Dark overrides — data-theme is set on <html> by ThemeContext. Designed (no mockup). */
:root[data-theme='dark'] .fluid-root {
  --fl-on-primary: #eff0ff;
  --fl-on-primary-container: #dce1ff;

  --fl-surface: #101317;
  --fl-surface-container-lowest: #0b0e11;
  --fl-surface-container-low: #161a1f;
  --fl-surface-container: #1b2027;
  --fl-surface-container-high: #222831;
  --fl-surface-container-highest: #2a313b;
  --fl-on-surface: #eff1f3;
  --fl-on-surface-variant: #c3c6cf;
  --fl-outline: #8b8f9c;
  --fl-outline-variant: #3a3f4b;

  --fl-glass-bg: rgba(24, 28, 35, 0.55);
  --fl-glass-panel-bg: rgba(24, 28, 35, 0.4);
  --fl-glass-border: rgba(255, 255, 255, 0.08);

  --fl-body-gradient:
    radial-gradient(circle at top left, #12161c, #0b0e11 45%, #1b1f0a 90%),
    radial-gradient(circle at bottom right, #10162b 0%, #0b0e11 55%);
}

.fluid-root .glass-panel {
  background: var(--fl-glass-panel-bg);
  backdrop-filter: blur(var(--fl-glass-blur));
  -webkit-backdrop-filter: blur(var(--fl-glass-blur));
  border: 1px solid var(--fl-glass-border);
}

.fluid-root .glass-card {
  background: var(--fl-glass-bg);
  backdrop-filter: blur(var(--fl-glass-blur));
  -webkit-backdrop-filter: blur(var(--fl-glass-blur));
  border: 1px solid var(--fl-glass-border);
  border-radius: var(--fl-radius-card);
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS (no errors introduced; `fonts.ts` resolves `next/font`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/shared/fluid/fonts.ts apps/web/modules/shared/fluid/fluid.css apps/web/modules/shared/fluid/assets
git commit -m "feat(fluid): add scoped token layer and font module"
```

---

## Task 2: Settings-surface registry

**Files:**
- Create: `apps/web/modules/shared/fluid/settings-registry.ts`
- Create: `apps/web/modules/shared/fluid/settings-registry.test.ts`
- Modify: `apps/web/package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SettingsScope = 'personal' | 'workspace'`
  - `interface SettingsEntryDef { id; scope; label; icon; order?; permission?; adminOnly?; component }`
  - `registerSettingsEntry(def: SettingsEntryDef): void`
  - `getSettingsEntries(scope: SettingsScope): SettingsEntryDef[]` (sorted by `order` asc then `label`)
  - `getSettingsEntryById(id: string): SettingsEntryDef | undefined`
  - `__resetSettingsRegistry(): void` (test-only)

- [ ] **Step 1: Add the web `test` script**

In `apps/web/package.json`, add to `"scripts"`: `"test": "vitest run"` (matches `apps/api`).

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/modules/shared/fluid/settings-registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSettingsEntry,
  getSettingsEntries,
  getSettingsEntryById,
  __resetSettingsRegistry,
  type SettingsEntryDef,
} from './settings-registry';

const Noop = () => null;
const entry = (over: Partial<SettingsEntryDef>): SettingsEntryDef => ({
  id: 'x', scope: 'personal', label: 'X', icon: 'settings', component: Noop, ...over,
});

describe('settings-registry', () => {
  beforeEach(() => __resetSettingsRegistry());

  it('registers and returns entries by scope', () => {
    registerSettingsEntry(entry({ id: 'profile', scope: 'personal', label: 'Profile' }));
    registerSettingsEntry(entry({ id: 'users', scope: 'workspace', label: 'Users' }));
    expect(getSettingsEntries('personal').map(e => e.id)).toEqual(['profile']);
    expect(getSettingsEntries('workspace').map(e => e.id)).toEqual(['users']);
  });

  it('ignores duplicate ids', () => {
    registerSettingsEntry(entry({ id: 'profile', label: 'Profile' }));
    registerSettingsEntry(entry({ id: 'profile', label: 'Dupe' }));
    expect(getSettingsEntries('personal')).toHaveLength(1);
    expect(getSettingsEntries('personal')[0]!.label).toBe('Profile');
  });

  it('sorts by order then label', () => {
    registerSettingsEntry(entry({ id: 'a', label: 'Zeta', order: 1 }));
    registerSettingsEntry(entry({ id: 'b', label: 'Alpha', order: 1 }));
    registerSettingsEntry(entry({ id: 'c', label: 'Beta' })); // no order → after ordered
    expect(getSettingsEntries('personal').map(e => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('looks up by id', () => {
    registerSettingsEntry(entry({ id: 'profile' }));
    expect(getSettingsEntryById('profile')?.id).toBe('profile');
    expect(getSettingsEntryById('missing')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run modules/shared/fluid/settings-registry.test.ts`
Expected: FAIL — cannot find module `./settings-registry`.

- [ ] **Step 4: Write the implementation**

```ts
// apps/web/modules/shared/fluid/settings-registry.ts
import type { ComponentType } from 'react';

export type SettingsScope = 'personal' | 'workspace';

export interface SettingsEntryDef {
  id: string;
  scope: SettingsScope;
  label: string;
  icon: string;          // Material Symbols name
  order?: number;        // lower = earlier; unset sorts after all ordered entries
  permission?: string;   // RBAC gate key (checked at render by consumers)
  adminOnly?: boolean;   // workspace-scope admin gate
  component: ComponentType;
}

const _registry: SettingsEntryDef[] = [];

export function registerSettingsEntry(def: SettingsEntryDef): void {
  if (_registry.some(d => d.id === def.id)) return;
  _registry.push(def);
}

export function getSettingsEntries(scope: SettingsScope): SettingsEntryDef[] {
  const ORDER_MAX = Number.MAX_SAFE_INTEGER;
  return _registry
    .filter(d => d.scope === scope)
    .sort((a, b) => (a.order ?? ORDER_MAX) - (b.order ?? ORDER_MAX) || a.label.localeCompare(b.label));
}

export function getSettingsEntryById(id: string): SettingsEntryDef | undefined {
  return _registry.find(d => d.id === id);
}

/** Test-only: clears the module-level registry between tests. */
export function __resetSettingsRegistry(): void {
  _registry.length = 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run modules/shared/fluid/settings-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/modules/shared/fluid/settings-registry.ts apps/web/modules/shared/fluid/settings-registry.test.ts
git commit -m "feat(fluid): add settings-surface registry"
```

---

## Task 3: Nav model + RBAC/module/plugin filtering

**Files:**
- Create: `apps/web/modules/shared/fluid/nav/nav-model.ts`
- Create: `apps/web/modules/shared/fluid/nav/filter-nav.ts`
- Create: `apps/web/modules/shared/fluid/nav/filter-nav.test.ts`

**Interfaces:**
- Consumes: nothing (pure). Runtime callers pass `hasPermission`, `isModuleEnabled`, `isAdmin`, and plugin nav items.
- Produces:
  - `type NavGroup = 'general' | 'sales' | 'infra' | 'projects' | 'insights'`
  - `interface NavItem { id; label; icon; href; group; module?; permission?; adminOnly? }`
  - `interface NavGroupItems { group: NavGroup; items: NavItem[] }`
  - `interface PluginNavItem { label; path; icon?; group?: 'crm' | 'infra' | 'general' }`
  - `BASE_NAV: NavItem[]`
  - `interface NavContext { hasPermission(key: string): boolean; isModuleEnabled(id: string): boolean; isAdmin: boolean }`
  - `buildNav(base: NavItem[], plugins: PluginNavItem[], ctx: NavContext): NavGroupItems[]`

- [ ] **Step 1: Write the nav model**

```ts
// apps/web/modules/shared/fluid/nav/nav-model.ts
export type NavGroup = 'general' | 'sales' | 'infra' | 'projects' | 'insights';

export interface NavItem {
  id: string;
  label: string;
  icon: string;        // Material Symbols name
  href: string;
  group: NavGroup;
  module?: string;     // gates on useModules().isEnabled(module)
  permission?: string; // gates on hasPermission(permission)
  adminOnly?: boolean;
}

export const GROUP_ORDER: NavGroup[] = ['general', 'sales', 'infra', 'projects', 'insights'];

export const GROUP_LABEL: Record<NavGroup, string> = {
  general: 'General', sales: 'Sales', infra: 'Infra', projects: 'Projects', insights: 'Insights',
};

// Base destinations. CRM + Settings resolve to (fluid) routes; others link to existing
// (dashboard) routes (same app, URLs unchanged) so the shell presents one unified nav.
export const BASE_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard',    href: '/dashboard', group: 'general' },
  { id: 'pipeline',  label: 'Pipeline',  icon: 'account_tree', href: '/crm/pipeline',  group: 'sales', module: 'crm' },
  { id: 'contacts',  label: 'Contacts',  icon: 'person',       href: '/crm/contacts',  group: 'sales', module: 'crm' },
  { id: 'companies', label: 'Companies', icon: 'domain',       href: '/crm/companies', group: 'sales', module: 'crm' },
  { id: 'tasks',     label: 'Tasks',     icon: 'checklist',    href: '/crm/tasks',     group: 'sales', module: 'crm' },
  { id: 'activity',  label: 'Activity',  icon: 'timeline',     href: '/activity',      group: 'sales', module: 'activity' },
  { id: 'servers',   label: 'Servers',   icon: 'dns',          href: '/infra',         group: 'infra', module: 'infra' },
  { id: 'databases', label: 'Databases', icon: 'database',     href: '/infra/databases', group: 'infra', module: 'infra' },
  { id: 'websites',  label: 'Websites',  icon: 'language',     href: '/infra/websites',  group: 'infra', module: 'infra' },
  { id: 'alerts',    label: 'Alerts',    icon: 'warning',      href: '/infra/alerts',    group: 'infra', module: 'infra' },
  { id: 'messaging', label: 'Messaging', icon: 'chat',         href: '/messaging',  group: 'projects', module: 'messaging' },
  { id: 'projects',  label: 'Projects',  icon: 'folder',       href: '/projects',   group: 'projects', module: 'projects' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics',    href: '/analytics',  group: 'insights', module: 'analytics' },
];
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/modules/shared/fluid/nav/filter-nav.test.ts
import { describe, it, expect } from 'vitest';
import { buildNav, type NavContext } from './filter-nav';
import type { NavItem, PluginNavItem } from './filter-nav';

const items: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard', group: 'general' },
  { id: 'contacts', label: 'Contacts', icon: 'person', href: '/crm/contacts', group: 'sales', module: 'crm' },
  { id: 'infra', label: 'Servers', icon: 'dns', href: '/infra', group: 'infra', module: 'infra' },
  { id: 'roles', label: 'Roles', icon: 'shield', href: '/settings/roles', group: 'general', adminOnly: true, permission: 'settings.roles.read' },
];

const ctx = (over: Partial<NavContext>): NavContext => ({
  hasPermission: () => true, isModuleEnabled: () => true, isAdmin: true, ...over,
});

describe('buildNav', () => {
  it('groups enabled items in group order', () => {
    const groups = buildNav(items, [], ctx({}));
    expect(groups.map(g => g.group)).toEqual(['general', 'sales', 'infra']);
    expect(groups[1]!.items.map(i => i.id)).toEqual(['contacts']);
  });

  it('drops items whose module is disabled', () => {
    const groups = buildNav(items, [], ctx({ isModuleEnabled: id => id !== 'infra' }));
    expect(groups.find(g => g.group === 'infra')).toBeUndefined();
  });

  it('drops adminOnly items for non-admins', () => {
    const groups = buildNav(items, [], ctx({ isAdmin: false }));
    expect(groups.flatMap(g => g.items).some(i => i.id === 'roles')).toBe(false);
  });

  it('drops items when permission is missing', () => {
    const groups = buildNav(items, [], ctx({ hasPermission: k => k !== 'settings.roles.read' }));
    expect(groups.flatMap(g => g.items).some(i => i.id === 'roles')).toBe(false);
  });

  it('merges plugin nav items into mapped groups', () => {
    const plugins: PluginNavItem[] = [{ label: 'Calendar', path: '/calendar', icon: 'event', group: 'general' }];
    const groups = buildNav(items, plugins, ctx({}));
    const general = groups.find(g => g.group === 'general')!;
    expect(general.items.some(i => i.id === 'plugin:/calendar' && i.label === 'Calendar')).toBe(true);
  });

  it('omits empty groups', () => {
    const groups = buildNav(items, [], ctx({ isModuleEnabled: () => false }));
    // only items without a module remain (dashboard, roles) → general only
    expect(groups.map(g => g.group)).toEqual(['general']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run modules/shared/fluid/nav/filter-nav.test.ts`
Expected: FAIL — cannot find module `./filter-nav`.

- [ ] **Step 4: Write the implementation**

```ts
// apps/web/modules/shared/fluid/nav/filter-nav.ts
import { GROUP_ORDER, type NavGroup, type NavItem } from './nav-model';

export type { NavItem, NavGroup } from './nav-model';

export interface PluginNavItem {
  label: string;
  path: string;
  icon?: string;
  group?: 'crm' | 'infra' | 'general';
}

export interface NavGroupItems {
  group: NavGroup;
  items: NavItem[];
}

export interface NavContext {
  hasPermission(key: string): boolean;
  isModuleEnabled(id: string): boolean;
  isAdmin: boolean;
}

// Plugin nav groups (crm/infra/general) → shell NavGroup.
const PLUGIN_GROUP_MAP: Record<NonNullable<PluginNavItem['group']>, NavGroup> = {
  crm: 'sales', infra: 'infra', general: 'general',
};

function isVisible(item: NavItem, ctx: NavContext): boolean {
  if (item.adminOnly && !ctx.isAdmin) return false;
  if (item.permission && !ctx.hasPermission(item.permission)) return false;
  if (item.module && !ctx.isModuleEnabled(item.module)) return false;
  return true;
}

export function buildNav(base: NavItem[], plugins: PluginNavItem[], ctx: NavContext): NavGroupItems[] {
  const visible = base.filter(item => isVisible(item, ctx));

  const pluginItems: NavItem[] = plugins.map(p => ({
    id: `plugin:${p.path}`,
    label: p.label,
    icon: p.icon ?? 'extension',
    href: p.path,
    group: PLUGIN_GROUP_MAP[p.group ?? 'general'],
  }));

  const all = [...visible, ...pluginItems];

  return GROUP_ORDER
    .map(group => ({ group, items: all.filter(i => i.group === group) }))
    .filter(g => g.items.length > 0);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run modules/shared/fluid/nav/filter-nav.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/modules/shared/fluid/nav
git commit -m "feat(fluid): add nav model and RBAC/module/plugin nav filtering"
```

---

## Task 4: MSIcon primitive

**Files:**
- Create: `apps/web/modules/shared/fluid/ui/MSIcon.tsx`

**Interfaces:**
- Consumes: `materialSymbols` font (Task 1) applied by FluidShell (Task 9).
- Produces: `<MSIcon name="add" size={20} fill />` — renders a Material Symbols glyph. Props: `name: string; size?: number; fill?: boolean; weight?: number; style?: React.CSSProperties; className?: string`.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/modules/shared/fluid/ui/MSIcon.tsx
export function MSIcon({
  name, size = 24, fill = false, weight = 400, style, className,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        fontFamily: 'var(--fluid-font-icon), "Material Symbols Outlined"',
        fontWeight: 'normal',
        fontStyle: 'normal',
        fontSize: size,
        lineHeight: 1,
        letterSpacing: 'normal',
        whiteSpace: 'nowrap',
        display: 'inline-block',
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        userSelect: 'none',
        ...style,
      }}
    >
      {name}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/fluid/ui/MSIcon.tsx
git commit -m "feat(fluid): add MSIcon Material Symbols primitive"
```

---

## Task 5: Primitives batch A — Button, Card, Badge, Chip

**Files:**
- Create: `apps/web/modules/shared/fluid/ui/FluidButton.tsx`
- Create: `apps/web/modules/shared/fluid/ui/GlassCard.tsx`
- Create: `apps/web/modules/shared/fluid/ui/FluidBadge.tsx`
- Create: `apps/web/modules/shared/fluid/ui/FluidChip.tsx`

**Interfaces:**
- Consumes: `.fluid-root` tokens (Task 1), `MSIcon` (Task 4).
- Produces:
  - `<FluidButton variant='primary'|'ghost'|'dark' onClick icon? type? disabled>` (pill).
  - `<GlassCard style? className?>children` (24px glass container).
  - `<FluidBadge tone='blue'|'gold'|'green'|'red'|'neutral'>text`.
  - `<FluidChip active onClick>text` (pill filter).

- [ ] **Step 1: FluidButton**

```tsx
// apps/web/modules/shared/fluid/ui/FluidButton.tsx
'use client';
import { useState } from 'react';
import { MSIcon } from './MSIcon';

type Variant = 'primary' | 'ghost' | 'dark';

const BASE: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--fl-primary)', color: 'var(--fl-on-primary)', border: '1px solid transparent', boxShadow: 'var(--fl-shadow-primary)' },
  ghost:   { background: 'transparent', color: 'var(--fl-on-surface-variant)', border: '1px solid var(--fl-outline-variant)' },
  dark:    { background: '#102a43', color: '#ffffff', border: '1px solid transparent' },
};

export function FluidButton({
  children, variant = 'primary', onClick, type = 'button', disabled, icon, style,
}: {
  children: React.ReactNode;
  variant?: Variant;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  icon?: string;
  style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '12px 24px', borderRadius: 'var(--fl-radius-pill)',
        fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform .2s, opacity .2s', whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        ...BASE[variant],
        ...(hover && !disabled ? { transform: 'scale(1.03)', opacity: 0.95 } : {}),
        ...style,
      }}
    >
      {icon ? <MSIcon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: GlassCard**

```tsx
// apps/web/modules/shared/fluid/ui/GlassCard.tsx
export function GlassCard({
  children, style, className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`glass-card${className ? ` ${className}` : ''}`}
      style={{ padding: 24, boxShadow: 'var(--fl-shadow-float)', ...style }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: FluidBadge**

```tsx
// apps/web/modules/shared/fluid/ui/FluidBadge.tsx
type Tone = 'blue' | 'gold' | 'green' | 'red' | 'neutral';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  blue:    { fg: 'var(--fl-primary)', bg: 'rgba(0,72,206,0.10)' },
  gold:    { fg: 'var(--fl-on-secondary-container)', bg: 'rgba(243,227,76,0.20)' },
  green:   { fg: '#1b5e20', bg: 'rgba(46,125,50,0.12)' },
  red:     { fg: 'var(--fl-on-error-container)', bg: 'var(--fl-error-container)' },
  neutral: { fg: 'var(--fl-on-surface-variant)', bg: 'var(--fl-surface-container-high)' },
};

export function FluidBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 'var(--fl-radius-pill)',
      fontFamily: 'var(--fl-font-body)', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.02em', color: t.fg, background: t.bg, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: FluidChip**

```tsx
// apps/web/modules/shared/fluid/ui/FluidChip.tsx
'use client';
export function FluidChip({
  children, active = false, onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px', borderRadius: 'var(--fl-radius-pill)',
        fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        transition: 'background .2s, color .2s',
        color: active ? 'var(--fl-on-primary-container)' : 'var(--fl-on-surface-variant)',
        background: active ? 'var(--fl-primary-container)' : 'var(--fl-surface-container-lowest)',
        border: active ? '1px solid transparent' : '1px solid var(--fl-outline-variant)',
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/modules/shared/fluid/ui/FluidButton.tsx apps/web/modules/shared/fluid/ui/GlassCard.tsx apps/web/modules/shared/fluid/ui/FluidBadge.tsx apps/web/modules/shared/fluid/ui/FluidChip.tsx
git commit -m "feat(fluid): add Button, GlassCard, Badge, Chip primitives"
```

---

## Task 6: Primitives batch B — Input, Select, PillTabs, MetricPill, Avatar, PageHeader, EmptyState

**Files:**
- Create each of: `FluidInput.tsx`, `FluidSelect.tsx`, `PillTabs.tsx`, `MetricPill.tsx`, `Avatar.tsx`, `PageHeader.tsx`, `EmptyState.tsx` under `apps/web/modules/shared/fluid/ui/`.

**Interfaces:**
- Consumes: `.fluid-root` tokens, `MSIcon`.
- Produces:
  - `<FluidInput value onChange placeholder? icon? type?>`
  - `<FluidSelect value onChange options={{label,value}[]}>`
  - `<PillTabs tabs={{id,label}[]} active onChange>`
  - `<MetricPill icon label value trend?>`
  - `<Avatar name src? size?>`
  - `<PageHeader title subtitle? actions?>`
  - `<EmptyState icon title message? action?>`

- [ ] **Step 1: FluidInput**

```tsx
// apps/web/modules/shared/fluid/ui/FluidInput.tsx
'use client';
import { useState } from 'react';
import { MSIcon } from './MSIcon';

export function FluidInput({
  value, onChange, placeholder, icon, type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: string;
  type?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%' }}>
      {icon ? (
        <span style={{ position: 'absolute', left: 14, display: 'flex', color: 'var(--fl-outline)' }}>
          <MSIcon name={icon} size={20} />
        </span>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: '100%', padding: icon ? '12px 16px 12px 44px' : '12px 16px',
          borderRadius: 'var(--fl-radius-input)', fontFamily: 'var(--fl-font-body)', fontSize: 15,
          color: 'var(--fl-on-surface)', background: 'var(--fl-surface-container-lowest)',
          border: `1px solid ${focus ? 'var(--fl-primary)' : 'var(--fl-outline-variant)'}`,
          boxShadow: focus ? '0 0 0 3px rgba(0,72,206,0.15)' : 'none',
          outline: 'none', transition: 'border-color .2s, box-shadow .2s',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: FluidSelect**

```tsx
// apps/web/modules/shared/fluid/ui/FluidSelect.tsx
'use client';
export function FluidSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '12px 16px', borderRadius: 'var(--fl-radius-input)',
        fontFamily: 'var(--fl-font-body)', fontSize: 15, color: 'var(--fl-on-surface)',
        background: 'var(--fl-surface-container-lowest)', border: '1px solid var(--fl-outline-variant)',
        outline: 'none', cursor: 'pointer',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
```

- [ ] **Step 3: PillTabs**

```tsx
// apps/web/modules/shared/fluid/ui/PillTabs.tsx
'use client';
export function PillTabs({
  tabs, active, onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'inline-flex', gap: 4, padding: 4,
      borderRadius: 'var(--fl-radius-pill)', background: 'var(--fl-surface-container)',
    }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '8px 18px', borderRadius: 'var(--fl-radius-pill)', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600,
              color: on ? 'var(--fl-on-primary)' : 'var(--fl-on-surface-variant)',
              background: on ? 'var(--fl-primary)' : 'transparent', transition: 'background .2s, color .2s',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: MetricPill**

```tsx
// apps/web/modules/shared/fluid/ui/MetricPill.tsx
import { MSIcon } from './MSIcon';

export function MetricPill({
  icon, label, value, trend,
}: {
  icon: string;
  label: string;
  value: string;
  trend?: string;
}) {
  return (
    <div className="glass-panel" style={{
      display: 'inline-flex', alignItems: 'center', gap: 14,
      padding: '12px 22px', borderRadius: 'var(--fl-radius-pill)',
    }}>
      <span style={{
        width: 40, height: 40, borderRadius: 'var(--fl-radius-pill)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'var(--fl-surface-container)',
        color: 'var(--fl-outline)',
      }}>
        <MSIcon name={icon} size={22} />
      </span>
      <div>
        <p style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 700, fontSize: 18, color: 'var(--fl-on-surface)' }}>{value}</p>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fl-on-surface-variant)' }}>{trend ?? label}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Avatar**

```tsx
// apps/web/modules/shared/fluid/ui/Avatar.tsx
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} style={{ borderRadius: 'var(--fl-radius-pill)', objectFit: 'cover' }} />;
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: 'var(--fl-radius-pill)', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', background: 'var(--fl-surface-container-high)',
      color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)',
      fontWeight: 700, fontSize: size * 0.36,
    }}>
      {initials(name)}
    </span>
  );
}
```

- [ ] **Step 6: PageHeader**

```tsx
// apps/web/modules/shared/fluid/ui/PageHeader.tsx
export function PageHeader({
  title, subtitle, actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 24 }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 40, letterSpacing: '-0.02em', color: 'var(--fl-on-surface)' }}>{title}</h2>
        {subtitle ? <p style={{ margin: '8px 0 0', fontFamily: 'var(--fl-font-body)', fontSize: 16, color: 'var(--fl-on-surface-variant)' }}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{actions}</div> : null}
    </div>
  );
}
```

- [ ] **Step 7: EmptyState**

```tsx
// apps/web/modules/shared/fluid/ui/EmptyState.tsx
import { MSIcon } from './MSIcon';

export function EmptyState({
  icon, title, message, action,
}: {
  icon: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 48, textAlign: 'center', color: 'var(--fl-on-surface-variant)' }}>
      <MSIcon name={icon} size={40} />
      <p style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 18, color: 'var(--fl-on-surface)' }}>{title}</p>
      {message ? <p style={{ margin: 0, fontSize: 14 }}>{message}</p> : null}
      {action}
    </div>
  );
}
```

- [ ] **Step 8: Type-check + commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/web/modules/shared/fluid/ui/FluidInput.tsx apps/web/modules/shared/fluid/ui/FluidSelect.tsx apps/web/modules/shared/fluid/ui/PillTabs.tsx apps/web/modules/shared/fluid/ui/MetricPill.tsx apps/web/modules/shared/fluid/ui/Avatar.tsx apps/web/modules/shared/fluid/ui/PageHeader.tsx apps/web/modules/shared/fluid/ui/EmptyState.tsx
git commit -m "feat(fluid): add input, select, tabs, metric, avatar, header, empty-state primitives"
```

---

## Task 7: FluidModal + FluidTable + barrel export

**Files:**
- Create: `apps/web/modules/shared/fluid/ui/FluidModal.tsx`
- Create: `apps/web/modules/shared/fluid/ui/FluidTable.tsx`
- Create: `apps/web/modules/shared/fluid/ui/index.ts`

**Interfaces:**
- Consumes: `.fluid-root` tokens, `MSIcon`.
- Produces:
  - `<FluidModal open onClose title subtitle?>children</FluidModal>`
  - `<FluidTable<T> columns rows rowKey onRowClick?>` where `columns: { key; header; render(row): ReactNode; width? }[]`.
  - barrel `index.ts` re-exporting every primitive + MSIcon.

- [ ] **Step 1: FluidModal**

```tsx
// apps/web/modules/shared/fluid/ui/FluidModal.tsx
'use client';
import { MSIcon } from './MSIcon';

export function FluidModal({
  open, onClose, title, subtitle, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,20,30,0.4)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 640, background: 'var(--fl-surface-container-lowest)',
        borderRadius: 'var(--fl-radius-card)', boxShadow: '0 24px 64px rgba(0,0,0,0.24)', overflow: 'hidden',
      }}>
        <div style={{ padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 24, color: 'var(--fl-on-surface)' }}>{title}</h3>
              {subtitle ? <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--fl-on-surface-variant)' }}>{subtitle}</p> : null}
            </div>
            <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 8, borderRadius: 'var(--fl-radius-pill)' }}>
              <MSIcon name="close" size={22} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: FluidTable**

```tsx
// apps/web/modules/shared/fluid/ui/FluidTable.tsx
'use client';

export interface FluidColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: number | string;
}

export function FluidTable<T>({
  columns, rows, rowKey, onRowClick,
}: {
  columns: FluidColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="glass-card" style={{ padding: 8, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--fl-font-body)' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{
                textAlign: 'left', padding: '14px 16px', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fl-outline)',
                width: c.width,
              }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background .2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--fl-surface-container-low)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map(c => (
                <td key={c.key} style={{ padding: '16px', fontSize: 14, color: 'var(--fl-on-surface)', borderTop: '1px solid var(--fl-outline-variant)' }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Barrel export**

```ts
// apps/web/modules/shared/fluid/ui/index.ts
export { MSIcon } from './MSIcon';
export { FluidButton } from './FluidButton';
export { GlassCard } from './GlassCard';
export { FluidBadge } from './FluidBadge';
export { FluidChip } from './FluidChip';
export { FluidInput } from './FluidInput';
export { FluidSelect } from './FluidSelect';
export { PillTabs } from './PillTabs';
export { MetricPill } from './MetricPill';
export { Avatar } from './Avatar';
export { PageHeader } from './PageHeader';
export { EmptyState } from './EmptyState';
export { FluidModal } from './FluidModal';
export { FluidTable, type FluidColumn } from './FluidTable';
```

- [ ] **Step 4: Type-check + commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/web/modules/shared/fluid/ui/FluidModal.tsx apps/web/modules/shared/fluid/ui/FluidTable.tsx apps/web/modules/shared/fluid/ui/index.ts
git commit -m "feat(fluid): add modal, table primitives and ui barrel"
```

---

## Task 8: FluidSidebar + FluidTopbar

**Files:**
- Create: `apps/web/modules/shared/fluid/shell/FluidSidebar.tsx`
- Create: `apps/web/modules/shared/fluid/shell/FluidTopbar.tsx`

**Interfaces:**
- Consumes: `buildNav`, `BASE_NAV`, `GROUP_LABEL` (Task 3); `useAuth` (`hasPermission`, `user`), `useModules` (`isEnabled`), `useTheme`; `useInstalledPlugins` (existing) for plugin nav surfaces; `MSIcon`, `Avatar`, `FluidInput`, `FluidButton`.
- Produces:
  - `<FluidSidebar />` — floating glass icon-rail, expands on hover, grouped RBAC-filtered nav, active-route highlight, user block at bottom.
  - `<FluidTopbar />` — search, quick-add, theme toggle, notifications, user menu.

- [ ] **Step 1: FluidSidebar**

```tsx
// apps/web/modules/shared/fluid/shell/FluidSidebar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useModules } from '@/modules/shared/contexts/modules';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { buildNav, type PluginNavItem } from '@/modules/shared/fluid/nav/filter-nav';
import { BASE_NAV, GROUP_LABEL } from '@/modules/shared/fluid/nav/nav-model';
import { MSIcon } from '@/modules/shared/fluid/ui';
import { Avatar } from '@/modules/shared/fluid/ui';

export function FluidSidebar() {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const { plugins } = useInstalledPlugins();

  // Map installed-plugin manifest nav surfaces to PluginNavItem[]. Manifests without
  // nav surfaces contribute nothing.
  const pluginNav: PluginNavItem[] = (plugins ?? []).flatMap(p =>
    (p.manifest?.surfaces?.nav ?? []).map(n => ({
      label: n.label, path: n.path, icon: n.icon, group: n.group,
    })),
  );

  const groups = buildNav(BASE_NAV, pluginNav, {
    hasPermission,
    isModuleEnabled: isEnabled,
    isAdmin: !!user?.isAdmin,
  });

  return (
    <nav
      className="glass-panel group"
      style={{
        position: 'fixed', top: 16, left: 16, bottom: 16, zIndex: 40,
        width: 72, borderRadius: 28, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'width .3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden',
      }}
      onMouseEnter={e => (e.currentTarget.style.width = '232px')}
      onMouseLeave={e => (e.currentTarget.style.width = '72px')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 16px' }}>
        <MSIcon name="cloud_done" size={26} style={{ color: 'var(--fl-primary)' }} />
        <span style={{ fontFamily: 'var(--fl-font-display)', fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap' }}>Vencore</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(g => (
          <div key={g.group}>
            <p style={{ margin: '0 0 4px', padding: '0 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fl-outline)', whiteSpace: 'nowrap' }}>
              {GROUP_LABEL[g.group]}
            </p>
            {g.items.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '10px', borderRadius: 'var(--fl-radius-pill)',
                    textDecoration: 'none', whiteSpace: 'nowrap', transition: 'background .2s',
                    color: active ? 'var(--fl-on-primary)' : 'var(--fl-on-surface-variant)',
                    background: active ? 'var(--fl-primary)' : 'transparent',
                    boxShadow: active ? 'var(--fl-shadow-primary)' : 'none',
                  }}
                >
                  <MSIcon name={item.icon} size={22} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--fl-glass-border)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px 4px' }}>
        <Avatar name={user?.name ?? '?'} size={32} />
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{user?.name ?? ''}</p>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--fl-outline)', whiteSpace: 'nowrap' }}>{user?.isAdmin ? 'Admin' : 'Member'}</p>
        </div>
      </div>
    </nav>
  );
}
```

Note: if `useInstalledPlugins` returns a different shape than `{ plugins: InstalledPlugin[] }` or manifests lack `surfaces.nav`, adjust the `pluginNav` mapping to the real shape (verify against `modules/shared/hooks/useInstalledPlugins.ts` — the interface is `InstalledPlugin` with a `manifest`); keep the `PluginNavItem[]` output identical so `buildNav` is unaffected.

- [ ] **Step 2: FluidTopbar**

```tsx
// apps/web/modules/shared/fluid/shell/FluidTopbar.tsx
'use client';
import { useState } from 'react';
import { useTheme } from '@/modules/shared/contexts/ThemeContext';
import { MSIcon, FluidInput, FluidButton } from '@/modules/shared/fluid/ui';

export function FluidTopbar() {
  const { theme, setTheme } = useTheme();
  const [q, setQ] = useState('');
  return (
    <header
      className="glass-panel"
      style={{
        position: 'fixed', top: 16, left: 104, right: 16, zIndex: 30, height: 56,
        borderRadius: 'var(--fl-radius-pill)', display: 'flex', alignItems: 'center',
        gap: 16, padding: '0 20px',
      }}
    >
      <div style={{ flex: 1, maxWidth: 420 }}>
        <FluidInput value={q} onChange={setQ} placeholder="Search…" icon="search" />
      </div>
      <div style={{ flex: 1 }} />
      <button
        aria-label="Toggle theme"
        onClick={() => { void setTheme(theme === 'dark' ? 'light' : 'dark'); }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 8 }}
      >
        <MSIcon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={22} />
      </button>
      <button aria-label="Notifications" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 8 }}>
        <MSIcon name="notifications" size={22} />
      </button>
      <FluidButton icon="add" onClick={() => { /* quick-add wired in spec 2 */ }}>New</FluidButton>
    </header>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS. If `InstalledPlugin`/manifest typing errors surface, reconcile the `pluginNav` mapping to the real `useInstalledPlugins` return type (see note in Step 1) until clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/shared/fluid/shell/FluidSidebar.tsx apps/web/modules/shared/fluid/shell/FluidTopbar.tsx
git commit -m "feat(fluid): add glass sidebar and topbar shell components"
```

---

## Task 9: FluidShell + (fluid) route group + smoke probe

**Files:**
- Create: `apps/web/modules/shared/fluid/shell/FluidShell.tsx`
- Create: `apps/web/app/(fluid)/layout.tsx`
- Create: `apps/web/app/(fluid)/_probe/page.tsx`

**Interfaces:**
- Consumes: `FluidSidebar`, `FluidTopbar` (Task 8); fonts (Task 1); primitives.
- Produces: `<FluidShell>children</FluidShell>` — applies font variables + `.fluid-root` + gradient body, mounts sidebar/topbar, offsets content. `(fluid)/layout.tsx` wraps route children in `FluidShell`. `_probe` renders primitives for visual verification.

- [ ] **Step 1: FluidShell**

```tsx
// apps/web/modules/shared/fluid/shell/FluidShell.tsx
'use client';
import { spaceGrotesk, inter, materialSymbols } from '@/modules/shared/fluid/fonts';
import { FluidSidebar } from './FluidSidebar';
import { FluidTopbar } from './FluidTopbar';
import '@/modules/shared/fluid/fluid.css';

export function FluidShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`fluid-root ${spaceGrotesk.variable} ${inter.variable} ${materialSymbols.variable}`}
      style={{ minHeight: '100vh', background: 'var(--fl-body-gradient)', backgroundAttachment: 'fixed' }}
    >
      <FluidSidebar />
      <FluidTopbar />
      <main style={{ paddingTop: 88, paddingLeft: 104, paddingRight: 24, paddingBottom: 48, minHeight: '100vh' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: (fluid) layout**

```tsx
// apps/web/app/(fluid)/layout.tsx
import { FluidShell } from '@/modules/shared/fluid/shell/FluidShell';

export default function FluidLayout({ children }: { children: React.ReactNode }) {
  return <FluidShell>{children}</FluidShell>;
}
```

Note: the root `app/layout.tsx` already mounts `Providers` + `AuthProvider` + `ThemeProvider` around all routes, so `(fluid)` inherits Auth/Theme/react-query. No provider duplication here.

- [ ] **Step 3: Smoke probe page**

```tsx
// apps/web/app/(fluid)/_probe/page.tsx
'use client';
import { useState } from 'react';
import {
  PageHeader, FluidButton, GlassCard, FluidBadge, FluidChip, MetricPill,
  FluidInput, PillTabs, Avatar, FluidModal, FluidTable, EmptyState,
} from '@/modules/shared/fluid/ui';

export default function ProbePage() {
  const [tab, setTab] = useState('a');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Fluid Probe" subtitle="Foundation smoke test" actions={<FluidButton icon="add" onClick={() => setOpen(true)}>Add</FluidButton>} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetricPill icon="account_balance_wallet" label="Revenue" value="$1,980,130" trend="+11% week" />
        <FluidBadge tone="blue">Active</FluidBadge>
        <FluidBadge tone="gold">Lead</FluidBadge>
        <FluidBadge tone="red">Churned</FluidBadge>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <FluidChip active>All</FluidChip><FluidChip>Active Deals</FluidChip><FluidChip>Leads</FluidChip>
      </div>
      <div style={{ maxWidth: 360, marginBottom: 24 }}><FluidInput value={q} onChange={setQ} placeholder="Find…" icon="search" /></div>
      <PillTabs tabs={[{ id: 'a', label: 'General' }, { id: 'b', label: 'Hooks' }]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 24 }}>
        <GlassCard>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Avatar name="Julianne Davis" /> Julianne Davis</div>
        </GlassCard>
      </div>
      <div style={{ marginTop: 24 }}>
        <FluidTable
          columns={[
            { key: 'name', header: 'Name', render: (r: { name: string; status: string }) => r.name },
            { key: 'status', header: 'Status', render: (r) => <FluidBadge tone="blue">{r.status}</FluidBadge> },
          ]}
          rows={[{ name: 'Julianne Davis', status: 'Active' }, { name: 'Marcus Thorne', status: 'Lead' }]}
          rowKey={r => r.name}
        />
      </div>
      <div style={{ marginTop: 24 }}><EmptyState icon="inbox" title="Nothing here" message="Empty-state sample" /></div>
      <FluidModal open={open} onClose={() => setOpen(false)} title="Add New Contact" subtitle="Sample modal">
        <FluidInput value="" onChange={() => {}} placeholder="Name" />
      </FluidModal>
    </>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Visual verification (light + dark)**

Start the app and open the probe page. Using the in-app preview/browser:
1. Navigate to `/_probe`.
2. Confirm: glass sidebar expands on hover with grouped nav; topbar search + theme toggle; pills, badges, table, modal render per `vencore_fluid/DESIGN.md` (24px cards, blue primary, Space Grotesk headings, Material Symbols glyphs visible — not tofu boxes).
3. Toggle theme (topbar button). Confirm dark palette applies (dark gradient bg, translucent dark surfaces, legible text) — this validates the `[data-theme="dark"] .fluid-root` overrides.
4. If Material Symbols show as boxed codepoints, re-check Task 1 Step 2 (font woff2) and the `--fluid-font-icon` variable is applied by FluidShell.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(fluid)" apps/web/modules/shared/fluid/shell/FluidShell.tsx
git commit -m "feat(fluid): add FluidShell, (fluid) route group, and smoke probe"
```

---

## Task 10: Host seams — widget bento, panel slot, hook-feature card

**Files:**
- Create: `apps/web/modules/shared/fluid/host/filter-widgets.ts`
- Create: `apps/web/modules/shared/fluid/host/filter-widgets.test.ts`
- Create: `apps/web/modules/shared/fluid/host/FluidWidgetCard.tsx`
- Create: `apps/web/modules/shared/fluid/host/FluidBentoGrid.tsx`
- Create: `apps/web/modules/shared/fluid/host/FluidPanelSlot.tsx`
- Create: `apps/web/modules/shared/fluid/host/HookFeatureCard.tsx`

**Interfaces:**
- Consumes: `getDashboardWidgets`, `DashboardWidgetDef`, `WidgetConfig` (existing `dashboard-registry`); existing `PluginPanelSlot`; `GlassCard`, `PillTabs`, `FluidBadge`, `FluidButton`, `MSIcon`.
- Produces:
  - `visibleWidgets(all, hasPermission, isModuleEnabled): DashboardWidgetDef[]`
  - `<FluidWidgetCard title>children`
  - `<FluidBentoGrid>` — renders permission/module-filtered core widgets in glass cards.
  - `<FluidPanelSlot recordType recordId>` — Fluid wrapper over existing plugin panel host.
  - `<HookFeatureCard feature moduleId onToggle>` — Fluid reskin of the hooks feature card (state badge + toggle).

- [ ] **Step 1: Write the failing widget-filter test**

```ts
// apps/web/modules/shared/fluid/host/filter-widgets.test.ts
import { describe, it, expect } from 'vitest';
import { visibleWidgets } from './filter-widgets';
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

const Noop = () => null;
const w = (over: Partial<DashboardWidgetDef>): DashboardWidgetDef => ({
  id: 'w', label: 'W', description: '', icon: 'x', category: 'sales',
  sizeOptions: ['medium'], defaultSize: 'medium', defaultW: 4, defaultH: 4,
  component: Noop, ...over,
});

describe('visibleWidgets', () => {
  it('keeps widgets with no permission and enabled module', () => {
    const all = [w({ id: 'a', module: 'crm' })];
    expect(visibleWidgets(all, () => true, () => true).map(x => x.id)).toEqual(['a']);
  });
  it('drops widgets whose permission is missing', () => {
    const all = [w({ id: 'a', permission: 'crm.read' })];
    expect(visibleWidgets(all, () => false, () => true)).toHaveLength(0);
  });
  it('drops widgets whose module is disabled', () => {
    const all = [w({ id: 'a', module: 'infra' })];
    expect(visibleWidgets(all, () => true, id => id !== 'infra')).toHaveLength(0);
  });
  it('keeps module-less widgets', () => {
    const all = [w({ id: 'a' })];
    expect(visibleWidgets(all, () => true, () => false)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run modules/shared/fluid/host/filter-widgets.test.ts`
Expected: FAIL — cannot find module `./filter-widgets`.

- [ ] **Step 3: Implement the filter**

```ts
// apps/web/modules/shared/fluid/host/filter-widgets.ts
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

export function visibleWidgets(
  all: DashboardWidgetDef[],
  hasPermission: (key: string) => boolean,
  isModuleEnabled: (id: string) => boolean,
): DashboardWidgetDef[] {
  return all.filter(w => {
    if (w.permission && !hasPermission(w.permission)) return false;
    if (w.module && !isModuleEnabled(w.module)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run modules/shared/fluid/host/filter-widgets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: FluidWidgetCard + FluidBentoGrid**

```tsx
// apps/web/modules/shared/fluid/host/FluidWidgetCard.tsx
import { GlassCard } from '@/modules/shared/fluid/ui';

export function FluidWidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard style={{ height: '100%' }}>
      <p style={{ margin: '0 0 12px', fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 16 }}>{title}</p>
      {children}
    </GlassCard>
  );
}
```

```tsx
// apps/web/modules/shared/fluid/host/FluidBentoGrid.tsx
'use client';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useModules } from '@/modules/shared/contexts/modules';
import { getDashboardWidgets } from '@/modules/shared/lib/dashboard-registry';
import { visibleWidgets } from './filter-widgets';
import { FluidWidgetCard } from './FluidWidgetCard';

export function FluidBentoGrid() {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const widgets = visibleWidgets(getDashboardWidgets(), hasPermission, isEnabled);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 24 }}>
      {widgets.map(w => {
        const Comp = w.component;
        return (
          <div key={w.id} style={{ gridColumn: `span ${Math.min(w.defaultW, 12)}` }}>
            <FluidWidgetCard title={w.label}>
              <Comp config={w.defaultConfig ?? {}} />
            </FluidWidgetCard>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: FluidPanelSlot (wrap existing plugin panel host)**

```tsx
// apps/web/modules/shared/fluid/host/FluidPanelSlot.tsx
'use client';
import { GlassCard } from '@/modules/shared/fluid/ui';
import { PluginPanelSlot } from '@/modules/shared/components/PluginPanelSlot';

// Renders plugin-contributed record panels (e.g. record_type "contact") inside Fluid
// glass chrome. Reuses the existing plugin panel host so plugin iframes/bridge are unchanged.
export function FluidPanelSlot({ recordType, recordId }: { recordType: string; recordId: string }) {
  return (
    <GlassCard>
      <PluginPanelSlot recordType={recordType} recordId={recordId} />
    </GlassCard>
  );
}
```

Note: verify `PluginPanelSlot`'s real prop names against `modules/shared/components/PluginPanelSlot.tsx`. If they differ (e.g. `record_type`/`record_id` or a single `context` object), adapt the pass-through props to match; keep `FluidPanelSlot`'s own props as `{ recordType, recordId }`.

- [ ] **Step 7: HookFeatureCard (Fluid reskin)**

```tsx
// apps/web/modules/shared/fluid/host/HookFeatureCard.tsx
'use client';
import { GlassCard, FluidBadge, FluidButton } from '@/modules/shared/fluid/ui';

// Mirrors the state model in modules/settings/components/HooksPage.tsx.
export type HookState = 'enabled' | 'available' | 'disabled' | 'provider_required' | 'unavailable';

export interface HookFeature {
  id: string;
  name: string;
  description: string;
  state: HookState;
  enabled: boolean;
}

const TONE: Record<HookState, 'green' | 'blue' | 'neutral' | 'gold' | 'red'> = {
  enabled: 'green', available: 'blue', disabled: 'neutral', provider_required: 'gold', unavailable: 'red',
};
const LABEL: Record<HookState, string> = {
  enabled: 'Enabled', available: 'Available', disabled: 'Disabled',
  provider_required: 'Provider Required', unavailable: 'Unavailable',
};

export function HookFeatureCard({
  feature, onToggle,
}: {
  feature: HookFeature;
  moduleId: string;
  onToggle: (next: boolean) => void;
}) {
  const canToggle = feature.state !== 'provider_required' && feature.state !== 'unavailable';
  return (
    <GlassCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 16 }}>{feature.name}</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>{feature.description}</p>
        </div>
        <FluidBadge tone={TONE[feature.state]}>{LABEL[feature.state]}</FluidBadge>
      </div>
      {canToggle ? (
        <div style={{ marginTop: 16 }}>
          <FluidButton variant={feature.enabled ? 'ghost' : 'primary'} onClick={() => onToggle(!feature.enabled)}>
            {feature.enabled ? 'Disable' : 'Enable'}
          </FluidButton>
        </div>
      ) : null}
    </GlassCard>
  );
}
```

- [ ] **Step 8: Type-check + commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS (reconcile `PluginPanelSlot` props per Step 6 note if it errors).

```bash
git add apps/web/modules/shared/fluid/host
git commit -m "feat(fluid): add widget bento, panel slot, and hook-feature host seams"
```

---

## Task 11: Fix plugin-docs naming (@vantage → @vencore)

**Files:**
- Modify: `plugin-docs/*.mdx`

**Interfaces:** none (docs only).

- [ ] **Step 1: Inspect scope**

Run: `grep -rl '@vantage' plugin-docs`
Expected: a list of `.mdx` files containing `@vantage`.

- [ ] **Step 2: Replace occurrences**

Run:
```bash
grep -rl '@vantage' plugin-docs | while read -r f; do
  sed -i 's/@vantage\//@vencore\//g; s/@vantage/@vencore/g' "$f"
done
grep -rn 'Vantage\|@vantage' plugin-docs || echo "no vantage refs remain"
```
Expected: no `@vantage` references remain. (Leave prose brand references only if they are intentional product names; the package identifiers `@vantage/*` must become `@vencore/*`. Manually review any remaining `Vantage` word-brand hits and fix package/SDK identifiers, keeping unrelated prose intact.)

- [ ] **Step 3: Verify docs still reference real packages**

Run: `grep -rn '@vencore/plugin' plugin-docs | head`
Expected: references now use `@vencore/plugin-types` / `@vencore/plugin-runtime` (or `@vencore/plugin-sdk` where the SDK helper package is meant).

- [ ] **Step 4: Commit**

```bash
git add plugin-docs
git commit -m "docs(plugin-sdk): correct package names @vantage -> @vencore"
```

---

## Task 12: Full verification + graphify update

**Files:** none (verification).

- [ ] **Step 1: Run all web tests**

Run: `cd apps/web && npx vitest run`
Expected: PASS — includes `settings-registry`, `filter-nav`, `filter-widgets` suites plus pre-existing web tests, all green.

- [ ] **Step 2: Type-check the whole web app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 3: Isolation check — nothing global changed**

Run:
```bash
git diff --name-only main...HEAD | grep -E 'app/globals.css|app/\(dashboard\)/' || echo "OK: no globals.css or (dashboard) changes"
```
Expected: `OK: no globals.css or (dashboard) changes`.

- [ ] **Step 4: Update graphify (per CLAUDE.md)**

Run: `/graphify . --update`
Expected: graph rebuilds; new `(fluid)` routes + `modules/shared/fluid/*` appear.

- [ ] **Step 5: Commit graphify output**

```bash
git add graphify-out
git commit -m "chore(graphify): update graph after fluid foundation"
```

---

## Self-Review notes (coverage vs Spec 1)

- §1 route group + shell → Tasks 8, 9. §2 tokens/fonts → Task 1. §3 primitives → Tasks 4–7.
  §4 RBAC integration → Task 3 (nav filter) + consumed by sidebar/bento. §5 settings-registry →
  Task 2. §6 widget host → Task 10 (bento + filter). §7 hook-feature host → Task 10
  (`HookFeatureCard`) + `FluidPanelSlot`. §8 theme → reused `ThemeContext`, applied in Task 9,
  toggled in Task 8. Rollout doc fix → Task 11. Graphify → Task 12.
- Deferred to consumers by design (spec 1 non-goals): actual settings entries, actual widget
  restyles, analytics-hook declaration, route migrations — none belong in Foundation.
- Verify-in-plan notes: `useInstalledPlugins` return shape (Task 8), `PluginPanelSlot` props
  (Task 10) — real signatures confirmed at implementation, mapping kept behind stable Fluid props.
```

- [ ] **Step 6: Confirm branch state**

Run: `git log --oneline main...HEAD`
Expected: one commit per task (~11 commits), all authored by Kavin-Charles, none on `main`.
