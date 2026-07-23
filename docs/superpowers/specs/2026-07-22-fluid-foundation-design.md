# Vencore Fluid — Spec 1: Foundation

**Date:** 2026-07-22
**Status:** Draft (awaiting review)
**Part:** 1 of 3 — Foundation → CRM (spec 2) → Settings (spec 3)

## Context

The Vencore web app (`apps/web`) is a modular, multi-tenant platform. Its UI is being
redesigned to a new design language, **Vencore Fluid** (glassmorphism, bento grid,
Space Grotesk + Inter, blue-primary on a radial gradient), starting with the CRM module
and the Settings module. The redesign replaces the *presentation layer only* — the data
layer (RTK, react-query, `@vencore/api-client`), auth, routing, and the plugin/module
runtime are reused. New API endpoints are added where the new design needs data the
current API lacks; the old design must not cap new features.

This spec covers the **shared Foundation** that specs 2 (CRM) and 3 (Settings) build on.
Foundation ships **no user-facing screens of its own** — it is scaffolding, tokens,
primitives, and host integration seams. It is validated by being consumed in spec 2.

### Decisions already made (brainstorming)

- **Approach A** — greenfield Fluid UI, reuse existing data/logic layer.
- **Icons** — Material Symbols Outlined (matches mockups).
- **Themes** — light **and** dark (mockups are light; dark palette is designed here).
- **Isolation** — new `app/(fluid)` route group; the existing `(dashboard)` shell and
  the 9 non-redesigned modules are untouched.
- **3 specs** — Foundation, CRM, Settings.

### Cross-cutting requirements (apply to all 3 specs)

1. **RBAC** — every nav item, screen, and action is gated by `useAuth().hasPermission(key)` /
   `isAdmin` / module-enabled state.
2. **Settings entry for every feature (highest priority)** — every feature is customizable
   from Settings. Achieved via a settings-surface registry that first-party modules use the
   same way plugins use `settings_schema`.
3. **Dashboard widgets** — the Fluid dashboard bento is driven by the existing widget
   registry (`registerDashboardWidget`) plus plugin-contributed widgets.
4. **Analytics hook** — analytics capabilities are exposed through the Settings hook-feature
   system so CRM/dashboard can enable them per workspace.

## Existing architecture (what we reuse)

- **Shell today:** `app/(dashboard)/layout.tsx` renders `<Sidebar />` + providers
  (`AuthProvider`, `ModuleProvider`, `ServerMetricsProvider`, `ToastProvider`, react-query).
- **Design tokens today:** CSS variables in `app/globals.css` (Tailwind v4, `@import "tailwindcss"`).
  Note: `globals.css` has already drifted from the `CLAUDE.md` design section (IBM Plex, cool
  ink-blue) — treat `globals.css`, not `CLAUDE.md`, as the current source of truth.
- **RBAC:** `modules/shared/lib/AuthContext.tsx` → `useAuth()` exposes
  `hasPermission(key: string)`, `user.permissions[]`, `isAdmin`.
- **Widget registry:** `modules/shared/lib/dashboard-registry.ts` →
  `registerDashboardWidget(def)`, `getDashboardWidgets()`. `DashboardWidgetDef` already has a
  `permission?` field. Core widgets live per module (e.g. `ContactsWidget`, `PipelineWidget`).
- **Plugin/module runtime:**
  - `@vencore/plugin-types` — `PluginManifest` and surface/permission/settings types.
  - `@vencore/plugin-runtime` — host runtime + postMessage bridge.
  - `modules/shared/contexts/PluginRuntimeContext.tsx`, `contexts/modules.tsx`,
    `hooks/useInstalledPlugins.ts`.
  - Host renderers: `components/PluginWidgetGrid.tsx`, `components/PluginPanelSlot.tsx`,
    `app/plugins/frame/[pluginId]`.
  - **Modules are first-party plugins** bundled at install; they contribute UI via the same
    surface model (nav / pages / widgets / panels / settings_schema).
- **Hook-features (dynamic capability toggles):** `modules/settings/components/HooksPage.tsx`
  over `GET/PATCH /api/settings/hooks/:moduleId/:featureId`. A feature declared for a module
  can be powered by a provider from another module/plugin; state is one of
  `enabled | available | disabled | provider_required | unavailable`. This is the "dynamic
  hooks" surface — features appear when a plugin/module declares them, not hardcoded.

> **Naming drift:** `plugin-docs/*.mdx` use `@vantage/*` package names (upstream template).
> The real packages are `@vencore/plugin-types` and `@vencore/plugin-runtime`. Use the
> `@vencore` names; the docs' *contracts* (manifest, surfaces, bridge, settings_schema) are
> still accurate.

## Goals

- A `(fluid)` route group with a `FluidShell` host that renders first-party module screens
  **and** iframe plugin surfaces, styled in the Fluid design language, light + dark.
- A scoped Fluid token layer and a set of Fluid primitives, both theme-aware.
- Integration seams so RBAC, settings-registration, dashboard widgets, and hook-features all
  flow through existing/plugin-aligned mechanisms rather than bespoke code.

## Non-goals (this spec)

- No CRM screens (spec 2). No Settings screens (spec 3).
- No route moves of existing pages yet — Foundation is additive only.
- No changes to `(dashboard)`, `globals.css`, or the 9 non-redesigned modules.
- No new plugin SDK surface types unless a gap is proven in spec 2/3 (kept as open question).

## Design

### 1. Route group and shell host

```
app/(fluid)/
  layout.tsx        # FluidShell host (client) — wraps existing providers
modules/shared/fluid/
  shell/
    FluidShell.tsx
    FluidSidebar.tsx     # floating glass icon-rail, expands on hover (Material Symbols)
    FluidTopbar.tsx      # search, quick-add, theme toggle, user menu
    FluidNav.ts          # nav model: static items + plugin nav surfaces, RBAC-filtered
    # theme: REUSE existing modules/shared/contexts/ThemeContext.tsx (useTheme); no new provider
  fluid.css              # scoped token layer (see §2)
  ui/                    # primitives (see §3)
  settings-registry.ts   # settings-surface registry (see §5)
  host/
    FluidBentoGrid.tsx   # dashboard widget host (core + plugin widgets)
    FluidWidgetCard.tsx  # glass chrome around any widget component
    FluidPanelSlot.tsx   # record-panel host (wraps existing PluginPanelSlot)
    HookFeatureCard.tsx  # Fluid reskin of HooksPage FeatureCard
```

- `FluidShell` re-uses the **same providers** as `(dashboard)/layout.tsx` (Auth, Module,
  ServerMetrics, Toast, react-query, PluginRuntime). Route groups don't change URLs, so
  moving a route under `(fluid)` in spec 2/3 keeps its path.
- **Nav model** (`FluidNav`): a base list of Fluid-enabled destinations, merged with plugin
  `nav` surfaces (`PluginNavItem`, `group: crm | infra | general`), then filtered by
  `hasPermission` / `isAdmin` / module-enabled. The sidebar renders only what the user may see.
- **Shell is a host, not a hardcoded frame:** any plugin nav item, page, widget, or panel that
  the runtime exposes is rendered through the shell's host components, styled with Fluid chrome.

### 2. Token layer (`fluid.css`)

- Scoped under a `.fluid-root` class applied by `FluidShell` — **not** global. `globals.css` and
  `(dashboard)` are unaffected.
- Tokens sourced from `vencore_fluid/DESIGN.md`: primary `#0048ce`, secondary gold `#f3e34c`,
  glass surfaces (`rgba(255,255,255,0.4)` + `backdrop-filter: blur(16px)`), radial-gradient
  body, Space Grotesk (display/headline) + Inter (body/label), 24px card radius, pill radii,
  12px input radius, luminous shadows.
- **Dark theme** (designed here, no mockup): dark radial-gradient body, translucent dark
  surfaces (`rgba(20,22,28,0.5)` class of values), inverted on-surface ladder, adjusted glass
  border/opacity for legibility. Selected via `data-theme="dark"` on `.fluid-root`.
- Fonts loaded via `next/font/google` (self-hosted at build, CSP-safe) — matching the existing
  `app/layout.tsx` pattern (IBM Plex). Add Space Grotesk + Inter; deliver Material Symbols
  Outlined self-hosted (next/font or bundled woff2). **No CDN.**

### 3. Primitives (`modules/shared/fluid/ui/`)

Fresh, theme-aware, render-tested. Do not modify existing `shared/components/ui/*`.

`FluidButton` (pill, primary/ghost), `GlassCard`, `FluidBadge`, `FluidChip`, `PillTabs`,
`FluidInput`, `FluidSelect`, `FluidModal`, `MetricPill`, `Avatar`, `MSIcon` (Material Symbols
wrapper mapping design icon names), `PageHeader`, `EmptyState`, `FluidTable` (glass row-hover).

Each primitive: props typed (no `any`), light + dark verified, unit/render test.

### 4. RBAC integration

- No new permission system. Consume `useAuth().hasPermission`, `isAdmin`, `user.permissions`.
- `FluidNav` filters nav by permission/module state.
- A small helper `usePermission(key)` / `<RequirePermission>` guard wraps actions and routes so
  spec 2/3 gate consistently. Server-side authorization is unchanged (API already enforces it);
  UI gating is defense-in-depth + affordance-hiding.

### 5. Settings-surface registry (enables "every feature customizable")

Mirror the widget registry, aligned with the plugin `settings_schema` surface so first-party
and plugin settings render through one path.

```ts
// modules/shared/fluid/settings-registry.ts
type SettingsScope = 'personal' | 'workspace';
interface SettingsEntryDef {
  id: string;
  scope: SettingsScope;
  label: string;
  icon: string;                 // Material Symbols name
  order?: number;
  permission?: string;          // RBAC gate
  adminOnly?: boolean;          // workspace-scope admin gate
  component: ComponentType;     // first-party panel
  // plugin/module entries resolve to a settings_schema-driven renderer instead
}
registerSettingsEntry(def): void;
getSettingsEntries(scope): SettingsEntryDef[];
```

- The Settings shell (spec 3) renders its nav from `getSettingsEntries`, RBAC/admin-filtered.
- **Modules and plugins** already contribute settings data-driven via `settings_schema` →
  `GET /api/settings/domain` (`ContributedSection`, rendered today by `PluginSettingsSections.tsx`).
  The Fluid settings shell reskins that same data path. **First-party features** (profile,
  workspace, etc.) are currently hardcoded React pages with no schema — they register a
  `component` entry in this registry. Either way, "every feature has a Settings entry" is
  structural, not per-feature bespoke wiring.
- Foundation ships the registry + the generic schema-driven settings panel + the empty Settings
  nav scaffold. Actual entries are registered by their owning module in spec 2/3.

### 6. Dashboard widget host

- `FluidBentoGrid` renders from `getDashboardWidgets()` (core) + plugin widget surfaces
  (`PluginWidgetGrid` / iframe), each wrapped in `FluidWidgetCard` glass chrome.
- Respects `DashboardWidgetDef.permission` and module-enabled state.
- Layout/persistence reuses the existing `react-grid-layout` + dashboard config; Foundation only
  restyles the container and card chrome. Individual widget internals are restyled in their
  module's spec.

### 7. Hook-feature host + analytics hook

- `HookFeatureCard` is a Fluid reskin of the existing `HooksPage` `FeatureCard`, backed by the
  same `GET/PATCH /api/settings/hooks/:moduleId/:featureId` contract and state model.
- Spec 3 uses it to render the dynamic **Hooks** tab on each module/plugin settings page.
- **Analytics hook**: analytics capabilities are exposed as hook-features so CRM/dashboard can
  enable them per workspace. Foundation defines the card + contract; the analytics-hook
  *declaration* lands in its consumer spec (likely spec 2/3 or a follow-up), not here.

### 8. Theme system

- **Reuse the existing** `modules/shared/contexts/ThemeContext.tsx` — `useTheme()` returns
  `{ theme: 'light' | 'dark', setTheme }`, persists via `PATCH /api/me { theme }` + localStorage,
  seeds from `user.theme`, and is hydration-safe. No new theme provider.
- `FluidShell` applies `data-theme={theme}` to `.fluid-root` from `useTheme()`; `FluidTopbar`
  toggle calls `setTheme`. `ThemeProvider` must be mounted above `(fluid)` (it already wraps the
  app in the root layout — verify in plan).

## Data flow

`FluidShell` → providers (Auth/Module/PluginRuntime/RQ) → `FluidSidebar`/`FluidTopbar` read
nav model (static + plugin surfaces, RBAC-filtered) → children route content. Host components
(`FluidBentoGrid`, `FluidPanelSlot`, `HookFeatureCard`) pull from existing registries/APIs and
the plugin bridge. No new global state; no changes to existing stores.

## Error handling

- Missing/failed plugin iframe surface → host renders a Fluid error/empty card, never crashes
  the shell (reuse existing PluginRuntime error boundaries).
- Permission denied → element hidden (nav) or replaced with an inline notice (route guard).
- Theme/preferences fetch failure → fall back to system theme.

## Testing

- **Primitives:** render tests, light + dark snapshot/visual check against DESIGN.md.
- **Shell:** nav RBAC filtering unit tests (permission/admin/module matrices); plugin-nav merge
  test with a fake plugin surface.
- **Registries:** settings-registry register/get/order/RBAC-filter tests.
- **Hosts:** `FluidBentoGrid` respects `permission`; `HookFeatureCard` PATCH round-trip
  (mocked API) matches existing state model.
- **Isolation guard:** a test/assertion that `(dashboard)` and `globals.css` are unchanged
  (no imports of `fluid.css` outside `(fluid)`).

## Rollout / cleanup

- Foundation is purely additive — nothing is deleted. Old shell/components are removed only in
  spec 2/3 as each screen migrates.
- **Doc fix:** rename `@vantage/*` → `@vencore/*` across `plugin-docs/*.mdx` (Q5). Small,
  self-contained; include in this spec's implementation.
- After merge, run `Update Graphify` (per `CLAUDE.md`) since new cross-file relationships are added.

## Resolved questions

1. **Material Symbols delivery** — self-host via `next/font/google` (matches existing IBM Plex
   pattern). No CDN. See §2.
2. **Theme persistence** — reuse existing `ThemeContext` (`useTheme`, `PATCH /api/me { theme }`).
   No new provider. See §8.
3. **First-party settings registration** — plugins/modules already use `settings_schema` →
   `/api/settings/domain`; first-party pages are hardcoded and need the `component` registry
   path. Registry (§5) confirmed necessary.
4. **Analytics-hook home** — **spec 2 (CRM)** formally declares the analytics hook-feature.
   Foundation only ships the `HookFeatureCard` + contract.
5. **SDK doc naming** — **fix** `@vantage`→`@vencore` across `plugin-docs/*.mdx` as part of this
   work (see Rollout).

## Next

On approval: spec 2 (CRM) — consumes this Foundation, migrates CRM routes into `(fluid)`, builds
contacts/companies/pipeline/tasks/contact-detail screens, adds CRM APIs (contact-detail
aggregate, engagement fields), registers CRM settings entries + widgets. Then spec 3 (Settings).
