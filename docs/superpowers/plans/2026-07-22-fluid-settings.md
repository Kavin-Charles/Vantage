# Fluid Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Settings module in Vencore Fluid, reorganized into Personal + Workspace scopes driven by the Foundation settings-registry, with a uniform per-module/plugin page (General + dynamic Hooks), and new backend for change-password (if missing), 2FA/TOTP, default landing page, and a plugin marketplace list.

**Architecture:** Consumes Foundation (spec 1: `(fluid)` shell, primitives, `settings-registry`, `HookFeatureCard`) and CRM (spec 2: registered CRM settings entry + analytics hook). Settings routes migrate into `app/(fluid)/settings/*` (URLs unchanged). Most pages are reskins of existing ones; new backend is TDD-first. Modules and plugins share one settings page whose General tab is a first-party component (module) or schema-driven from `settings_schema` via `/api/settings/domain` (plugin), and whose Hooks tab renders declared hook-features from `/api/settings/hooks/:moduleId`.

**Tech Stack:** Next.js App Router (TS), React, Kysely + PostgreSQL, Express + Zod, `bcrypt` (present), `otplib` (new, for TOTP), vitest, react-query.

## Global Constraints

- TypeScript strict, **no `any`**, no `console.log` in prod (use `logger`).
- **Never edit existing migrations.** New files `packages/db/migrations/YYYYMMDD_NNN_<name>.ts` (`up`/`down`).
- Every route: Zod-validate, `{ data, error }` envelope, auth/workspace-scoped.
- **Security-sensitive endpoints (change-password, 2FA) get first-written tests and a mandatory security review before merge.** TOTP secrets + recovery codes encrypted at rest (reuse existing key infra), never logged, recovery codes shown once.
- Personal scope: any authenticated user. Workspace scope: `isAdmin` / section permission.
- Reuse Foundation primitives + existing settings components; do not restyle inline.
- Settings pages NOT in the Personal/Workspace list (integrations, notifications, ssh, messaging, etc.) stay under `(dashboard)` — reskin later.
- Git: branch `claude/refactor-crm-redesign-94d91e`; sole author Kavin-Charles, no AI attribution; one small commit per task. **Foundation + CRM plans merged first.**

---

## File Structure

```
packages/db/migrations/20260722_003_user_security_prefs.ts   # default_landing_page, totp_*, recovery table (T1)
packages/db/src/schema.ts                                    # UserTable + user_recovery_codes (T1)
apps/api/package.json                                        # add otplib (T4)
apps/api/src/routes/me.ts                                    # password (verify), landing page (T2)
apps/api/src/routes/me-2fa.ts                                # enroll/verify/disable (T4)
apps/api/src/routes/marketplace.ts                          # available plugins (T5)
apps/web/app/(fluid)/settings/*                             # layout + pages (T6+)
apps/web/modules/settings/fluid/*                           # panels, uniform module page, registration
```

---

## Task 1: Migration — user security + prefs

**Files:** Create `packages/db/migrations/20260722_003_user_security_prefs.ts`; Modify `schema.ts` (UserTable + new `UserRecoveryCodeTable`).

**Interfaces:** `users.default_landing_page text null`, `users.totp_secret text null`, `users.totp_enabled bool default false`; new table `user_recovery_codes(id, user_id, code_hash, used_at, created_at)`.

- [ ] **Step 1: Migration**
```ts
// packages/db/migrations/20260722_003_user_security_prefs.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').addColumn('default_landing_page', 'text', c => c).execute();
  await db.schema.alterTable('users').addColumn('totp_secret', 'text', c => c).execute();
  await db.schema.alterTable('users').addColumn('totp_enabled', 'boolean', c => c.defaultTo(false).notNull()).execute();
  await db.schema.createTable('user_recovery_codes')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', c => c.notNull())
    .addColumn('code_hash', 'text', c => c.notNull())
    .addColumn('used_at', 'timestamptz', c => c)
    .addColumn('created_at', 'timestamptz', c => c.defaultTo(sql`now()`).notNull())
    .execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_recovery_codes').execute();
  await db.schema.alterTable('users').dropColumn('totp_enabled').execute();
  await db.schema.alterTable('users').dropColumn('totp_secret').execute();
  await db.schema.alterTable('users').dropColumn('default_landing_page').execute();
}
```

- [ ] **Step 2:** In `schema.ts`: add to `UserTable` `default_landing_page: string | null; totp_secret: string | null; totp_enabled: Generated<boolean>;`. Add `UserRecoveryCodeTable` interface + register it in the `Database` interface map.

- [ ] **Step 3:** `pnpm --filter @vencore/db db:migrate && pnpm --filter @vencore/db exec tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**
```bash
git add packages/db/migrations/20260722_003_user_security_prefs.ts packages/db/src/schema.ts
git commit -m "feat(db): user default_landing_page, totp fields, recovery codes"
```

---

## Task 2: API — default landing page + change-password (audit/extend)

**Files:** Modify `apps/api/src/routes/me.ts` + its test.

**Interfaces:** `PATCH /api/me` accepts `default_landing_page`; confirm/complete `POST /api/me/password` (`patchPasswordSchema` already defined in `me.ts`).

- [ ] **Step 1: Audit change-password.** Read `me.ts` — `patchPasswordSchema` exists. If a working `POST/PATCH /api/me/password` route already exists, leave it (reskin UI only in T9) and skip to Step 3. If the schema is defined but no route wired, add it (Step 2).

- [ ] **Step 2 (only if missing): change-password route** (security-sensitive — write the test first)
```ts
// in createMeRouter, after PATCH '/':
router.post('/password', async (req, res, next) => {
  try {
    const { user } = req as unknown as AuthenticatedRequest;
    const parsed = patchPasswordSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Invalid password.' } }); return; }
    const row = await db.selectFrom('users').select(['password_hash']).where('id', '=', user.id).executeTakeFirst();
    const ok = row ? await bcrypt.compare(parsed.data.currentPassword, row.password_hash) : false;
    if (!ok) { res.status(403).json({ data: null, error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' } }); return; }
    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.updateTable('users').set({ password_hash: hash }).where('id', '=', user.id).execute();
    res.json({ data: { ok: true }, error: null });
  } catch (e) { next(e); }
});
```
(Verify the real column name for the password hash in `schema.ts`/`seed.ts` — adjust `password_hash` if different. Session invalidation: if the app tracks sessions/tokens server-side, revoke other sessions here; document if it does not.)

- [ ] **Step 3: default_landing_page** — extend `patchMeSchema`:
```ts
const patchMeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  default_landing_page: z.string().max(255).optional(),
});
```
Persist it in the existing PATCH `/` update. Include it in `GET /` response under `user`.

- [ ] **Step 4: Tests** — add/extend `me` tests: wrong current password → 403; valid change → 200; `default_landing_page` round-trips. Run `cd apps/api && npx vitest run` → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/me.ts apps/api/src/__tests__
git commit -m "feat(api): default landing page pref and change-password"
```

---

## Task 3: Marketplace listing endpoint

**Files:** Create `apps/api/src/routes/marketplace.ts` + test; mount route.

**Interfaces:** `GET /api/marketplace/plugins` → `{ data: { plugins: MarketplacePlugin[] }, error: null }` (available-to-install catalog, excluding already-installed).

- [ ] **Step 1: Determine source.** Read `apps/api/src/routes/plugins.ts` + `apps/api/src/workers/license-check.ts` to find the upstream registry/license service. If a remote catalog URL exists, proxy it; if not, return a curated static list for now (document inline that it is a placeholder catalog until the registry service lands).

- [ ] **Step 2: Failing test** — `GET /api/marketplace/plugins` returns a list; installed plugins are excluded (mock `workspace_plugins` rows). Concrete supertest assertions.

- [ ] **Step 3: Implement**
```ts
// apps/api/src/routes/marketplace.ts
import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

export interface MarketplacePlugin { id: string; name: string; description: string; icon?: string; version: string; installed: boolean }

export function createMarketplaceRouter(db: Kysely<Database>, catalog: () => Promise<Omit<MarketplacePlugin, 'installed'>[]>): ExpressRouter {
  const router = Router();
  router.get('/plugins', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const installed = await db.selectFrom('workspace_plugins').select(['plugin_id']).where('workspace_id', '=', workspace.id).execute();
      const installedIds = new Set(installed.map(r => r.plugin_id));
      const items = (await catalog()).map(p => ({ ...p, installed: installedIds.has(p.id) }));
      res.json({ data: { plugins: items }, error: null });
    } catch (e) { next(e); }
  });
  return router;
}
```
(Verify `workspace_plugins.plugin_id` column name in `schema.ts`; adjust if different.)

- [ ] **Step 4: Mount** with the same auth chain as `/api/plugins`; pass a `catalog` function that returns the proxied or static list. Run test → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/marketplace.ts apps/api/src/__tests__ apps/api/src/index.ts
git commit -m "feat(api): plugin marketplace listing endpoint"
```

---

## Task 4: API — 2FA / TOTP (security-sensitive)

**Files:** Modify `apps/api/package.json` (add `otplib`); Create `apps/api/src/routes/me-2fa.ts` + `apps/api/src/lib/recovery-codes.ts` + tests; mount router; extend login flow.

**Interfaces:** `POST /api/me/2fa/enroll` → `{ data: { otpauth_uri, secret } }`; `POST /api/me/2fa/verify` `{ code }` → enables + returns `{ recovery_codes: string[] }` (once); `POST /api/me/2fa/disable` `{ code }`. Login gains a TOTP challenge when `totp_enabled`.

- [ ] **Step 1: Add dependency**

Run: `pnpm --filter @vencore/api add otplib`
Expected: `otplib` in `apps/api/package.json` dependencies.

- [ ] **Step 2: Recovery-codes helper + test**
```ts
// apps/api/src/lib/recovery-codes.ts
import { randomBytes } from 'node:crypto';
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => randomBytes(5).toString('hex')); // 10-char codes
}
```
```ts
// apps/api/src/lib/recovery-codes.test.ts
import { describe, it, expect } from 'vitest';
import { generateRecoveryCodes } from './recovery-codes';
describe('generateRecoveryCodes', () => {
  it('generates n unique codes', () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach(c => expect(c).toMatch(/^[0-9a-f]{10}$/));
  });
});
```
Run → PASS.

- [ ] **Step 3: Failing 2FA route tests** — enroll returns otpauth_uri+secret and stores encrypted secret (not enabled yet); verify with a correct TOTP enables + returns recovery codes; verify with wrong code → 400 and stays disabled; disable requires a valid code. Use the `buildDb` harness + a stubbed `otplib` verify. Write concrete assertions.

- [ ] **Step 4: Implement `me-2fa.ts`**
```ts
// apps/api/src/routes/me-2fa.ts
import { Router, type Router as ExpressRouter } from 'express';
import { authenticator } from 'otplib';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { generateRecoveryCodes } from '../lib/recovery-codes';
// Reuse the app's existing at-rest encryption for secrets (see SSH_ENCRYPTION_KEY usage).
import { encryptSecret, decryptSecret } from '../lib/crypto'; // verify actual helper path/name

const codeSchema = z.object({ code: z.string().min(6).max(10) });

export function createMe2faRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.post('/2fa/enroll', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const secret = authenticator.generateSecret();
      const otpauth = authenticator.keyuri(user.email, 'Vencore', secret);
      await db.updateTable('users').set({ totp_secret: encryptSecret(secret), totp_enabled: false }).where('id', '=', user.id).execute();
      res.json({ data: { otpauth_uri: otpauth, secret }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/2fa/verify', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = codeSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Invalid code.' } }); return; }
      const row = await db.selectFrom('users').select(['totp_secret']).where('id', '=', user.id).executeTakeFirst();
      if (!row?.totp_secret) { res.status(400).json({ data: null, error: { code: 'NOT_ENROLLED', message: 'Start enrollment first.' } }); return; }
      const ok = authenticator.verify({ token: parsed.data.code, secret: decryptSecret(row.totp_secret) });
      if (!ok) { res.status(400).json({ data: null, error: { code: 'INVALID_CODE', message: 'Code did not match.' } }); return; }
      const codes = generateRecoveryCodes();
      const hashed = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));
      await db.transaction().execute(async trx => {
        await trx.updateTable('users').set({ totp_enabled: true }).where('id', '=', user.id).execute();
        await trx.deleteFrom('user_recovery_codes').where('user_id', '=', user.id).execute();
        for (const code_hash of hashed) await trx.insertInto('user_recovery_codes').values({ user_id: user.id, code_hash }).execute();
      });
      res.json({ data: { recovery_codes: codes }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/2fa/disable', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = codeSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Invalid code.' } }); return; }
      const row = await db.selectFrom('users').select(['totp_secret']).where('id', '=', user.id).executeTakeFirst();
      const ok = row?.totp_secret ? authenticator.verify({ token: parsed.data.code, secret: decryptSecret(row.totp_secret) }) : false;
      if (!ok) { res.status(403).json({ data: null, error: { code: 'INVALID_CODE', message: 'Code did not match.' } }); return; }
      await db.updateTable('users').set({ totp_enabled: false, totp_secret: null }).where('id', '=', user.id).execute();
      await db.deleteFrom('user_recovery_codes').where('user_id', '=', user.id).execute();
      res.json({ data: { ok: true }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
```
(Verify the real encryption helper — the repo has `SSH_ENCRYPTION_KEY`; find its encrypt/decrypt util and use it. If none exists, add one keyed by an env secret before this task.)

- [ ] **Step 5: Login challenge** — in the auth login route, when the authenticated user has `totp_enabled`, require a valid TOTP (or recovery code) before issuing the session token. Add a test for the challenge path. Keep the change minimal and behind tests.

- [ ] **Step 6:** Mount `createMe2faRouter` under `/api/me` with auth. Run `cd apps/api && npx vitest run` → PASS.

- [ ] **Step 7: Security review gate.** Before merge, run the security-review skill / request review on the diff (password + 2FA + login challenge). Address findings. Commit only after review:
```bash
git add apps/api/package.json apps/api/src/routes/me-2fa.ts apps/api/src/lib/recovery-codes.ts apps/api/src/lib/recovery-codes.test.ts apps/api/src/__tests__ apps/api/src/index.ts apps/api/src/routes/auth.ts
git commit -m "feat(api): TOTP 2FA enroll/verify/disable and login challenge"
```

---

## Task 5: (fluid)/settings layout + scope nav from registry

**Files:** Create `app/(fluid)/settings/layout.tsx`, `app/(fluid)/settings/page.tsx`; Create `modules/settings/fluid/SettingsNav.tsx`.

**Interfaces:** Foundation `getSettingsEntries`, `useAuth`.

- [ ] **Step 1: SettingsNav** — renders Personal + Workspace groups from `getSettingsEntries('personal'|'workspace')`, filtered by `hasPermission`/`isAdmin`; active-route highlight; glass panel.
```tsx
// apps/web/modules/settings/fluid/SettingsNav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { getSettingsEntries, type SettingsEntryDef } from '@/modules/shared/fluid/settings-registry';
import { GlassCard, MSIcon } from '@/modules/shared/fluid/ui';

function useVisible(scope: 'personal' | 'workspace'): SettingsEntryDef[] {
  const { hasPermission, user } = useAuth();
  return getSettingsEntries(scope).filter(e => {
    if (e.adminOnly && !user?.isAdmin) return false;
    if (e.permission && !hasPermission(e.permission)) return false;
    return true;
  });
}

export function SettingsNav() {
  const pathname = usePathname();
  const personal = useVisible('personal');
  const workspace = useVisible('workspace');
  const section = (label: string, items: SettingsEntryDef[]) => items.length === 0 ? null : (
    <div style={{ marginBottom: 20 }}>
      <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fl-outline)' }}>{label}</p>
      {items.map(e => {
        const href = `/settings/${e.id}`;
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link key={e.id} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--fl-radius-pill)', textDecoration: 'none', color: active ? 'var(--fl-on-primary)' : 'var(--fl-on-surface-variant)', background: active ? 'var(--fl-primary)' : 'transparent' }}>
            <MSIcon name={e.icon} size={20} /><span style={{ fontSize: 13, fontWeight: 600 }}>{e.label}</span>
          </Link>
        );
      })}
    </div>
  );
  return <GlassCard style={{ width: 260, alignSelf: 'flex-start' }}>{section('Personal', personal)}{section('Workspace', workspace)}</GlassCard>;
}
```

- [ ] **Step 2: Layout + landing**
```tsx
// apps/web/app/(fluid)/settings/layout.tsx
import { SettingsNav } from '@/modules/settings/fluid/SettingsNav';
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 24 }}><SettingsNav /><div style={{ flex: 1 }}>{children}</div></div>;
}
```
```tsx
// apps/web/app/(fluid)/settings/page.tsx
import { redirect } from 'next/navigation';
export default function SettingsHome() { redirect('/settings/profile'); }
```

- [ ] **Step 3:** Register personal + workspace entries in a `modules/settings/fluid/register.ts` imported by the app bootstrap (each entry's `component` built in later tasks; register with a stub component first if needed, replace as pages land). Personal: profile/preferences/security. Workspace (adminOnly): workspace/users/roles/modules/plugins/api-keys/updates/about.

- [ ] **Step 4:** Type-check + commit:
```bash
git add "apps/web/app/(fluid)/settings" apps/web/modules/settings/fluid/SettingsNav.tsx apps/web/modules/settings/fluid/register.ts
git commit -m "feat(settings): (fluid)/settings shell and registry-driven nav"
```

---

## Task 6: Personal pages — Profile, Preferences, Security

**Files:** Create `modules/settings/fluid/personal/{ProfilePanel,PreferencesPanel,SecurityPanel}.tsx`, route files `app/(fluid)/settings/{profile,preferences,security}/page.tsx`; delete old counterparts.

**Interfaces:** `useAuth`, `useTheme`, `apiFetch`, `useContactOverview`-style hooks; Foundation primitives; 2FA endpoints (T4).

- [ ] **Step 1: ProfilePanel** — `GlassCard`: `Avatar` (PFP upload via existing storage/messaging-upload pattern — verify endpoint), name (`FluidInput`), email (read-only), role badge, workspace UUID (copyable via a copy button). PATCH `/api/me`.
- [ ] **Step 2: PreferencesPanel** — theme toggle (`useTheme`), default landing page (`FluidSelect` of permitted module routes) → PATCH `/api/me { default_landing_page }`.
- [ ] **Step 3: SecurityPanel** — change-password form (current/new `FluidInput type=password`) → `POST /api/me/password`; 2FA section: if disabled, "Enable" → enroll (show QR from `otpauth_uri` — render a QR via a tiny inline generator or display the secret), verify code, then show recovery codes once; if enabled, "Disable" (requires code). Uses T4 endpoints.
- [ ] **Step 4:** Route files import the panels. Delete old `(dashboard)/settings/{profile,preferences,appearance,security}/page.tsx`. Replace their registry `component` stubs with the real panels. Type-check, visual verify, commit:
```bash
git add apps/web/modules/settings/fluid/personal "apps/web/app/(fluid)/settings/profile" "apps/web/app/(fluid)/settings/preferences" "apps/web/app/(fluid)/settings/security"
git rm "apps/web/app/(dashboard)/settings/profile/page.tsx" "apps/web/app/(dashboard)/settings/preferences/page.tsx" "apps/web/app/(dashboard)/settings/appearance/page.tsx" "apps/web/app/(dashboard)/settings/security/page.tsx"
git commit -m "feat(settings): fluid personal pages — profile, preferences, security"
```

---

## Task 7: Workspace pages — Workspace, Users, Roles

**Files:** Create `modules/settings/fluid/workspace/{WorkspacePanel,UsersPanel,RolesPanel}.tsx`, route files; reuse existing components (`InviteUserModal`, `RoleMatrixEditor`, `RoleInheritancePanel`, etc.).

- [ ] **Step 1: WorkspacePanel** — name, domain, color palette + white-label (logo, brand name, accent) with live preview. Reuse existing workspace/branding settings logic; restyle to Fluid.
- [ ] **Step 2: UsersPanel** — `FluidTable` of users + invite (`InviteUserModal` reskin) + role assignment. Reuse existing users data.
- [ ] **Step 3: RolesPanel** — role list, create role, permission matrix (`RoleMatrixEditor` reskin), inheritance/constraints. Reuse existing roles API.
- [ ] **Step 4:** Wire routes (adminOnly registry entries), delete old counterparts, type-check, visual verify, commit:
```bash
git add apps/web/modules/settings/fluid/workspace "apps/web/app/(fluid)/settings/workspace" "apps/web/app/(fluid)/settings/users" "apps/web/app/(fluid)/settings/roles"
git rm "apps/web/app/(dashboard)/settings/workspace/page.tsx"
git commit -m "feat(settings): fluid workspace, users, roles pages"
```
(Delete old users/roles routes in this commit too, matching the real paths under `(dashboard)/settings/(users-roles)`.)

---

## Task 8: Uniform module/plugin settings page (General + Hooks)

**Files:** Create `modules/settings/fluid/modules/{ModulesListPanel,ModuleSettingsPage,GeneralTab,HooksTab}.tsx`, route files `app/(fluid)/settings/modules/page.tsx` + `modules/[moduleId]/page.tsx`.

**Interfaces:** Foundation `HookFeatureCard`, `PillTabs`; existing `/api/settings/domain` (plugin schema), `/api/settings/hooks/:moduleId`, `useModules`, `useInstalledPlugins`.

- [ ] **Step 1: ModulesListPanel** — list first-party modules + installed plugins (toggle enabled/disabled via `useModules().setEnabled` / plugin toggle), each row a settings gear → `/settings/modules/[moduleId]`.
- [ ] **Step 2: ModuleSettingsPage** — `PillTabs` [General, Hooks].
```tsx
// apps/web/modules/settings/fluid/modules/ModuleSettingsPage.tsx
'use client';
import { useState } from 'react';
import { PageHeader, PillTabs } from '@/modules/shared/fluid/ui';
import { GeneralTab } from './GeneralTab';
import { HooksTab } from './HooksTab';
export function ModuleSettingsPage({ moduleId, moduleName }: { moduleId: string; moduleName: string }) {
  const [tab, setTab] = useState('general');
  return (
    <>
      <PageHeader title={moduleName} subtitle="Module settings" />
      <PillTabs tabs={[{ id: 'general', label: 'General' }, { id: 'hooks', label: 'Hooks' }]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 24 }}>{tab === 'general' ? <GeneralTab moduleId={moduleId} /> : <HooksTab moduleId={moduleId} />}</div>
    </>
  );
}
```
- [ ] **Step 3: GeneralTab** — first-party module → its registered settings component (look up via a module→component map, or the settings-registry entry for that module); plugin → schema-driven form from `/api/settings/domain` filtered to that plugin (reuse `PluginSettingsSections` logic, restyled).
- [ ] **Step 4: HooksTab** — fetch `GET /api/settings/hooks/:moduleId`, render each feature with Foundation `HookFeatureCard`; toggle via `PATCH /api/settings/hooks/:moduleId/:featureId`. This is where the CRM analytics hook (spec 2) appears for `moduleId='crm'`. Dynamic — lists exactly what the backend declares.
- [ ] **Step 5:** Route `modules/[moduleId]/page.tsx` renders `ModuleSettingsPage` with the id/name. Type-check, visual verify (CRM module shows the analytics hook), commit:
```bash
git add apps/web/modules/settings/fluid/modules "apps/web/app/(fluid)/settings/modules"
git rm "apps/web/app/(dashboard)/settings/modules/page.tsx"
git commit -m "feat(settings): uniform module/plugin page with General + dynamic Hooks"
```

---

## Task 9: Plugins (installed + marketplace)

**Files:** Create `modules/settings/fluid/plugins/{PluginsPanel}.tsx`, route file; reuse `useInstalledPlugins` + new `GET /api/marketplace/plugins` (T3).

- [ ] **Step 1: PluginsPanel** — two sections: **Installed** (from `useInstalledPlugins`, toggle/uninstall, gear → `/settings/modules/[pluginId]`) and **Marketplace** (from marketplace endpoint, install action; `installed` flag hides/disables install). Fluid `FluidTable`/`GlassCard`.
- [ ] **Step 2:** Wire route (adminOnly), delete old plugins page, type-check, visual verify, commit:
```bash
git add apps/web/modules/settings/fluid/plugins "apps/web/app/(fluid)/settings/plugins"
git rm "apps/web/app/(dashboard)/settings/plugins/page.tsx"
git commit -m "feat(settings): fluid plugins page with marketplace"
```

---

## Task 10: API Key, Updates, About

**Files:** Create `modules/settings/fluid/workspace/{ApiKeysPanel,UpdatesPanel,AboutPanel}.tsx`, route files; reuse `ApiKeyTable`, `CreateApiKeyModal`, `update-check.ts`.

- [ ] **Step 1: ApiKeysPanel** — `ApiKeyTable` + `CreateApiKeyModal` reskinned to Fluid; create Vencore API key.
- [ ] **Step 2: UpdatesPanel** — changelog + "update instance" action via existing update-check API.
- [ ] **Step 3: AboutPanel** — Fluid about page (product, version, links).
- [ ] **Step 4:** Wire routes (workspace scope; api-keys adminOnly), delete old counterparts, type-check, visual verify, commit:
```bash
git add apps/web/modules/settings/fluid/workspace "apps/web/app/(fluid)/settings/api-keys" "apps/web/app/(fluid)/settings/updates" "apps/web/app/(fluid)/settings/about"
git rm "apps/web/app/(dashboard)/settings/api-keys/page.tsx" "apps/web/app/(dashboard)/settings/updates/page.tsx" "apps/web/app/(dashboard)/settings/about/page.tsx"
git commit -m "feat(settings): fluid api-keys, updates, about pages"
```

---

## Task 11: Verification, security review, graphify

- [ ] **Step 1: Full tests + type-check:** `cd apps/api && npx vitest run && cd ../web && npx vitest run && npx tsc --noEmit` → all PASS.
- [ ] **Step 2: Route-conflict check:** `cd apps/web && npx next build 2>&1 | grep -i conflict || echo "no route conflicts"` → `no route conflicts` (each migrated settings segment removed from `(dashboard)`).
- [ ] **Step 3: Security review** of the whole branch's password/2FA/login surface (security-review skill). Address findings before merge.
- [ ] **Step 4: Graphify + commit:**
```bash
/graphify . --update
git add graphify-out
git commit -m "chore(graphify): update graph after fluid settings"
```

---

## Self-Review notes (coverage vs Spec 3)

- Gap table → T1–4 (backend: prefs, password, 2FA, marketplace), T5 (shell/nav), T6 (personal), T7 (workspace/users/roles), T8 (uniform module/plugin + Hooks), T9 (plugins/marketplace), T10 (api-keys/updates/about).
- Cross-cutting: RBAC → registry filter (T5) + adminOnly entries; every-feature-customizable → registry-driven nav + uniform module page; analytics hook renders in T8 Hooks tab.
- 2FA built in-spec (T4) behind first-written tests + mandatory security review (T4 Step 7, T11 Step 3).
- Left under `(dashboard)` by constraint: integrations, notifications, ssh, messaging, activity, dashboards, pipelines, team, account, project-management — reskin later.
- Verify-at-impl (real signatures/paths): password hash column name, at-rest crypto helper (`SSH_ENCRYPTION_KEY`), `workspace_plugins.plugin_id`, storage/upload endpoint for PFP, marketplace catalog source, existing settings-component reuse (`RoleMatrixEditor`, `InviteUserModal`, `ApiKeyTable`, `PluginSettingsSections`). Each kept behind stable component/route props.
