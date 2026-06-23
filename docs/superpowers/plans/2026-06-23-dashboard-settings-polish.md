# Dashboard & Settings Production Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the duplicate-dashboard-title bug, polish dashboard loading/empty states, and reorganize the Settings module into a grouped sub-nav with new Appearance (real dark/light theme), Notifications, Preferences, Workspace, Account, Security, and About sections.

**Architecture:** Backend additions are small, additive Express/Kysely routes following the exact patterns already used in `workspace-modules.ts` and `users.ts` (Zod validation, `{ data, error }` envelope, admin checks). Frontend additions follow the exact inline-style convention used throughout `apps/web` (no Tailwind classes, no component library) — CSS variables from `globals.css`, the existing `Button`/`FormField`/`Input` primitives, and React Query for GET requests.

**Tech Stack:** Next.js App Router, React Query (`@tanstack/react-query`), Express, Kysely, Zod, bcrypt, Vitest + Supertest for API tests.

## Global Constraints

- TypeScript strict mode. No `any` types in new code.
- All API responses follow `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`.
- All API routes are workspace-scoped; never query across `workspace_id`.
- No new npm dependencies (no animation library, no CSS framework) — use existing CSS variables and `--motion-fast`/`--motion-ease` transition tokens.
- Never modify existing migration files — only add new ones.
- Components use inline `style` objects, matching every existing file in `apps/web/modules` and `apps/web/app/(dashboard)`.
- Settings sections with no backend (Notifications, Preferences, Security) must render fully but with all interactive controls `disabled` and a "Coming Soon" badge — never an empty page.

---

## File Structure

**API (new/modified):**
- `packages/db/migrations/20260623_001_user_theme.ts` — new migration, adds `theme` column to `users`.
- `packages/db/src/schema.ts` — add `theme` to `UserTable`.
- `apps/api/src/routes/me.ts` — add `PATCH /` (name/theme) and `PATCH /password`.
- `apps/api/src/routes/workspace.ts` — new router, `PATCH /` (name/domain), admin-only.
- `apps/api/src/index.ts` — mount the new workspace router.
- `apps/api/src/__tests__/me.test.ts` — new test file.
- `apps/api/src/__tests__/workspace.test.ts` — new test file.
- `apps/web/store/auth-slice.ts` — add `theme` to `AuthUser`.

**Web — shared infra:**
- `apps/web/modules/shared/contexts/ThemeContext.tsx` — new.
- `apps/web/modules/shared/components/ui/ComingSoonBadge.tsx` — new.
- `apps/web/app/layout.tsx` — mount `ThemeProvider`.
- `apps/web/app/globals.css` — dark theme variables, skeleton shimmer, fade-in, settings sub-nav responsive classes, widget enter animation.

**Web — Settings:**
- `apps/web/app/(dashboard)/settings/layout.tsx` — replace flat tabs with grouped sub-nav.
- `apps/web/app/(dashboard)/settings/profile/page.tsx` — make name editable.
- `apps/web/app/(dashboard)/settings/appearance/page.tsx` — new.
- `apps/web/app/(dashboard)/settings/notifications/page.tsx` — new.
- `apps/web/app/(dashboard)/settings/preferences/page.tsx` — new.
- `apps/web/app/(dashboard)/settings/workspace/page.tsx` — new.
- `apps/web/app/(dashboard)/settings/account/page.tsx` — new.
- `apps/web/app/(dashboard)/settings/security/page.tsx` — new.
- `apps/web/app/(dashboard)/settings/about/page.tsx` — new.

**Web — Dashboard:**
- `apps/web/modules/dashboard/components/DashboardTabs.tsx` — drop create-button, simplify guard.
- `apps/web/modules/dashboard/components/DashboardHeader.tsx` — add "+ New Dashboard" button.
- `apps/web/modules/dashboard/pages/[id]/page.tsx` — rewire create trigger, add skeleton loading state, polish empty state.
- `apps/web/modules/dashboard/components/DashboardGrid.tsx` — polish empty state.
- `apps/web/modules/dashboard/components/WidgetCard.tsx` — add enter animation class.

---

### Task 1: Add `theme` column to users (migration + schema type)

**Files:**
- Create: `packages/db/migrations/20260623_001_user_theme.ts`
- Modify: `packages/db/src/schema.ts:16-28` (`UserTable` interface)
- Test: manual migration run (no live DB required for later tasks — they use mocked Kysely)

**Interfaces:**
- Produces: `users.theme` column, type `'light' | 'dark'`, default `'light'`, `NOT NULL`.

- [ ] **Step 1: Write the migration**

```typescript
// packages/db/migrations/20260623_001_user_theme.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('theme', 'varchar(10)', col => col.notNull().defaultTo('light'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('theme').execute();
}
```

- [ ] **Step 2: Add the column to the Kysely schema type**

In `packages/db/src/schema.ts`, update `UserTable` (currently lines 16-28):

```typescript
export interface UserTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  email: string;
  role: Generated<'admin' | 'member'>;
  password_hash: string;
  password_reset_token: string | null;
  password_reset_expires_at: Date | null;
  is_active: Generated<boolean>;
  theme: Generated<'light' | 'dark'>;
  last_login_at: Date | null;
  created_at: Generated<Date>;
}
```

- [ ] **Step 3: Run the migration (requires a local Postgres with `DATABASE_URL` configured)**

Run: `pnpm db:migrate`
Expected: output lists `20260623_001_user_theme` as applied. If no local database is configured, skip this step — every later task uses mocked Kysely in tests, so nothing else in this plan depends on a live database.

- [ ] **Step 4: Type-check the db package**

Run: `pnpm --filter @vencore/db build`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/20260623_001_user_theme.ts packages/db/src/schema.ts
git commit -m "feat: add theme column to users table"
```

---

### Task 2: `PATCH /api/me` (name + theme) and `PATCH /api/me/password`

**Files:**
- Modify: `apps/api/src/routes/me.ts`
- Test: Create `apps/api/src/__tests__/me.test.ts`

**Interfaces:**
- Consumes: `AuthenticatedRequest` from `../middleware/auth` (has `.user: User`, `.workspace: Workspace`, where `User` now includes `theme`).
- Produces: `PATCH /api/me` accepts `{ name?: string; theme?: 'light' | 'dark' }`, returns `{ data: { id, name, email, role, theme }, error: null }`. `PATCH /api/me/password` accepts `{ currentPassword: string; newPassword: string }`, returns `{ data: { ok: true }, error: null }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/me.test.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createMeRouter } from '../routes/me';

function buildApp(db: Partial<Kysely<Database>>, userOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = {
      id: 'user-1',
      role: 'member',
      name: 'Old Name',
      email: 'user@example.com',
      theme: 'light',
      password_hash: '$existing-hash',
      ...userOverrides,
    };
    next();
  });
  app.use('/api/me', createMeRouter(db as Kysely<Database>));
  return app;
}

describe('PATCH /api/me', () => {
  it('updates name and theme', async () => {
    const updated = { id: 'user-1', name: 'New Name', email: 'user@example.com', role: 'member', theme: 'dark' };
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue(updated),
      }),
    };
    const res = await request(buildApp(db)).patch('/api/me').send({ name: 'New Name', theme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject(updated);
  });

  it('rejects an invalid theme value', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/me').send({ theme: 'blue' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects an empty body', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/me').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});

describe('PATCH /api/me/password', () => {
  it('rejects when current password is wrong', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    const db: any = {};
    const res = await request(buildApp(db, { password_hash: hash }))
      .patch('/api/me/password')
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('updates the password when current password is correct', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const res = await request(buildApp(db, { password_hash: hash }))
      .patch('/api/me/password')
      .send({ currentPassword: 'correct-password', newPassword: 'new-password-123' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const db: any = {};
    const res = await request(buildApp(db))
      .patch('/api/me/password')
      .send({ currentPassword: 'whatever', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test -- me.test.ts`
Expected: FAIL — `createMeRouter` doesn't accept a `db` argument yet, and the routes don't exist.

- [ ] **Step 3: Implement `me.ts`**

```typescript
// apps/api/src/routes/me.ts
import { Router, type Router as ExpressRouter } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const patchMeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

const patchPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export function createMeRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest;
    res.json({ data: { user, workspace }, error: null });
  });

  // PATCH /api/me — update name and/or theme
  router.patch('/', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = patchMeSchema.safeParse(req.body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      const updated = await db
        .updateTable('users')
        .set(parsed.data)
        .where('id', '=', user.id)
        .returning(['id', 'name', 'email', 'role', 'theme'])
        .executeTakeFirstOrThrow();

      res.json({ data: updated, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/me/password — change own password
  router.patch('/password', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = patchPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
      if (!valid) {
        res.status(401).json({ data: null, error: { code: 'INVALID_CREDENTIALS' } });
        return;
      }

      const hash = await bcrypt.hash(parsed.data.newPassword, 12);
      await db
        .updateTable('users')
        .set({ password_hash: hash })
        .where('id', '=', user.id)
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Update the mount site in `index.ts`**

In `apps/api/src/index.ts:217`, change:

```typescript
app.use('/api/me', requireAuth, createMeRouter());
```

to:

```typescript
app.use('/api/me', requireAuth, createMeRouter(db));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter api test -- me.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/me.ts apps/api/src/index.ts apps/api/src/__tests__/me.test.ts
git commit -m "feat: add PATCH /api/me and PATCH /api/me/password"
```

---

### Task 3: `PATCH /api/workspace` (name/domain, admin-only)

**Files:**
- Create: `apps/api/src/routes/workspace.ts`
- Modify: `apps/api/src/index.ts` (import + mount)
- Test: Create `apps/api/src/__tests__/workspace.test.ts`

**Interfaces:**
- Consumes: `AuthenticatedRequest.workspace: Workspace` (has `id`, `name`, `domain`).
- Produces: `PATCH /api/workspace` accepts `{ name?: string; domain?: string | null }`, returns `{ data: { id, name, domain }, error: null }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/workspace.test.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createWorkspaceRouter } from '../routes/workspace';

function buildApp(db: Partial<Kysely<Database>>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1', name: 'Acme', domain: 'acme.com' };
    next();
  });
  app.use('/api/workspace', createWorkspaceRouter(db as Kysely<Database>));
  return app;
}

describe('PATCH /api/workspace', () => {
  it('updates name and domain', async () => {
    const updated = { id: 'ws-1', name: 'Acme Inc', domain: 'acme.io' };
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue(updated),
      }),
    };
    const res = await request(buildApp(db)).patch('/api/workspace').send({ name: 'Acme Inc', domain: 'acme.io' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject(updated);
  });

  it('rejects an empty body', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/workspace').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects a blank name', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/workspace').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});
```

Note: admin-only enforcement is tested at the mount level (`requireAuth, requireAdmin`), the same as `/api/users` and `/api/groups` — see Step 4. No in-router role check is needed (unlike `workspace-modules.ts`, which has a public `GET` and therefore checks role per-route).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test -- workspace.test.ts`
Expected: FAIL — `../routes/workspace` does not exist.

- [ ] **Step 3: Implement `workspace.ts`**

```typescript
// apps/api/src/routes/workspace.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const patchWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  domain: z.string().min(1).max(255).nullable().optional(),
});

export function createWorkspaceRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // PATCH /api/workspace — update name/domain (mounted with requireAdmin)
  router.patch('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = patchWorkspaceSchema.safeParse(req.body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      const updated = await db
        .updateTable('workspaces')
        .set(parsed.data)
        .where('id', '=', workspace.id)
        .returning(['id', 'name', 'domain'])
        .executeTakeFirstOrThrow();

      res.json({ data: updated, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Mount the router in `index.ts`**

Add the import near line 14 (alongside `createWorkspaceModulesRouter`):

```typescript
import { createWorkspaceRouter } from './routes/workspace';
```

Add the mount right after line 219 (`app.use('/api/workspace/modules', ...)`):

```typescript
app.use('/api/workspace', requireAuth, requireAdmin, createWorkspaceRouter(db));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter api test -- workspace.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/workspace.ts apps/api/src/index.ts apps/api/src/__tests__/workspace.test.ts
git commit -m "feat: add PATCH /api/workspace for admin-only name/domain updates"
```

---

### Task 4: Theme infrastructure — `ThemeContext`, dark CSS variables, `AuthUser.theme`

**Files:**
- Modify: `apps/web/store/auth-slice.ts`
- Create: `apps/web/modules/shared/contexts/ThemeContext.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `useTheme(): { theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => Promise<void> }`, exported from `apps/web/modules/shared/contexts/ThemeContext.tsx`. Consumed by the Appearance settings page (Task 9).

- [ ] **Step 1: Add `theme` to `AuthUser`**

In `apps/web/store/auth-slice.ts:3-9`:

```typescript
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  workspace_id: string;
  theme: 'light' | 'dark';
}
```

- [ ] **Step 2: Create `ThemeContext.tsx`**

```typescript
// apps/web/modules/shared/contexts/ThemeContext.tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useApiToken } from '../lib/useApiToken';
import { apiFetch } from '../lib/api';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vencore_theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const getToken = useApiToken();
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  useEffect(() => {
    if (user?.theme && user.theme !== theme) {
      setThemeState(user.theme);
      localStorage.setItem(STORAGE_KEY, user.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.theme]);

  async function setTheme(next: Theme): Promise<void> {
    const previous = theme;
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    try {
      const token = await getToken();
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ theme: next }),
        token,
      });
    } catch (err) {
      setThemeState(previous);
      localStorage.setItem(STORAGE_KEY, previous);
      throw err;
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

- [ ] **Step 3: Mount `ThemeProvider` in the root layout**

In `apps/web/app/layout.tsx`, add the import and wrap `children`:

```typescript
import { AuthProvider } from '@/modules/shared/lib/AuthContext';
import { ThemeProvider } from '@/modules/shared/contexts/ThemeContext';
import { Providers } from '@/modules/shared/components/Providers';
```

```typescript
      <body suppressHydrationWarning>
        <div id="app-root">
          <Providers>
            <AuthProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </AuthProvider>
          </Providers>
        </div>
      </body>
```

- [ ] **Step 4: Add dark theme variables and animation utilities to `globals.css`**

Append to `apps/web/app/globals.css` (after the existing `@keyframes slideDown` block at line 60):

```css
[data-theme="dark"] {
  --bg:        #0f1117;
  --surface:   #171a23;
  --surface2:  #1f232e;
  --border:    #2a2f3b;
  --border2:   #383f4e;

  --text:      #e8eaf0;
  --text2:     #aab0c0;
  --text3:     #6b7280;

  --green:        #4ade80;
  --green-bg:     #163a2c;
  --amber:        #fbbf24;
  --amber-bg:     #3a2a0f;
  --red:          #f87171;
  --red-bg:       #3a1717;
  --blue:         #60a5fa;
  --blue-bg:      #16233a;
  --purple:       #c4b5fd;
  --purple-bg:    #2a1f3a;

  --shadow-hover: 0 2px 8px rgba(0,0,0,0.4);
  --shadow-modal: 0 8px 32px rgba(0,0,0,0.5);
}

@keyframes shimmer {
  0%   { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}

.skeleton {
  background: linear-gradient(90deg, var(--surface2) 25%, var(--border) 37%, var(--surface2) 63%);
  background-size: 400px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius);
}

.fade-in {
  animation: slideDown var(--motion-fast) var(--motion-ease) both;
}

@keyframes widgetIn {
  from { opacity: 0; transform: scale(.97); }
  to   { opacity: 1; transform: scale(1); }
}

.widget-card-enter {
  animation: widgetIn .2s ease both;
}

.settings-shell {
  display: flex;
  gap: 32px;
}

.settings-subnav {
  width: 200px;
  flex-shrink: 0;
}

.settings-subnav-group {
  margin-bottom: 20px;
}

.settings-content {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .settings-shell {
    flex-direction: column;
    gap: 16px;
  }
  .settings-subnav {
    width: 100%;
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    gap: 4px;
  }
  .settings-subnav-group {
    display: contents;
  }
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/store/auth-slice.ts apps/web/modules/shared/contexts/ThemeContext.tsx apps/web/app/layout.tsx apps/web/app/globals.css
git commit -m "feat: add dark/light theme infrastructure"
```

---

### Task 5: `ComingSoonBadge` component

**Files:**
- Create: `apps/web/modules/shared/components/ui/ComingSoonBadge.tsx`

**Interfaces:**
- Produces: `<ComingSoonBadge />`, a styled `<span>`. Consumed by Notifications, Preferences, and Security pages (Tasks 11, 12, 14).

- [ ] **Step 1: Implement the component**

```typescript
// apps/web/modules/shared/components/ui/ComingSoonBadge.tsx
export function ComingSoonBadge() {
  return (
    <span
      style={{
        background: 'var(--surface2)',
        color: 'var(--text3)',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      Coming Soon
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/components/ui/ComingSoonBadge.tsx
git commit -m "feat: add ComingSoonBadge component"
```

---

### Task 6: Settings layout — grouped sub-nav

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`

**Interfaces:**
- Produces: the new route set this plan adds (`/settings/appearance`, `/settings/notifications`, `/settings/preferences`, `/settings/workspace`, `/settings/account`, `/settings/security`, `/settings/about`) must all resolve under this layout — Tasks 7-13 create the page files.

- [ ] **Step 1: Replace the layout file**

```typescript
// apps/web/app/(dashboard)/settings/layout.tsx
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useAuth } from '@/modules/shared/lib/AuthContext';

interface SettingsLink {
  href: string;
  label: string;
}

interface SettingsGroup {
  label: string | null;
  adminOnly?: boolean;
  links: SettingsLink[];
}

const GROUPS: SettingsGroup[] = [
  {
    label: 'Personal',
    links: [
      { href: '/settings/profile', label: 'Profile' },
      { href: '/settings/appearance', label: 'Appearance' },
      { href: '/settings/notifications', label: 'Notifications' },
      { href: '/settings/preferences', label: 'Preferences' },
    ],
  },
  {
    label: 'Account',
    links: [
      { href: '/settings/account', label: 'Account' },
      { href: '/settings/security', label: 'Security' },
    ],
  },
  {
    label: 'Workspace',
    adminOnly: true,
    links: [
      { href: '/settings/workspace', label: 'Workspace' },
      { href: '/settings/users', label: 'Users & Groups' },
      { href: '/settings/modules', label: 'Modules' },
      { href: '/settings/plugins', label: 'Plugins' },
      { href: '/settings/api-keys', label: 'API Keys' },
      { href: '/settings/ssh', label: 'SSH Keys' },
    ],
  },
  {
    label: null,
    links: [{ href: '/settings/about', label: 'About' }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname.startsWith(href)) return true;
  if (href === '/settings/users' && pathname.startsWith('/settings/groups')) return true;
  return false;
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const isAdmin = user?.role === 'admin';

  const visibleGroups = GROUPS.filter(g => !g.adminOnly || isAdmin);
  const adminOnlyHrefs = GROUPS.filter(g => g.adminOnly).flatMap(g => g.links.map(l => l.href));

  useEffect(() => {
    if (!isLoading && !isAdmin && adminOnlyHrefs.some(href => isActive(pathname, href))) {
      router.push('/settings/profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isLoading, pathname]);

  return (
    <div className="settings-layout">
      <Topbar />
      <div style={{ padding: 24 }}>
        <div className="settings-shell">
          <nav className="settings-subnav">
            {visibleGroups.map(group => (
              <div key={group.label ?? '_top'} className="settings-subnav-group">
                {group.label && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text3)',
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                      padding: '0 10px 6px',
                    }}
                  >
                    {group.label}
                  </div>
                )}
                {group.links.map(link => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      style={{
                        display: 'block',
                        padding: '8px 10px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? 'var(--text)' : 'var(--text2)',
                        background: active ? 'var(--surface2)' : 'transparent',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        transition: 'all .15s',
                      }}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div key={pathname} className="settings-content fade-in">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify navigation renders correctly**

Run: `pnpm --filter web dev` and visit `/settings/profile`. Confirm: the grouped sub-nav renders on the left, the Workspace group only appears for an admin user, and clicking a non-existent route (e.g. `/settings/appearance` before Task 9 lands) shows a 404 rather than crashing the layout.

Expected: layout renders without runtime errors; clicking `/settings/users` as a non-admin user redirects to `/settings/profile`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/layout.tsx
git commit -m "feat: reorganize settings into a grouped sub-nav"
```

---

### Task 7: Profile page — editable name

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/profile/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/me` from Task 2 (`{ name }` → `{ data: { id, name, email, role, theme } }`).

- [ ] **Step 1: Replace the page with an editable form**

```typescript
// apps/web/app/(dashboard)/settings/profile/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { Button } from '@/modules/shared/components/ui/Button';
import { Input, FormField } from '@/modules/shared/components/ui/FormField';

export default function ProfilePage() {
  const { user, isLoading, refetch } = useAuth();
  const getToken = useApiToken();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  if (!mounted) return null;
  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  if (!user) return null;

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    marginBottom: 16,
  };

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/me', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }), token });
      await refetch();
      setSaved(true);
    } catch {
      setError('Could not save your name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Profile</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Your account details.</p>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: 'var(--text2)' }}>
            {(user.name ?? user.email)[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{user.email}</div>
          </div>
        </div>

        <FormField label="Full name" error={error ?? undefined}>
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={255} />
        </FormField>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" onClick={() => void handleSave()} disabled={isSaving || !name.trim() || name === user.name}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          {[
            { label: 'Email', value: user.email },
            { label: 'Role', value: user.role },
            { label: 'User ID', value: user.id },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
              <span style={{ color: 'var(--text)', fontFamily: label === 'User ID' ? 'monospace' : 'inherit', fontSize: label === 'User ID' ? 11 : 13 } as React.CSSProperties}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `pnpm --filter web dev`, visit `/settings/profile`, change the name, click Save.
Expected: "Saved" confirmation appears, the sidebar user display (bottom-left) updates to the new name on next render, and reloading the page shows the persisted name.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/profile/page.tsx
git commit -m "feat: make profile name editable"
```

---

### Task 8: Appearance page (functional dark/light toggle)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/appearance/page.tsx`

**Interfaces:**
- Consumes: `useTheme()` from Task 4.

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/appearance/page.tsx
'use client';

import { useState } from 'react';
import { useTheme } from '@/modules/shared/contexts/ThemeContext';

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: 'light' | 'dark') {
    if (next === theme) return;
    setIsSaving(true);
    setError(null);
    try {
      await setTheme(next);
    } catch {
      setError('Could not save your theme preference. It will reset on next reload.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Appearance</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Choose how Vencore looks on this device.</p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Theme</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>Light or dark interface.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['light', 'dark'] as const).map(option => (
              <button
                key={option}
                disabled={isSaving}
                onClick={() => void handleToggle(option)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  border: theme === option ? '1px solid var(--text)' : '1px solid var(--border)',
                  background: theme === option ? 'var(--text)' : 'var(--surface)',
                  color: theme === option ? '#fff' : 'var(--text)',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  textTransform: 'capitalize',
                  opacity: isSaving ? 0.6 : 1,
                  transition: 'all .15s',
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `pnpm --filter web dev`, visit `/settings/appearance`, toggle to "dark".
Expected: the entire app immediately switches to dark colors (sidebar, topbar, cards). Reload the page — dark mode persists (read from `localStorage` immediately, then reconciled with the server value once `/api/me` resolves).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/appearance/page.tsx
git commit -m "feat: add Appearance settings page with theme toggle"
```

---

### Task 9: Notifications page (placeholder)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/notifications/page.tsx`

**Interfaces:**
- Consumes: `ComingSoonBadge` from Task 5.

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/notifications/page.tsx
'use client';

import { ComingSoonBadge } from '@/modules/shared/components/ui/ComingSoonBadge';

const CATEGORIES = [
  { label: 'Critical alerts', description: 'Server, database, or website outages.' },
  { label: 'Deal updates', description: 'Stage changes and assignments on your deals.' },
  { label: 'Task reminders', description: 'Due dates approaching or overdue.' },
  { label: 'Weekly digest', description: 'A weekly summary email of workspace activity.' },
];

export default function NotificationsPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Notifications</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Choose what you get notified about.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CATEGORIES.map(cat => (
          <div
            key={cat.label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{cat.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{cat.description}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <ComingSoonBadge />
              <button
                disabled
                style={{
                  position: 'relative', width: 44, height: 24, borderRadius: 999,
                  background: 'var(--border)', border: 'none', cursor: 'not-allowed', opacity: 0.6, flexShrink: 0,
                }}
                aria-label={`${cat.label} (coming soon)`}
              >
                <span style={{ position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Visit `/settings/notifications`. Expected: four rows, each with a disabled toggle and a "Coming Soon" badge — no console errors, no network calls fired.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/notifications/page.tsx
git commit -m "feat: add Notifications settings placeholder page"
```

---

### Task 10: Preferences page (placeholder)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/preferences/page.tsx`

**Interfaces:**
- Consumes: `ComingSoonBadge` from Task 5.

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/preferences/page.tsx
'use client';

import { ComingSoonBadge } from '@/modules/shared/components/ui/ComingSoonBadge';

const ROWS = [
  { label: 'Default landing page', description: 'Where you land after signing in.' },
  { label: 'Density', description: 'Compact or comfortable spacing in tables and lists.' },
  { label: 'Date format', description: 'How dates are displayed across the app.' },
];

export default function PreferencesPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Preferences</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Personalize how Vencore behaves for you.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ROWS.map(row => (
          <div
            key={row.label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{row.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{row.description}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <ComingSoonBadge />
              <select disabled style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text3)', fontSize: 12, cursor: 'not-allowed' }}>
                <option>Default</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Visit `/settings/preferences`. Expected: three rows with disabled selects and "Coming Soon" badges.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/preferences/page.tsx
git commit -m "feat: add Preferences settings placeholder page"
```

---

### Task 11: Workspace page (functional, admin-only)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/workspace/page.tsx`

**Interfaces:**
- Consumes: `getMe` from `@vencore/api-client` (already exists, returns `{ data: { user, workspace } }`), `PATCH /api/workspace` from Task 3.

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/workspace/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from '@vencore/api-client';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { Button } from '@/modules/shared/components/ui/Button';
import { Input, FormField } from '@/modules/shared/components/ui/FormField';

export default function WorkspacePage() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => getMe(await getToken()),
  });

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.data.workspace) {
      setName(data.data.workspace.name);
      setDomain(data.data.workspace.domain ?? '');
    }
  }, [data?.data.workspace]);

  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/workspace', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), domain: domain.trim() || null }),
        token,
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
    } catch {
      setError('Could not save workspace settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const unchanged = name === (data?.data.workspace.name ?? '') && domain === (data?.data.workspace.domain ?? '');

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Workspace</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Settings for your entire workspace.</p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
        <FormField label="Workspace name">
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={255} />
        </FormField>
        <FormField label="Domain" error={error ?? undefined}>
          <Input value={domain} onChange={e => setDomain(e.target.value)} maxLength={255} placeholder="acme.com" />
        </FormField>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" onClick={() => void handleSave()} disabled={isSaving || !name.trim() || unchanged}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Visit `/settings/workspace` as an admin. Change the workspace name, save, reload — confirm it persisted. Visit as a member — confirm the layout redirects to `/settings/profile` (Task 6's admin gate).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/workspace/page.tsx
git commit -m "feat: add Workspace settings page"
```

---

### Task 12: Account page (functional — password change)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/account/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/me/password` from Task 2, `useAuth()` for the read-only email display.

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/account/page.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { Button } from '@/modules/shared/components/ui/Button';
import { Input, FormField } from '@/modules/shared/components/ui/FormField';

export default function AccountPage() {
  const { user } = useAuth();
  const getToken = useApiToken();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  async function handleChangePassword() {
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/me/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
        token,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch {
      setError('Current password is incorrect.');
    } finally {
      setIsSaving(false);
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Account</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Your login credentials.</p>

      <div style={card}>
        <FormField label="Email">
          <Input value={user.email} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
        </FormField>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: -8 }}>Email is your login identity and can&rsquo;t be changed here.</p>
      </div>

      <div style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Change password</h3>
        <FormField label="Current password">
          <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </FormField>
        <FormField label="New password">
          <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </FormField>
        <FormField label="Confirm new password" error={mismatch ? 'Passwords do not match.' : error ?? undefined}>
          <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </FormField>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" onClick={() => void handleChangePassword()} disabled={isSaving || !canSubmit}>
            {isSaving ? 'Updating…' : 'Update password'}
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Password updated</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Visit `/settings/account`. Try an incorrect current password — confirm the inline error appears. Use the correct current password with a new one ≥ 8 characters — confirm "Password updated" appears and the form clears.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/account/page.tsx
git commit -m "feat: add Account settings page with password change"
```

---

### Task 13: Security page (placeholder)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/security/page.tsx`

**Interfaces:**
- Consumes: `ComingSoonBadge` from Task 5.

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/security/page.tsx
'use client';

import { ComingSoonBadge } from '@/modules/shared/components/ui/ComingSoonBadge';

const ROWS = [
  { label: 'Two-factor authentication', description: 'Require a code from your phone when signing in.' },
  { label: 'Active sessions', description: 'See and revoke devices currently signed in.' },
];

export default function SecurityPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Security</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Extra protection for your account.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ROWS.map(row => (
          <div
            key={row.label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{row.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{row.description}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <ComingSoonBadge />
              <button
                disabled
                style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface2)', color: 'var(--text3)', fontSize: 13,
                  fontWeight: 500, cursor: 'not-allowed',
                }}
              >
                Enable
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Visit `/settings/security`. Expected: two rows, both with disabled "Enable" buttons and "Coming Soon" badges.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/security/page.tsx
git commit -m "feat: add Security settings placeholder page"
```

---

### Task 14: About page (static)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/about/page.tsx`

**Interfaces:**
- Consumes: `apps/web/package.json` (`version` field), imported directly (`resolveJsonModule` is already enabled in `apps/web/tsconfig.json`).

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/about/page.tsx
import webPackageJson from '../../../../package.json';

export default function AboutPage() {
  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
  };

  const links = [
    { label: 'Documentation', href: 'https://github.com/Kavin-Charles/Vencore#readme' },
    { label: 'Report an issue', href: 'https://github.com/Kavin-Charles/Vencore/issues' },
  ];

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>About</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Version and resources.</p>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Version</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{webPackageJson.version}</span>
        </div>
        {links.map(link => (
          <div key={link.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{link.label}</span>
            <a href={link.href} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'underline' }}>
              {link.href.replace('https://', '')}
            </a>
          </div>
        ))}
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 16, marginBottom: 0 }}>
          Vencore — One Platform to Run Your Entire Business.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Visit `/settings/about`. Expected: version number matches `apps/web/package.json`, links open in a new tab.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/about/page.tsx
git commit -m "feat: add About settings page"
```

---

### Task 15: Fix the duplicate dashboard title bug

**Files:**
- Modify: `apps/web/modules/dashboard/components/DashboardTabs.tsx`
- Modify: `apps/web/modules/dashboard/components/DashboardHeader.tsx`
- Modify: `apps/web/modules/dashboard/pages/[id]/page.tsx:127-146`

**Interfaces:**
- Produces: `DashboardHeader` gains a required `onCreateNew: () => void` prop. `DashboardTabs` loses its `onCreateNew` prop and the "+" button entirely.

- [ ] **Step 1: Simplify `DashboardTabs.tsx`**

Replace the full file:

```typescript
// apps/web/modules/dashboard/components/DashboardTabs.tsx
'use client';

import Link from 'next/link';
import type { DashboardSummary } from '../lib/dashboard-api';

interface Props {
  dashboards: DashboardSummary[];
  currentId: string;
}

export function DashboardTabs({ dashboards, currentId }: Props) {
  if (dashboards.length <= 1) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 28px',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}
    >
      {dashboards.map(d => {
        const active = d.id === currentId;
        return (
          <Link
            key={d.id}
            href={`/dashboard/${d.id}`}
            style={{
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--text)' : 'var(--text2)',
              borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {d.name}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add the create button to `DashboardHeader.tsx`**

In `DashboardHeader.tsx`, add `onCreateNew: () => void` to `Props` (between `onAddWidget` and `isSaving`):

```typescript
interface Props {
  name: string;
  isAdmin: boolean;
  isEditMode: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenGroupAssign: () => void;
  onAddWidget: () => void;
  onCreateNew: () => void;
  isSaving: boolean;
}
```

Add `onCreateNew` to the destructured props, and update the `!isEditMode` admin branch (currently lines 113-129) to render both buttons:

```typescript
        {isAdmin && !isEditMode && (
          <>
            <button
              onClick={onCreateNew}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text2)',
              }}
            >
              + New Dashboard
            </button>
            <button
              onClick={onToggleEdit}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              Edit Layout
            </button>
          </>
        )}
```

- [ ] **Step 3: Rewire `pages/[id]/page.tsx`**

Update the `DashboardHeader` call (currently lines 129-139):

```typescript
      <DashboardHeader
        name={dashboard.name}
        isAdmin={isAdmin ?? false}
        isEditMode={isEditMode}
        onToggleEdit={handleToggleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onOpenGroupAssign={() => setShowGroupAssign(true)}
        onAddWidget={() => setShowAddWidget(true)}
        onCreateNew={() => setShowCreate(true)}
        isSaving={isSaving}
      />
```

Update the `DashboardTabs` call (currently lines 141-146):

```typescript
      <DashboardTabs
        dashboards={allDashboards}
        currentId={dashboardId}
      />
```

- [ ] **Step 4: Manually verify**

Run: `pnpm --filter web dev`. As an admin with exactly one dashboard, visit `/dashboard/<id>`.
Expected: the dashboard name renders exactly once (in the header), no tab strip appears, and a "+ New Dashboard" button sits next to "Edit Layout". Create a second dashboard — confirm the tab strip now appears showing both dashboards, and the header still shows only the active dashboard's name once.

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/dashboard/components/DashboardTabs.tsx apps/web/modules/dashboard/components/DashboardHeader.tsx "apps/web/modules/dashboard/pages/[id]/page.tsx"
git commit -m "fix: stop rendering duplicate dashboard title for single-dashboard admins"
```

---

### Task 16: Dashboard loading skeleton and empty-state polish

**Files:**
- Modify: `apps/web/modules/dashboard/pages/[id]/page.tsx:119-125, 149-163`
- Modify: `apps/web/modules/dashboard/components/DashboardGrid.tsx:77-83`

**Interfaces:**
- Consumes: `.skeleton` and `.fade-in` CSS classes from Task 4.

- [ ] **Step 1: Replace the loading state in `pages/[id]/page.tsx`**

Replace the `isLoading || !dashboard` block (currently lines 119-125):

```typescript
  if (isLoading || !dashboard) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 28px 16px' }}>
          <div className="skeleton" style={{ width: 180, height: 26 }} />
        </div>
        <div style={{ flex: 1, padding: '8px 20px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{ height: 160 }} />
          ))}
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Add an icon and fade-in to the edit-mode empty state**

Replace the empty-state block (currently lines 149-163):

```typescript
        {isEditMode && currentLayout.length === 0 && (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              height: 200,
              border: '2px dashed var(--border)',
              borderRadius: 12,
              color: 'var(--text3)',
              fontSize: 14,
            }}
          >
            <Icon name="dashboard" size={28} color="var(--text3)" />
            Click &ldquo;+ Add Widget&rdquo; to add your first widget.
          </div>
        )}
```

Add the import at the top of the file (alongside the other imports):

```typescript
import { Icon } from '@/modules/shared/components/ui/Icon';
```

- [ ] **Step 3: Add an icon and fade-in to `DashboardGrid`'s view-mode empty state**

Replace the empty-state block in `DashboardGrid.tsx` (currently lines 77-83):

```typescript
  if (layoutRows.length === 0 && !isEditMode) {
    return (
      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '80px 0', color: 'var(--text3)', fontSize: 14 }}>
        <Icon name="dashboard" size={28} color="var(--text3)" />
        No widgets on this dashboard.
      </div>
    );
  }
```

Add the import at the top of `DashboardGrid.tsx`:

```typescript
import { Icon } from '@/modules/shared/components/ui/Icon';
```

- [ ] **Step 4: Manually verify**

Run: `pnpm --filter web dev`. Throttle the network in devtools and reload `/dashboard/<id>` — confirm a shimmering skeleton grid shows briefly instead of "Loading…". Remove all widgets in edit mode — confirm the dashed empty-state box now shows an icon above the text and fades in.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/modules/dashboard/pages/[id]/page.tsx" apps/web/modules/dashboard/components/DashboardGrid.tsx
git commit -m "feat: add loading skeleton and polished empty states to dashboard"
```

---

### Task 17: Widget add/remove enter animation

**Files:**
- Modify: `apps/web/modules/dashboard/components/WidgetCard.tsx:38-49`

**Interfaces:**
- Consumes: `.widget-card-enter` CSS class from Task 4.

- [ ] **Step 1: Add the animation class to the card root**

In `WidgetCard.tsx`, update the root `<div>` (currently lines 38-49):

```typescript
    <div
      className="widget-card-enter"
      style={{
        height: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
```

- [ ] **Step 2: Manually verify**

Run: `pnpm --filter web dev`. In edit mode, click "+ Add Widget" and add one.
Expected: the new widget card fades and scales in rather than appearing abruptly. Removing a widget should not error (the animation only applies on mount, which is acceptable — exit animations would require restructuring `DashboardGrid`'s list rendering, which is out of scope per the spec's "no layout-logic changes" constraint).

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/dashboard/components/WidgetCard.tsx
git commit -m "feat: add enter animation to dashboard widget cards"
```

---

### Task 18: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full API test suite**

Run: `pnpm --filter api test`
Expected: all tests pass, including the new `me.test.ts` and `workspace.test.ts`.

- [ ] **Step 2: Type-check both apps**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter api exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual walkthrough**

Run: `pnpm dev` (or the project's usual dev command) and walk through:
1. `/dashboard` as an admin with one dashboard — title appears once, "+ New Dashboard" works, create a second dashboard, confirm tabs now appear.
2. `/settings` — confirm the grouped sub-nav shows Personal / Account / Workspace (admin) / About, and as a non-admin the Workspace group is hidden entirely.
3. Toggle dark mode in `/settings/appearance`, reload the page, confirm it persists.
4. Change your name in `/settings/profile`, confirm it saves.
5. Change your password in `/settings/account` with a wrong current password (see the error), then with the correct one (see success).
6. Update workspace name/domain in `/settings/workspace` as admin.
7. Confirm `/settings/notifications`, `/settings/preferences`, `/settings/security` all render fully with disabled controls and "Coming Soon" badges — no blank pages, no console errors.

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: regression fixes from manual walkthrough"
```

(Skip this step if the walkthrough found nothing to fix.)
