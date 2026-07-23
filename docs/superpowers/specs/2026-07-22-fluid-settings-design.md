# Vencore Fluid — Spec 3: Settings

**Date:** 2026-07-22
**Status:** Draft (awaiting review)
**Part:** 3 of 3 — Foundation (spec 1) → CRM (spec 2) → **Settings**
**Depends on:** Spec 1 (Foundation) — settings-registry, `HookFeatureCard`, FluidShell, primitives.
Consumes CRM settings entries + analytics hook declared in spec 2.

## Context

Rebuild the Settings module in **Vencore Fluid**, and reorganize it into two top-level scopes —
**Personal** (all users) and **Workspace** (admin) — driven by Foundation's settings-registry so
every feature is customizable through one structure (cross-cutting req #2, highest priority).
Most pages already exist and are **reskinned + re-nav'd**; a few need new backend
(2FA, change-password, plugin marketplace). Modules and plugins get a **uniform settings page**
with a **General** tab and a **dynamic Hooks** tab.

## Existing to reuse

- **Routes (web):** `app/(dashboard)/settings/*` — profile, preferences, appearance, security,
  workspace, `(users-roles)/users`, `(users-roles)/roles`, modules, plugins, api-keys, updates,
  about, pipelines, messaging, integrations, notifications, etc.
- **Components:** `modules/settings/components/*` — `RoleMatrixEditor`, `RoleInheritancePanel`,
  `RoleMembersPanel`, `ConstraintSetEditor`, `PermissionRow`, `EffectivePermissionsView`,
  `ApiKeyTable`, `CreateApiKeyModal`, `InviteUserModal`, `UserRoleAssignment`, `HooksPage`,
  `PluginSettingsSections`, `DataProvidersSection`, `HooksPage`.
- **API:** `routes/roles.ts`, `user-roles.ts`, `session-roles.ts`, `plugins.ts` (`/api/plugins`
  installed), `api-keys`, `/api/settings/domain` (plugin settings_schema), `/api/settings/hooks/
  :moduleId/:featureId` (hook-features), `/api/me` (profile/theme), `lib/update-check.ts`.
- **Module list:** `settings/modules/page.tsx` — hardcoded modules with per-module `settingsHref`
  and submodules. To be generalized.

## Gap analysis

| Section | Design ask | Exists? | Action |
|---|---|---|---|
| Profile | Username, Role, UUID, PFP | `/api/me`, profile page | Reskin; add avatar (PFP) if not present |
| Preferences | Dark/Light, **default landing page** | theme via ThemeContext; appearance page | Reskin; **add `default_landing_page`** pref |
| Security | account details, **change password**, **2FA** | none found | **NEW backend**: change-password, TOTP 2FA + recovery codes |
| Workspace | name, domain, **color palette / white-label** | workspace settings + white-label branding exists | Reskin; expose palette/white-label editor |
| Users | list + add user | users page + `InviteUserModal` | Reskin |
| Roles | list, create role, assign permissions | roles API + editors | Reskin |
| Modules | list + settings icon → module page | `settings/modules` ad-hoc hrefs | **Generalize** to uniform module page (General + Hooks) |
| Plugins | installed **+ marketplace available** | `/api/plugins` installed only | **NEW**: marketplace/available-plugins endpoint |
| API Key | create Vencore API key | api-keys page + `ApiKeyTable` | Reskin |
| Updates | changelog + update instance | `lib/update-check.ts` | Reskin |
| About | about Vencore | about page | Reskin |
| Module/Plugin page | General + **dynamic Hooks** | `HooksPage` + `/api/settings/hooks` | Generalize + reskin with `HookFeatureCard` |

## Design (web)

### Routing & nav

Move settings into `app/(fluid)/settings/*` (URLs unchanged). The settings shell renders a
two-scope nav from Foundation's `getSettingsEntries('personal'|'workspace')`, RBAC/admin-filtered:

```
app/(fluid)/settings/
  layout.tsx                 # settings sub-shell: scope nav (Personal/Workspace) from registry
  page.tsx                   # landing → first permitted entry
  profile/page.tsx
  preferences/page.tsx
  security/page.tsx
  workspace/page.tsx
  users/page.tsx  users/[id]/page.tsx
  roles/page.tsx  roles/[id]/page.tsx
  modules/page.tsx           # module + plugin list (toggleable)
  modules/[moduleId]/page.tsx  # uniform General + Hooks tabs (also serves plugins)
  plugins/page.tsx           # installed + marketplace
  api-keys/page.tsx
  updates/page.tsx
  about/page.tsx
```

- **Registry-driven:** each section registers a `SettingsEntryDef` (scope, permission/adminOnly,
  icon, component). Personal entries: Profile, Preferences, Security. Workspace entries
  (adminOnly): Workspace, Users, Roles, Modules, Plugins, API Key, Updates, About. CRM's
  registered entries (spec 2) appear automatically. Plugin `settings_schema` sections render via
  the schema-driven panel (existing `/api/settings/domain`).
- Non-admin users see only Personal + any non-admin entries; Workspace scope hidden.

### Personal

- **Profile** — avatar (PFP upload), username/name, email, role (read-only badge), workspace UUID
  (copyable). PATCH `/api/me`.
- **Preferences** — theme toggle (reuse `useTheme`), **default landing page** selector (new pref
  stored on user; drives post-login redirect), density/other UI prefs. Reuse existing appearance
  logic.
- **Security** — account details; **change password** (current + new, validated); **2FA**
  (TOTP): enroll (QR + secret), verify, disable, recovery codes. Session/device list if cheap.

### Workspace (admin)

- **Workspace** — name, domain, **color palette** + **white-label** (logo, brand name, accent);
  ties into existing per-workspace branding. Live preview in Fluid.
- **Users** — `FluidTable` of users, invite (`InviteUserModal` reskin), role assignment.
- **Roles** — role list, create role, permission matrix (`RoleMatrixEditor` reskin),
  inheritance/constraints. RBAC keys come from the permission registry.
- **Modules** — list of first-party modules (toggleable enabled/disabled), each row a settings
  gear → `modules/[moduleId]` uniform page. Modules are first-party plugins.
- **Plugins** — **installed** (from `/api/plugins`, toggle/uninstall) **+ marketplace**
  available (new endpoint), install flow. Each installed plugin's gear → same
  `modules/[moduleId]` uniform page (plugin id).
- **API Key** — `ApiKeyTable` + `CreateApiKeyModal` reskin; create Vencore API key.
- **Updates** — changelog + "update instance" action via `update-check.ts`.
- **About** — Fluid about page.

### Uniform module/plugin settings page (`modules/[moduleId]`)

Two `PillTabs`:

1. **General** — self-explanatory settings for the module/plugin. First-party: the module's
   registered `component`. Plugins: schema-driven from `settings_schema` (`/api/settings/domain`).
2. **Hooks** — **dynamic** capability features for this module, from
   `GET /api/settings/hooks/:moduleId`, each rendered with Foundation's `HookFeatureCard`.
   Features appear only when a module/plugin **declares** a hook feature for this module (not
   hardcoded) — e.g. the **analytics hook** declared in spec 2 shows on CRM's Hooks tab. Provider
   selection / enable-disable via the existing `PATCH /api/settings/hooks/:moduleId/:featureId`.

The page is identical for modules and plugins (toggleable in the list); only the data source of
the General tab differs.

## Schema & API changes (new)

1. **`users.default_landing_page`** `text null` — post-login redirect target (validated against
   permitted routes).
2. **Change password** — `POST /api/me/password` `{ current, next }`; bcrypt verify + rehash;
   rate-limited; audit log.
3. **2FA (TOTP)** — `users.totp_secret` (encrypted), `users.totp_enabled bool`,
   `user_recovery_codes` table. Endpoints: `POST /api/me/2fa/enroll` (returns provisioning
   URI/secret), `POST /api/me/2fa/verify` (confirm + enable, returns recovery codes),
   `POST /api/me/2fa/disable`. Login flow gains a TOTP challenge step.
4. **Plugin marketplace** — `GET /api/marketplace/plugins` (available to install) +
   install/uninstall wiring. Source = license/registry service (see `license-check.ts`). Confirm
   upstream registry in plan; may be a proxied catalog.
5. **PFP/avatar** — `users.avatar_url` if absent; upload via existing R2 storage path.

All: Zod-validated, `{data,error}` envelope, `requireWorkspace`/auth-scoped, TDD (tests first).
Secrets (TOTP) encrypted at rest using existing key infra; never logged.

## RBAC (cross-cutting req #1)

- Personal scope: any authenticated user. Workspace scope: `isAdmin` / specific admin
  permissions per section (e.g. `settings.roles.write`, `settings.users.write`).
- The registry filters nav; route guards (`RequirePermission`) protect direct navigation.
- Server routes enforce authorization independently.

## Security note (2FA — sensitive)

2FA/TOTP and change-password are security-sensitive. TOTP secrets and recovery codes must be
encrypted at rest, never returned after enrollment except once, and never logged. Change-password
must verify the current password and invalidate other sessions. These endpoints get dedicated,
first-written tests and a **mandatory security review before merge**. Decision: 2FA is built
**within this spec** (not split out); the login-flow TOTP challenge change is the highest-risk
piece and lands behind tests + review.

## Error handling

- Registry entry component error → isolated error card, rest of settings still navigable.
- Hook feature in `provider_required`/`unavailable` state → rendered read-only with guidance
  (existing state model).
- Marketplace fetch failure → show installed only + retry.
- 2FA verify failure → clear error, no partial enable.

## Testing

- **API (TDD):** change-password (wrong current rejected, sessions invalidated), 2FA
  enroll/verify/disable/recovery, default-landing-page validation, marketplace list, workspace
  scoping on every route.
- **Registry:** Personal/Workspace filtering by role/admin; CRM entries surface; ordering.
- **Uniform module page:** General renders first-party component vs plugin schema; Hooks tab
  lists declared features incl. the analytics hook; PATCH round-trip.
- **Web:** RBAC-gated nav/route tests; each reskinned page renders with mocked data; light+dark.
- **Security review** of 2FA/password endpoints before merge.

## Rollout / cleanup

- Migrate section by section into `(fluid)/settings`; delete old `(dashboard)/settings/*` route
  and superseded components once the Fluid version is live.
- Keep non-redesigned settings pages (integrations, notifications, ssh, etc.) reachable; reskin
  opportunistically or leave under `(dashboard)` until a later pass (they're outside the stated
  Personal/Workspace list — decide per-page in plan).
- Run `Update Graphify` after.

## Open questions (resolve in plan)

1. ~~2FA scope~~ — **Resolved: build 2FA within this spec** (change-password + TOTP + recovery +
   login challenge), behind mandatory tests + security review.
2. **Marketplace source** — is there an upstream plugin registry/catalog API, or is
   "available plugins" a static/proxied list for now? (Check `license-check.ts` / license
   service.)
3. **Settings pages outside the stated list** (integrations, notifications, ssh, messaging, etc.)
   — reskin in this spec, or leave under `(dashboard)`? (Lean: leave; reskin later.)
4. **White-label/palette** — how much of branding is already editable vs new UI needed.
5. **Default landing page** — allowed targets = permitted module routes; where the redirect is
   enforced (middleware vs post-login).

## Done — full design set

Specs 1–3 cover Foundation, CRM, and Settings. Implementation order: Foundation → CRM → Settings,
each with its own writing-plans pass and review checkpoints.
