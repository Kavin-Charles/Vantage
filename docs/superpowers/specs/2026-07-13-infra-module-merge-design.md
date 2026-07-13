# Infrastructure Module Merge — Design

**Date:** 2026-07-13
**Branch:** `feat/infra-module` (off `origin/development`)
**Status:** Approved

## Goal

Merge the four infrastructure modules — `servers`, `databases`, `websites`, `alerts` — into a single `infra` module ("Infrastructure"), following the final CRM pattern: one parent module with per-page child modules (`infra:servers`, `infra:databases`, `infra:websites`, `infra:alerts`), each child gating its own sidebar entry, page, and API routes. Pages move under `/infra/*`. The parent/child machinery built for CRM is generalized so both modules share one code path.

## Decisions (user-confirmed)

| Question | Decision |
|---|---|
| Pattern | Straight to final CRM pattern: parent + children, per-page sidebar entries, sub-toggles behind chevron. No intermediate tabbed layout. |
| Routes | Pages move to `/infra/servers`, `/infra/databases`, `/infra/websites`, `/infra/alerts` with permanent redirects from old paths |
| Naming | id `infra`, display name "Infrastructure" |
| Alerts module | Included as fourth child (`infra:alerts`), page moves to `/infra/alerts` |
| Approach | Generalize CRM's parent/child machinery (generic gate, shared SubModule type, data-driven settings rendering) rather than copy it infra-specific |
| Base branch | `development` (CRM module merge already landed there) |

## Current state (on development)

- `packages/modules/src/{servers,databases,websites,alerts}` each export a `ModuleDefinition`:
  - `servers`: apiPrefixes `/servers /deployments /agent /ssh`; permissions include `servers:ssh`; emitsActivity, emitsAlerts.
  - `databases`: apiPrefixes `/databases`; emitsActivity, emitsAlerts.
  - `websites`: apiPrefixes `/websites`; worker `website-checker`.
  - `alerts`: apiPrefixes `/alerts /alert-thresholds`; worker `alert-eval`; permissions `alerts:view/acknowledge/resolve/configure`; emitsAlerts.
- CRM precedent (commits 7f3284b through 412cc9c): `CRM_MODULE` parent + `CRM_SUBMODULES` (`crm:pipeline` etc.), `createRequireCrmFeature` gate in `apps/api/src/middleware/module.ts` (parent AND child), child seeding in `seed-modules.ts`, upsert on module PATCH in `workspace-modules.ts`, chevron sub-toggle dropdown in the modules settings page.
- Sidebar layout is DB-driven (`workspace_sidebar_groups`, `user_sidebar_prefs`); item keys are nav hrefs; `BUILTIN_ITEM_KEYS` includes `/servers /databases /websites /alerts`.
- Web pages: `apps/web/app/(dashboard)/{servers/[id],databases/[id],websites,alerts}`. Feature code: `apps/web/modules/{servers,databases,alerts}`; websites is a self-contained page with no modules directory.
- Dashboard widgets `core:servers` and `core:alerts` exist and link to `/servers` and `/alerts`.

## Design

### 1. Module registry (`packages/modules`)

- Shared machinery in `packages/modules/src/types.ts`: a `SubModule` interface (`id`, `label`, `path`, `permission`, `legacyModuleId`). CRM's `CrmSubModule` is replaced by this shared type.
- New `packages/modules/src/infra/index.ts` exporting `INFRA_MODULE`:
  - `id: 'infra'`, `name: 'Infrastructure'`, `icon: 'Server'`, `defaultEnabled: true`.
  - `permissions`: union of the four modules' lists, **keys unchanged** (`servers:view`, `servers:ssh`, `databases:edit`, `websites:create`, `alerts:configure`, ...). No `user_permissions` data migration.
  - `nav`: four entries — Servers `/infra/servers` (icon Server), Databases `/infra/databases` (Database), Websites `/infra/websites` (Globe), Alerts `/infra/alerts` (Bell).
  - `apiPrefixes`: `/servers /deployments /agent /ssh /databases /websites /alerts /alert-thresholds`.
  - `workers: ['website-checker', 'alert-eval']`, `emitsActivity: true`, `emitsAlerts: true`.
- `INFRA_SUBMODULES`: `infra:servers` (permission `servers:view`, legacy `servers`), `infra:databases` (`databases:view`, `databases`), `infra:websites` (`websites:view`, `websites`), `infra:alerts` (`alerts:view`, `alerts`).
- Remove `servers/`, `databases/`, `websites/`, `alerts/` directories from `packages/modules/src`; `MODULE_REGISTRY` lists `INFRA_MODULE` in their place. `MODULE_IDS` shrinks accordingly.
- `getModuleForPermission('servers:view')` now returns `'infra'`; permission checks keep working because keys are unchanged.

### 2. DB migration (`packages/db/migrations`, one new file)

- `workspace_modules`, per workspace:
  - Insert parent row `module_id = 'infra'` with `enabled = OR` over the four old rows (a missing row counts as that module's `defaultEnabled`, which is `true` for all four).
  - Why OR, not AND like the CRM merge: the CRM merge first collapsed four toggles into one, so AND was the conservative choice. Here we go straight to parent + children. Children carry each old module's exact enabled state, so the parent must be on if *any* old module was on — otherwise a workspace with only `servers` enabled would lose access. The gate is parent AND child, so previously-disabled pages stay disabled via their child row.
  - Insert child rows `infra:servers`, `infra:databases`, `infra:websites`, `infra:alerts`, each `enabled` copied from the corresponding old module row (missing row = `defaultEnabled`).
  - Delete the four old rows.
- `workspace_sidebar_groups.item_keys` and `user_sidebar_prefs` pinned keys: rewrite in place, 1:1 — `/servers → /infra/servers`, `/databases → /infra/databases`, `/websites → /infra/websites`, `/alerts → /infra/alerts`. No collapse or dedupe needed (unlike CRM, where four keys became one).
- No table shape changes. Never modify existing migration files.

### 3. API (`apps/api`)

- Route files unchanged (`routes/servers.ts`, `routes/databases.ts`, `routes/websites.ts`, `routes/alerts.ts`, ...). Module middleware resolves prefixes via the registry, so `/databases`, `/agent`, etc. map to `infra` automatically.
- **Gate generalization:** `createRequireCrmFeature` in `apps/api/src/middleware/module.ts` becomes `createRequireModuleFeature(db)` returning `requireModuleFeature(parentId, childId)` — request passes only when BOTH parent and child modules are enabled. CRM call sites in `apps/api/src/index.ts` are refactored onto it. Infra routes wired: `/servers /deployments /agent /ssh` → (`infra`, `infra:servers`); `/databases` → (`infra`, `infra:databases`); `/websites` → (`infra`, `infra:websites`); `/alerts /alert-thresholds` → (`infra`, `infra:alerts`).
- **`/agent` heartbeat consequence:** agent pings return 403 when `infra` or `infra:servers` is disabled — identical effective behavior to the old `servers` toggle, just derived from two rows. No special-casing.
- `apps/api/src/lib/sidebar-layout.ts`: `BUILTIN_ITEM_KEYS` — remove `/servers /databases /websites /alerts`, add `/infra/servers /infra/databases /infra/websites /infra/alerts`. Seed "Infrastructure" group uses the new keys.
- **Child seeding + toggle PATCH:** `seed-modules.ts` seeds children for any registry parent with submodules (data-driven, covers CRM and Infra from one path); `workspace-modules.ts` PATCH upsert extends its allowed-id set from the registry instead of a CRM-only list.
- Update affected tests: `workspace-modules.test.ts`, `sidebar-layout.test.ts`, new migration test. The every-module-has-permission regression check picks up `infra` automatically.

### 4. Web routes (`apps/web/app/(dashboard)`)

- Move page directories under `infra/`: `infra/servers` (with `[id]`), `infra/databases` (with `[id]`), `infra/websites`, `infra/alerts`. Dynamic segments preserved.
- `infra/page.tsx`: server-side `redirect('/infra/servers')` only (matches `/crm → /crm/pipeline` precedent).
- Shared `infra/layout.tsx`: thin — module guard for the `infra` parent only (children guard per page). No tab bar; sidebar carries the per-page entries.
- `next.config.ts` permanent redirects: `/servers → /infra/servers`, `/servers/:id → /infra/servers/:id`, `/databases → /infra/databases`, `/databases/:id → /infra/databases/:id`, `/websites → /infra/websites`, `/alerts → /infra/alerts`.

### 5. Web code move (`apps/web/modules`)

- Move `apps/web/modules/{servers,databases,alerts}` to `apps/web/modules/infra/{servers,databases,alerts}`. Websites has no modules directory — its page stays self-contained and moves per section 4.
- Update import paths (`@/modules/infra/servers/...`). No logic rewrites.
- `ModuleGuard` / `useModules().isEnabled` checks for `servers`, `databases`, `websites`, `alerts` become parent+child checks (`infra` + `infra:servers` etc.), using the same helper pattern the CRM pages use.
- Internal `<Link>` hrefs pointing at old paths updated to `/infra/*`. Notable: the infra alert bar component and `AlertsWidget` link to `/alerts` → `/infra/alerts`; `ServersWidget` link → `/infra/servers`.
- `ServerMetricsContext` lives in `modules/shared/` — not moved; logic untouched.

### 6. Settings UI

- Modules settings page: single "Infrastructure" toggle with the chevron dropdown revealing four sub-toggles — the same component CRM uses. Rendering generalized: any registry module with submodules gets the chevron treatment, data-driven, no infra-specific JSX.
- Permission management: one Infrastructure section containing all granular keys, rendered automatically from the registry (labels already name their sub-area).

### 7. Dashboard widgets

- No new widgets. Existing `core:servers` and `core:alerts` keep their ids; only their links and import paths change per section 5.

### 8. Testing

- API (vitest): migration helpers — OR-derivation for the parent toggle, child state copy, 1:1 sidebar key rewrite; module middleware resolving `infra` for `/databases`, `/agent`, `/websites`; generic `requireModuleFeature` parent-AND-child cases; seeding includes infra children.
- Web: no component-test harness — verify via preview tools: four sidebar entries render, old URLs redirect, disabling a sub-toggle hides its entry and 403s its API prefixes, disabling the parent kills all four, alert bar and dashboard widgets still work, agent ping succeeds with module enabled.

## Out of scope

- Permission key renames — keys stay as-is.
- API URL changes — all endpoint paths unchanged.
- `analytics`, `activity`, `messaging`, `projects`, `dashboard` modules — untouched.
- Any new infrastructure features beyond the merge itself.
