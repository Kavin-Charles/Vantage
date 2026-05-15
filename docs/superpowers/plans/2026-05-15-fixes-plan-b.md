# Fixes Plan B — CRM Enhancements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four CRM enhancements: auto-log activities on CRM mutations, contact/deal search, deal CSV export UI button, and password reset web pages.

**Architecture:** New `logActivity` helper, query string additions to existing routes, new Next.js pages for auth flows.

**Tech Stack:** Node.js + Express + Kysely + Zod + Vitest (API). Next.js 14 App Router + React + inline styles (Web). pnpm workspace. Worktree at `D:/Projects/Vantage/.worktrees/fixes` on branch `feat/fixes-and-features`.

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/lib/log-activity.ts` | Create — fire-and-forget activity logger helper |
| `apps/api/src/routes/contacts.ts` | Import `logActivity`, call after POST and PATCH |
| `apps/api/src/routes/deals.ts` | Import `logActivity`, call after stage-change PATCH |
| `apps/api/src/routes/contacts.ts` | Add `q` (search) to `listQuerySchema` + query |
| `apps/api/src/routes/deals.ts` | Add `q` (search) to GET / query |
| `apps/web/app/(dashboard)/pipeline/page.tsx` | Add "Export CSV" button for deals |
| `apps/web/app/forgot-password/page.tsx` | Create — forgot-password form |
| `apps/web/app/reset-password/page.tsx` | Create — reset-password form with token from URL |
| `apps/web/app/login/page.tsx` | Add "Forgot password?" link |
| `apps/api/src/__tests__/log-activity.test.ts` | Unit tests for logActivity helper |

---

## Task 1: Auto-activity logging helper

**Files:**
- Create: `apps/api/src/lib/log-activity.ts`
- Create: `apps/api/src/__tests__/log-activity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/log-activity.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

function buildMockDb(returned = { id: 'act1' }) {
  const chain: Record<string, unknown> = {};
  for (const f of ['insertInto','values','returningAll','executeTakeFirstOrThrow']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(returned);
  return { insertInto: vi.fn().mockReturnValue(chain) };
}

describe('logActivity', () => {
  it('inserts an activity record', async () => {
    const db = buildMockDb();
    const { logActivity } = await import('../lib/log-activity');

    await logActivity(db as never, {
      workspace_id: 'ws1',
      user_id: 'u1',
      type: 'note',
      body: 'Created contact Alice',
      contact_id: 'c1',
    });

    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });

  it('does not throw if insert fails (fire-and-forget)', async () => {
    const chain: Record<string, unknown> = {};
    for (const f of ['insertInto','values','returningAll','executeTakeFirstOrThrow']) {
      chain[f] = vi.fn().mockReturnValue(chain);
    }
    chain['executeTakeFirstOrThrow'] = vi.fn().mockRejectedValue(new Error('DB down'));
    const db = { insertInto: vi.fn().mockReturnValue(chain) };
    const { logActivity } = await import('../lib/log-activity');

    // Should not throw
    await expect(
      logActivity(db as never, {
        workspace_id: 'ws1',
        user_id: 'u1',
        type: 'note',
        body: 'test',
      })
    ).resolves.not.toThrow();
  });

  it('accepts deal_change type with deal_id', async () => {
    const db = buildMockDb();
    const { logActivity } = await import('../lib/log-activity');

    await logActivity(db as never, {
      workspace_id: 'ws1',
      user_id: 'u1',
      type: 'deal_change',
      body: 'Deal moved to Closing',
      deal_id: 'd1',
      meta: { old_stage: 'Qualifying', new_stage: 'Closing' },
    });

    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/Vantage && pnpm --filter api test log-activity --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create the logActivity helper**

Create `apps/api/src/lib/log-activity.ts`:

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from './logger';

interface ActivityPayload {
  workspace_id: string;
  user_id: string;
  type: 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert';
  body?: string;
  contact_id?: string;
  deal_id?: string;
  meta?: Record<string, unknown>;
}

/**
 * Fire-and-forget activity logger.
 * Swallows errors — activity logging must never crash the parent request.
 */
export async function logActivity(
  db: Kysely<Database>,
  payload: ActivityPayload,
): Promise<void> {
  try {
    await db
      .insertInto('activities')
      .values({
        workspace_id: payload.workspace_id,
        user_id: payload.user_id,
        type: payload.type,
        body: payload.body ?? null,
        contact_id: payload.contact_id ?? null,
        deal_id: payload.deal_id ?? null,
        meta: payload.meta ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (err) {
    logger.error({ err }, 'logActivity: failed to insert activity');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/Vantage && pnpm --filter api test log-activity --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/lib/log-activity.ts apps/api/src/__tests__/log-activity.test.ts && git commit -m "feat(activity): add fire-and-forget logActivity helper"
```

---

## Task 2: Wire activity logging into contacts route

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`

Log activity after:
1. `POST /api/contacts` → type `note`, body `"Created contact {name}"`
2. `PATCH /api/contacts/:id` → type `note`, body `"Updated contact {name}"` (only if something changed)

- [ ] **Step 1: Add import and wire into contacts.ts**

At the top of `apps/api/src/routes/contacts.ts`, add the import:

```typescript
import { logActivity } from '../lib/log-activity';
```

In the `POST /` handler, after `res.status(201).json(...)` (but before it, fire-and-forget before responding):

Replace this block in the POST handler:
```typescript
      // Update workspace contact count
      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count + 1` })
        .where('id', '=', workspace.id)
        .execute();

      res.status(201).json({ data: contact, error: null });
```

With:
```typescript
      // Update workspace contact count
      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count + 1` })
        .where('id', '=', workspace.id)
        .execute();

      // Fire-and-forget activity log
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Created contact ${contact.name}`,
        contact_id: contact.id,
      });

      res.status(201).json({ data: contact, error: null });
```

In the `PATCH /:id` handler, after the update returns `contact`, before `res.json`:

Replace this block in the PATCH handler:
```typescript
      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }
      res.json({ data: contact, error: null });
```

With:
```typescript
      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: (req as unknown as AuthenticatedRequest).user.id,
        type: 'note',
        body: `Updated contact ${contact.name}`,
        contact_id: contact.id,
      });

      res.json({ data: contact, error: null });
```

- [ ] **Step 2: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing (logActivity is mocked by existing test structure or no tests import contacts route directly).

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/contacts.ts && git commit -m "feat(activity): auto-log activity on contact create and update"
```

---

## Task 3: Wire activity logging into deals route (stage changes)

**Files:**
- Modify: `apps/api/src/routes/deals.ts`

Log `deal_change` activity when deal stage changes (already detected in PATCH handler).

- [ ] **Step 1: Add import and wire into deals.ts**

At the top of `apps/api/src/routes/deals.ts`, add:

```typescript
import { logActivity } from '../lib/log-activity';
```

In the `PATCH /:id` handler, find the block that fires the webhook on stage change (around line 321–337):

```typescript
      // Fire webhook if stage changed
      if (
        parsed.data.stage_id &&
        currentDeal &&
        parsed.data.stage_id !== currentDeal.stage_id
      ) {
        queueWebhook(db, workspace.id, 'deal.stage_changed', {
          ...
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
      }
```

After the `queueWebhook` call (but still inside the `if` block), add:

```typescript
      // Fire webhook if stage changed
      if (
        parsed.data.stage_id &&
        currentDeal &&
        parsed.data.stage_id !== currentDeal.stage_id
      ) {
        queueWebhook(db, workspace.id, 'deal.stage_changed', {
          deal_id: req.params['id']!,
          deal_name: parsed.data.name ?? currentDeal.name,
          old_stage_id: currentDeal.stage_id,
          new_stage_id: parsed.data.stage_id,
          new_stage_name: targetStage?.name ?? null,
          value: parsed.data.value ?? currentDeal.value,
          owner_id: currentDeal.owner_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: currentDeal.owner_id,
          type: 'deal_change',
          body: targetStage
            ? `Deal moved to ${targetStage.name}`
            : 'Deal stage changed',
          deal_id: req.params['id']!,
          meta: {
            old_stage_id: currentDeal.stage_id,
            new_stage_id: parsed.data.stage_id,
            new_stage_name: targetStage?.name ?? null,
          },
        });
      }
```

- [ ] **Step 2: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/deals.ts && git commit -m "feat(activity): auto-log deal_change activity on stage transitions"
```

---

## Task 4: Add contact and deal search

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`
- Modify: `apps/api/src/routes/deals.ts`

### Contacts search

Add `q` to `listQuerySchema` in contacts.ts:

```typescript
const listQuerySchema = z.object({
  page: z.coerce.number().default(1),
  per_page: z.coerce.number().max(100).default(25),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).optional(),
  owner_id: z.string().uuid().optional(),
  q: z.string().optional(),
});
```

In the GET / handler, after the `if (owner_id)` line, add:

```typescript
      if (q) {
        const pattern = `%${q}%`;
        query = query.where(eb =>
          eb.or([
            eb('name', 'ilike', pattern),
            eb('email', 'ilike', pattern),
          ])
        );
        countQuery = countQuery.where(eb =>
          eb.or([
            eb('name', 'ilike', pattern),
            eb('email', 'ilike', pattern),
          ])
        );
      }
```

### Deals search

In the GET / handler in deals.ts, add `q` extraction:

```typescript
      const q = req.query['q'] as string | undefined;
```

After the `if (owner_id)` line:

```typescript
      if (q) query = query.where('name', 'ilike', `%${q}%`);
```

- [ ] **Step 1: Apply contacts search changes**

In `apps/api/src/routes/contacts.ts`:

1. Add `q: z.string().optional()` to `listQuerySchema`
2. Destructure `q` from `parsed.data`: `const { page, per_page, status, owner_id, q } = listQuerySchema.parse(req.query);`
3. After `if (owner_id) ...` in both `query` and `countQuery`, add:

```typescript
      if (q) {
        const pattern = `%${q}%`;
        query = query.where(eb =>
          eb.or([
            eb('name', 'ilike', pattern),
            eb('email', 'ilike', pattern),
          ]),
        );
        countQuery = countQuery.where(eb =>
          eb.or([
            eb('name', 'ilike', pattern),
            eb('email', 'ilike', pattern),
          ]),
        );
      }
```

- [ ] **Step 2: Apply deals search changes**

In `apps/api/src/routes/deals.ts` GET / handler:

1. After `const owner_id = req.query['owner_id'] as string | undefined;`, add:
   `const q = req.query['q'] as string | undefined;`

2. After `if (owner_id) query = query.where('owner_id', '=', owner_id);`, add:
   `if (q) query = query.where('name', 'ilike', `%${q}%`);`

- [ ] **Step 3: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/contacts.ts apps/api/src/routes/deals.ts && git commit -m "feat(search): add q= search param to contacts and deals list endpoints"
```

---

## Task 5: Deal CSV export button in pipeline UI

**Files:**
- Modify: `apps/web/app/(dashboard)/pipeline/page.tsx`

The API endpoint `GET /api/deals/export?pipeline_id=<id>` already exists. Add an "Export CSV" button that triggers a browser download.

- [ ] **Step 1: Read the pipeline page**

Read `apps/web/app/(dashboard)/pipeline/page.tsx` to understand current structure before editing.

- [ ] **Step 2: Add export button**

In the pipeline page, find the topbar/header area where the "Create Deal" button lives. Add an "Export CSV" button next to it that:
1. Uses `window.location.href` to trigger the download (simplest approach — no fetch needed, browser handles the attachment header)
2. Requires the current `pipeline_id` from state/query

Find the section where the action button is rendered (typically passed as `action` prop to `<Topbar>`) and add alongside it:

```tsx
<button
  onClick={() => {
    if (!selectedPipelineId) return;
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/deals/export?pipeline_id=${selectedPipelineId}`;
  }}
  style={{
    padding: '7px 14px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text2)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  }}
>
  Export CSV
</button>
```

Note: The pipeline page uses a variable for the current pipeline id (likely `selectedPipeline?.id` or similar — read the file first to determine the exact variable name).

- [ ] **Step 3: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -10
```

Expected: All passing (this is a frontend change only, no API tests affected).

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/web/app/"(dashboard)"/pipeline/page.tsx && git commit -m "feat(deals): add Export CSV button to pipeline view"
```

---

## Task 6: Password reset web pages

**Files:**
- Create: `apps/web/app/forgot-password/page.tsx`
- Create: `apps/web/app/reset-password/page.tsx`
- Modify: `apps/web/app/login/page.tsx`

The API already has `POST /api/auth/forgot` and `POST /api/auth/reset/:token`. We only need the web UI.

- [ ] **Step 1: Create forgot-password page**

Create `apps/web/app/forgot-password/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/api/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 360,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
      }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Forgot password
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            Enter your email and we'll send a reset link.
          </div>
        </div>

        {submitted ? (
          <div>
            <div style={{
              background: 'var(--green-bg)',
              border: '1px solid var(--green)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--green)',
              marginBottom: 16,
            }}>
              If that email is registered, you'll receive a reset link shortly.
            </div>
            <Link href="/login" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 16px', borderRadius: 7, border: 'none',
                background: 'var(--text)', color: '#fff', fontSize: 14,
                fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <Link href="/login" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none', textAlign: 'center' }}>
              ← Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create reset-password page**

Create `apps/web/app/reset-password/page.tsx`:

```tsx
'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--red)', padding: 32, fontSize: 14 }}>
        Invalid or missing reset token.
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    try {
      await apiFetch(`/api/auth/reset/${token}`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('This link has expired or is invalid. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{
        background: 'var(--green-bg)', border: '1px solid var(--green)',
        borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--green)',
      }}>
        Password reset successfully. Redirecting to sign in…
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        Set new password
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
          New password
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
          Confirm password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 7 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '9px 16px', borderRadius: 7, border: 'none',
          background: 'var(--text)', color: '#fff', fontSize: 14,
          fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 360,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
      }}>
        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add "Forgot password?" link to login page**

In `apps/web/app/login/page.tsx`, find the password field section and add a link below the password `<div>`:

After the `</div>` that closes the password field group (before the error block), add:

```tsx
          <div style={{ textAlign: 'right', marginTop: -6 }}>
            <Link href="/forgot-password" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>
```

Also add the `Link` import at the top of `login/page.tsx`:
```tsx
import Link from 'next/link';
```

- [ ] **Step 4: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -10
```

Expected: All passing (frontend pages only, no API tests affected).

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/web/app/forgot-password apps/web/app/reset-password apps/web/app/login/page.tsx && git commit -m "feat(auth): add forgot-password and reset-password web pages"
```
