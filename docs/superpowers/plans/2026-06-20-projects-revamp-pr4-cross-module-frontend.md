# PR4 Cross-module Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend for PR4's cross-module features: approval request UI inside the project portal, a standalone approve/reject landing page for email links, linked-project cards in CRM contact and deal drawers, and a cross-module integration settings page with feature toggles.

**Architecture:** New components (`ApprovalBadge`, `ApprovalRequestModal`, `ApprovalsPanel`, `LinkedProjectCard`) extend the existing project module. The standalone approve page lives under `app/(portal)/portal/approve/[token]/` — a separate Next.js segment that does NOT inherit the existing portal `[token]` layout. CRM drawers (`ContactDrawer`, `ItemDetail`) each get a slim "Projects" section using `LinkedProjectCard`. The integration settings page reads and writes via the `crossModuleApi` singleton. A single `@keyframes fadeInUp` entry animation applies to all new list items.

**Tech Stack:** Next.js App Router, React, TanStack Query v5, CSS custom properties (no animation library — CSS transitions only), TypeScript strict, `apiFetch` from `@vencore/api-client`.

**Prerequisite:** PR4 backend (plan `2026-06-20-projects-revamp-pr4-cross-module-backend.md`) must be fully applied before this plan. Specifically, the following API endpoints must exist:
- `GET  /api/projects/:id/portal/:portalId/approvals`
- `POST /api/projects/:id/portal/:portalId/approvals`
- `GET  /api/portal/approve/:token`
- `POST /api/portal/approve/:token`
- `GET  /api/workspace/cross-module-settings`
- `GET  /api/workspace/cross-module-settings/:key`
- `PATCH /api/workspace/cross-module-settings/:key`
- `GET  /api/projects?contact_id=` and `GET /api/projects?deal_id=`

**Note on backend gap:** PR4 backend plan Task 11 adds `POST /:portalId/approvals` to the internal portal router but does **not** add the corresponding `GET`. Task 0 of this plan patches that gap in `portal.ts` before any frontend work begins.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/routes/portal.ts` | Modify | Add `GET /:portalId/approvals` to `createPortalInternalRouter` |
| `apps/api/src/routes/portal.test.ts` | Modify | Test for GET /:portalId/approvals |
| `apps/web/modules/projects/lib/api.ts` | Modify | Add `ApprovalRequest`, `CrossModuleSetting`, `ApproveTokenInfo` types; extend `pmApi`; add `crossModuleApi`, `portalApproveApi` |
| `apps/web/modules/projects/components/ApprovalBadge.tsx` | Create | Compact amber/green badge showing pending approval count |
| `apps/web/modules/projects/components/ApprovalRequestModal.tsx` | Create | Modal: create an approval request for a portal (with optional email) |
| `apps/web/modules/projects/components/ApprovalsPanel.tsx` | Create | Scrollable list of approval requests for one portal; opens modal |
| `apps/web/modules/projects/pages/PortalSettingsPage.tsx` | Modify | Add expandable "Approvals" section per portal card |
| `apps/web/app/(portal)/portal/approve/[token]/page.tsx` | Create | Standalone public approve/reject landing page |
| `apps/web/modules/projects/components/LinkedProjectCard.tsx` | Create | Compact linked-project card used in CRM drawers |
| `apps/web/modules/contacts/components/ContactDrawer.tsx` | Modify | Add "Projects" section using `LinkedProjectCard` |
| `apps/web/modules/pipeline/components/detail/ItemDetail.tsx` | Modify | Add "Project" section using `LinkedProjectCard` |
| `apps/web/app/(dashboard)/settings/layout.tsx` | Modify | Add "Integrations" tab (admin-only) |
| `apps/web/app/(dashboard)/settings/integrations/page.tsx` | Create | Cross-module settings: four toggle cards, each hitting `crossModuleApi` |

---

## Task 0: Backend gap — add `GET /:portalId/approvals` to portal.ts

PR4 backend plan added `POST /:portalId/approvals` but not the list endpoint. Fix it here before the frontend can consume it.

**Files:**
- Modify: `apps/api/src/routes/portal.ts`
- Modify: `apps/api/src/routes/portal.test.ts`

- [ ] **Step 1: Write the failing test**

Append this block at the end of the `describe('createPortalInternalRouter')` block in `apps/api/src/routes/portal.test.ts`:

```typescript
describe('GET /:portalId/approvals', () => {
  it('returns 200 with approvals list', async () => {
    const portalId = 'portal-1';
    const projectId = 'proj-1';

    // db.selectFrom('portal_links') returns the portal with matching project
    // db.selectFrom('approval_requests') returns one row
    const db = {
      selectFrom: vi.fn().mockImplementation((table: string) => {
        if (table === 'portal_links') {
          return {
            where: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ id: portalId, project_id: projectId }),
          };
        }
        if (table === 'approval_requests') {
          return {
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            selectAll: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([
              { id: 'ar-1', portal_id: portalId, project_id: projectId, task_id: null, milestone_id: null, attachment_id: null, recipient_email: null, status: 'PENDING', note: null, responded_at: null, created_at: new Date() },
            ]),
          };
        }
        return { where: vi.fn().mockReturnThis(), selectAll: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue([]) };
      }),
    };

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/portal', mockPermission(), createPortalInternalRouter(db as any, null, 'test-secret'));

    const res = await request(app).get(`/api/projects/${projectId}/portal/${portalId}/approvals`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('ar-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm vitest run src/routes/portal.test.ts --reporter=verbose 2>&1 | tail -20
```
Expected: FAIL — `GET /:portalId/approvals` 404

- [ ] **Step 3: Add GET /:portalId/approvals to createPortalInternalRouter**

In `apps/api/src/routes/portal.ts`, locate the line that starts `router.post('/:portalId/approvals', ...` inside `createPortalInternalRouter`. Insert this block **immediately before** it:

```typescript
  // GET /api/projects/:projectId/portal/:portalId/approvals — list approval requests (internal)
  router.get('/:portalId/approvals', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { projectId, portalId } = req.params as { projectId: string; portalId: string };

      const portal = await db
        .selectFrom('portal_links')
        .where('id', '=', portalId)
        .where('project_id', '=', projectId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!portal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const approvals = await db
        .selectFrom('approval_requests')
        .where('portal_id', '=', portalId)
        .where('project_id', '=', projectId)
        .orderBy('created_at', 'desc')
        .selectAll()
        .execute();

      res.json({ data: approvals, error: null });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm vitest run src/routes/portal.test.ts --reporter=verbose 2>&1 | tail -20
```
Expected: PASS for all portal tests including the new GET /:portalId/approvals test.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/routes/portal.ts apps/api/src/routes/portal.test.ts
rtk git commit -m "feat(portal): add GET /:portalId/approvals internal route"
```

---

## Task 1: Extend API layer — types and pmApi/crossModuleApi/portalApproveApi

**Files:**
- Modify: `apps/web/modules/projects/lib/api.ts`

- [ ] **Step 1: Write the compile-time test**

Create `apps/web/modules/projects/lib/__tests__/api-types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { ApprovalRequest, CrossModuleSetting, ApproveTokenInfo } from '../api';
import { crossModuleApi, portalApproveApi } from '../api';

describe('api type exports', () => {
  it('ApprovalRequest has status field', () => {
    expectTypeOf<ApprovalRequest['status']>().toEqualTypeOf<'PENDING' | 'APPROVED' | 'REJECTED'>();
  });
  it('CrossModuleSetting has enabled boolean', () => {
    expectTypeOf<CrossModuleSetting['enabled']>().toBeBoolean();
  });
  it('ApproveTokenInfo has action field', () => {
    expectTypeOf<ApproveTokenInfo['action']>().toEqualTypeOf<'approve' | 'reject'>();
  });
  it('crossModuleApi.list is a function', () => {
    expectTypeOf(crossModuleApi.list).toBeFunction();
  });
  it('portalApproveApi.getInfo is a function', () => {
    expectTypeOf(portalApproveApi.getInfo).toBeFunction();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run modules/projects/lib/__tests__/api-types.test.ts 2>&1 | tail -20
```
Expected: FAIL — named exports `ApprovalRequest`, `CrossModuleSetting`, `ApproveTokenInfo`, `crossModuleApi`, `portalApproveApi` do not exist yet.

- [ ] **Step 3: Extend api.ts**

Replace the entire content of `apps/web/modules/projects/lib/api.ts` with:

```typescript
import { apiFetch } from '@/modules/shared/lib/api';

export interface Project {
  id: string; workspace_id: string; name: string; description: string | null;
  cover_image: string | null; color: string | null; status: string; health: string;
  start_date: string | null; end_date: string | null; budget: string | null;
  created_by: string; created_at: string; updated_at: string;
}
export interface ProjectWithProgress extends Project { progress: number }
export interface TaskStatus { id: string; project_id: string; name: string; color: string; position: number; is_done: boolean }
export interface Task {
  id: string; project_id: string; parent_id: string | null; status_id: string; title: string;
  description: string | null; priority: string; due_date: string | null; start_date: string | null;
  estimate_hours: string | null; estimated_minutes: number | null;
  client_visible: boolean; position: number; created_at: string; updated_at: string;
}
export interface TaskWithAssignees extends Task { assignees: { id: string; name: string; email: string }[] }
export interface Comment { id: string; task_id: string; body: string | null; parent_id: string | null; created_at: string; author_name: string | null }
export interface ProjectMember { id: string; project_id: string; user_id: string; role: string; joined_at: string; name: string | null; email: string | null }
export interface TaskLabel { id: string; project_id: string; name: string; color: string }
export interface Milestone { id: string; project_id: string; name: string; description: string | null; due_date: string; status: string; client_visible: boolean; position: number }
export interface CreateTaskBody { title: string; status_id?: string; priority?: string; assignee_ids?: string[]; due_date?: string | null }

// ── Cross-module types ─────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  project_id: string;
  portal_id: string;
  task_id: string | null;
  milestone_id: string | null;
  attachment_id: string | null;
  recipient_email: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface CrossModuleSetting {
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface ApproveTokenInfo {
  action: 'approve' | 'reject';
  project_name: string;
  already_responded: boolean;
}

// ── pmApi ─────────────────────────────────────────────────────────────────────

export const pmApi = {
  listLabels: (token: string, projectId: string) =>
    apiFetch<{ data: TaskLabel[] }>(`/api/projects/${projectId}/labels`, { token }),
  createLabel: (token: string, projectId: string, body: { name: string; color: string }) =>
    apiFetch<{ data: TaskLabel }>(`/api/projects/${projectId}/labels`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateLabel: (token: string, projectId: string, labelId: string, body: Partial<TaskLabel>) =>
    apiFetch<{ data: TaskLabel }>(`/api/projects/${projectId}/labels/${labelId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteLabel: (token: string, projectId: string, labelId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/labels/${labelId}`, { token, method: 'DELETE' }),
  listMilestones: (token: string, projectId: string) =>
    apiFetch<{ data: Milestone[] }>(`/api/projects/${projectId}/milestones`, { token }),
  createMilestone: (token: string, projectId: string, body: { name: string; due_date: string; description?: string; client_visible?: boolean }) =>
    apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateMilestone: (token: string, projectId: string, milestoneId: string, body: Partial<Milestone>) =>
    apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones/${milestoneId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  listProjects: (token: string, params?: Record<string, string>) =>
    apiFetch<{ data: ProjectWithProgress[] }>(`/api/projects${params ? '?' + new URLSearchParams(params) : ''}`, { token }),
  getProject: (token: string, id: string) =>
    apiFetch<{ data: ProjectWithProgress }>(`/api/projects/${id}`, { token }),
  createProject: (token: string, body: { name: string; color?: string; start_date?: string; end_date?: string }) =>
    apiFetch<{ data: Project }>('/api/projects', { token, method: 'POST', body: JSON.stringify(body) }),
  updateProject: (token: string, id: string, body: Partial<Project>) =>
    apiFetch<{ data: Project }>(`/api/projects/${id}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (token: string, id: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${id}`, { token, method: 'DELETE' }),
  listStatuses: (token: string, projectId: string) =>
    apiFetch<{ data: TaskStatus[] }>(`/api/projects/${projectId}/tasks/statuses`, { token }),
  listTasks: (token: string, projectId: string, params?: Record<string, string>) =>
    apiFetch<{ data: TaskWithAssignees[] }>(`/api/projects/${projectId}/tasks${params ? '?' + new URLSearchParams(params) : ''}`, { token }),
  getTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: TaskWithAssignees }>(`/api/projects/${projectId}/tasks/${taskId}`, { token }),
  createTask: (token: string, projectId: string, body: CreateTaskBody) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateTask: (token: string, projectId: string, taskId: string, body: Partial<Task>) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'DELETE' }),
  listComments: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: Comment[] }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token }),
  createComment: (token: string, projectId: string, taskId: string, body: string) =>
    apiFetch<{ data: Comment }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token, method: 'POST', body: JSON.stringify({ body }) }),
  listMembers: (token: string, projectId: string) =>
    apiFetch<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`, { token }),

  // Approvals (internal — PM manager view)
  listApprovals: (token: string, projectId: string, portalId: string) =>
    apiFetch<{ data: ApprovalRequest[] }>(`/api/projects/${projectId}/portal/${portalId}/approvals`, { token }),
  createApproval: (
    token: string,
    projectId: string,
    portalId: string,
    body: { task_id?: string; milestone_id?: string; attachment_id?: string; note?: string; recipient_email?: string },
  ) =>
    apiFetch<{ data: ApprovalRequest }>(`/api/projects/${projectId}/portal/${portalId}/approvals`, { token, method: 'POST', body: JSON.stringify(body) }),

  // CRM project links
  listProjectsByContact: (token: string, contactId: string) =>
    apiFetch<{ data: ProjectWithProgress[] }>(`/api/projects?contact_id=${encodeURIComponent(contactId)}`, { token }),
  listProjectsByDeal: (token: string, dealId: string) =>
    apiFetch<{ data: ProjectWithProgress[] }>(`/api/projects?deal_id=${encodeURIComponent(dealId)}`, { token }),
};

// ── crossModuleApi ─────────────────────────────────────────────────────────────

export const crossModuleApi = {
  list: (token: string) =>
    apiFetch<{ data: CrossModuleSetting[] }>('/api/workspace/cross-module-settings', { token }),
  get: (token: string, key: string) =>
    apiFetch<{ data: CrossModuleSetting }>(`/api/workspace/cross-module-settings/${key}`, { token }),
  patch: (token: string, key: string, body: { enabled?: boolean; config?: Record<string, unknown> }) =>
    apiFetch<{ data: CrossModuleSetting }>(`/api/workspace/cross-module-settings/${key}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
};

// ── portalApproveApi (public — no auth token) ──────────────────────────────────

export const portalApproveApi = {
  getInfo: async (jwtToken: string): Promise<{ data: ApproveTokenInfo | null; error: { code: string; message?: string } | null }> => {
    const res = await fetch(`/api/portal/approve/${jwtToken}`);
    return res.json() as Promise<{ data: ApproveTokenInfo | null; error: { code: string; message?: string } | null }>;
  },
  submit: async (jwtToken: string): Promise<{ data: { success: boolean } | null; error: { code: string; message?: string } | null }> => {
    const res = await fetch(`/api/portal/approve/${jwtToken}`, { method: 'POST' });
    return res.json() as Promise<{ data: { success: boolean } | null; error: { code: string; message?: string } | null }>;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run modules/projects/lib/__tests__/api-types.test.ts 2>&1 | tail -20
```
Expected: PASS (5 tests).

Also run TypeScript check:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to `api.ts`.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/modules/projects/lib/api.ts apps/web/modules/projects/lib/__tests__/api-types.test.ts
rtk git commit -m "feat(projects/api): add approval, cross-module, and portal-approve API methods"
```

---

## Task 2: ApprovalBadge component

**Files:**
- Create: `apps/web/modules/projects/components/ApprovalBadge.tsx`

- [ ] **Step 1: Write the failing TypeScript import test**

Add to `apps/web/modules/projects/lib/__tests__/api-types.test.ts` (or verify the import below compiles):

Open `apps/web/modules/projects/pages/PortalSettingsPage.tsx` and add this import at the top as a test:
```typescript
import { ApprovalBadge } from '@/modules/projects/components/ApprovalBadge';
```
Then run:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep ApprovalBadge
```
Expected: error — module not found.

- [ ] **Step 2: Create ApprovalBadge.tsx**

```typescript
// apps/web/modules/projects/components/ApprovalBadge.tsx
'use client';

interface Props {
  pending: number;
  total: number;
}

export function ApprovalBadge({ pending, total }: Props) {
  if (total === 0) return null;
  return (
    <span
      style={{
        fontFamily: 'DM Sans',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 20,
        background: pending > 0 ? 'var(--amber-bg, #fef3c7)' : 'var(--green-bg, #d8f3dc)',
        color: pending > 0 ? 'var(--amber, #92400e)' : 'var(--green, #2d6a4f)',
        flexShrink: 0,
      }}
    >
      {pending > 0 ? `${pending} pending` : `${total} done`}
    </span>
  );
}
```

- [ ] **Step 3: Run TypeScript to verify it passes**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -20
```
Expected: no errors from `ApprovalBadge.tsx`.

- [ ] **Step 4: Remove the temporary test import from PortalSettingsPage.tsx**

Delete the `import { ApprovalBadge }` line you added in Step 1 (it was only to trigger a compile error for the test). The real import will come in Task 4.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/modules/projects/components/ApprovalBadge.tsx
rtk git commit -m "feat(projects): add ApprovalBadge component"
```

---

## Task 3: ApprovalRequestModal component

**Files:**
- Create: `apps/web/modules/projects/components/ApprovalRequestModal.tsx`

- [ ] **Step 1: Write the failing import test**

Add this temporary import to `apps/web/modules/projects/pages/PortalSettingsPage.tsx`:
```typescript
import { ApprovalRequestModal } from '@/modules/projects/components/ApprovalRequestModal';
```
Run:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep ApprovalRequestModal
```
Expected: error — module not found.

- [ ] **Step 2: Create ApprovalRequestModal.tsx**

```typescript
// apps/web/modules/projects/components/ApprovalRequestModal.tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi } from '@/modules/projects/lib/api';

interface Props {
  projectId: string;
  portalId: string;
  onClose: () => void;
}

const INPUT: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13, padding: '8px 10px',
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
  color: 'var(--text2)', display: 'block', marginBottom: 6,
};

export function ApprovalRequestModal({ projectId, portalId, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    task_id: '',
    milestone_id: '',
    note: '',
    recipient_email: '',
  });

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => pmApi.listTasks(await getToken(), projectId),
  });

  const { data: milestonesData } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => pmApi.listMilestones(await getToken(), projectId),
  });

  const mut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.createApproval(token, projectId, portalId, {
        task_id: form.task_id || undefined,
        milestone_id: form.milestone_id || undefined,
        note: form.note.trim() || undefined,
        recipient_email: form.recipient_email.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals', projectId, portalId] });
      onClose();
    },
  });

  const tasks = tasksData?.data ?? [];
  const milestones = milestonesData?.data ?? [];

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300 }}
      />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 301, width: 460, maxWidth: '90vw',
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)', margin: 0 }}>
            New Approval Request
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL}>
              Linked Task{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span>
            </label>
            <select
              value={form.task_id}
              onChange={e => setForm(f => ({ ...f, task_id: e.target.value }))}
              style={{ ...INPUT, cursor: 'pointer' }}
            >
              <option value="">— None —</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL}>
              Linked Milestone{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span>
            </label>
            <select
              value={form.milestone_id}
              onChange={e => setForm(f => ({ ...f, milestone_id: e.target.value }))}
              style={{ ...INPUT, cursor: 'pointer' }}
            >
              <option value="">— None —</option>
              {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL}>
              Note{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span>
            </label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              rows={3}
              placeholder="Describe what needs approval…"
              style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          <div>
            <label style={LABEL}>
              Send approval link to{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional — client will get email with approve/reject links)</span>
            </label>
            <input
              type="email"
              value={form.recipient_email}
              onChange={e => setForm(f => ({ ...f, recipient_email: e.target.value }))}
              placeholder="client@example.com"
              style={INPUT}
            />
          </div>

          {mut.isError && (
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: 0 }}>
              Failed to create approval request.
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, padding: '8px 16px',
                borderRadius: 8, background: 'none',
                color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                padding: '8px 16px', borderRadius: 8,
                background: 'var(--text)', color: '#fff',
                border: 'none', cursor: 'pointer',
                opacity: mut.isPending ? 0.6 : 1,
              }}
            >
              {mut.isPending ? 'Creating…' : 'Create Request'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Run TypeScript to verify it passes**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Remove the temporary test import from PortalSettingsPage.tsx**

Delete the `import { ApprovalRequestModal }` line added in Step 1.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/modules/projects/components/ApprovalRequestModal.tsx
rtk git commit -m "feat(projects): add ApprovalRequestModal component"
```

---

## Task 4: ApprovalsPanel + PortalSettingsPage integration

**Files:**
- Create: `apps/web/modules/projects/components/ApprovalsPanel.tsx`
- Modify: `apps/web/modules/projects/pages/PortalSettingsPage.tsx`

- [ ] **Step 1: Create ApprovalsPanel.tsx**

```typescript
// apps/web/modules/projects/components/ApprovalsPanel.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi } from '@/modules/projects/lib/api';
import type { ApprovalRequest } from '@/modules/projects/lib/api';
import { ApprovalBadge } from './ApprovalBadge';
import { ApprovalRequestModal } from './ApprovalRequestModal';

interface Props {
  projectId: string;
  portalId: string;
}

const STATUS_STYLES: Record<ApprovalRequest['status'], { bg: string; color: string; label: string }> = {
  PENDING:  { bg: 'var(--amber-bg, #fef3c7)',  color: 'var(--amber, #92400e)',  label: 'Pending'  },
  APPROVED: { bg: 'var(--green-bg, #d8f3dc)',  color: 'var(--green, #2d6a4f)',  label: 'Approved' },
  REJECTED: { bg: 'var(--red-bg, #fee2e2)',    color: 'var(--red, #991b1b)',    label: 'Rejected' },
};

export function ApprovalsPanel({ projectId, portalId }: Props) {
  const getToken = useApiToken();
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', projectId, portalId],
    queryFn: async () => pmApi.listApprovals(await getToken(), projectId, portalId),
  });

  const approvals = data?.data ?? [];
  const pending = approvals.filter(a => a.status === 'PENDING').length;

  return (
    <>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Approvals
          </span>
          <ApprovalBadge pending={pending} total={approvals.length} />
          <button
            onClick={() => setShowModal(true)}
            style={{
              marginLeft: 'auto',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
              padding: '4px 10px', borderRadius: 6,
              background: 'var(--text)', color: '#fff',
              border: 'none', cursor: 'pointer',
            }}
          >
            + New Request
          </button>
        </div>

        {isLoading && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
        )}

        {!isLoading && approvals.length === 0 && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
            No approval requests yet.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {approvals.map((a, i) => {
            const s = STATUS_STYLES[a.status];
            return (
              <div
                key={a.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bg)', borderRadius: 8,
                  border: '1px solid var(--border)',
                  animation: 'fadeInUp .22s ease both',
                  animationDelay: `${i * 25}ms`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                    Requested {new Date(a.created_at).toLocaleDateString()}
                    {a.recipient_email && (
                      <span style={{ marginLeft: 8, color: 'var(--text3)' }}>→ {a.recipient_email}</span>
                    )}
                  </div>
                  {a.note && (
                    <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)', margin: '4px 0 0', fontStyle: 'italic' }}>
                      "{a.note}"
                    </p>
                  )}
                  {a.responded_at && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                      Responded {new Date(a.responded_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                    padding: '2px 8px', borderRadius: 20,
                    background: s.bg, color: s.color, flexShrink: 0,
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <ApprovalRequestModal
          projectId={projectId}
          portalId={portalId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Run TypeScript to verify ApprovalsPanel compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Modify PortalSettingsPage.tsx to integrate ApprovalsPanel**

Add this import near the top of `apps/web/modules/projects/pages/PortalSettingsPage.tsx`, after the existing imports:

```typescript
import { ApprovalsPanel } from '@/modules/projects/components/ApprovalsPanel';
```

Then, inside the portals map (the `{portals.map(portal => (...))}` block), add the `ApprovalsPanel` as the last child inside the portal card `<div>`. Locate the closing `</div>` of the portal card (the one with `opacity: portal.is_active ? 1 : 0.55`), and before it insert:

```tsx
{portal.is_active && (
  <ApprovalsPanel projectId={projectId} portalId={portal.id} />
)}
```

The full modified portal card block (replacing the existing one at the bottom of the `portals.map` call) looks like this:

```tsx
<div
  key={portal.id}
  style={{
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '14px 16px',
    opacity: portal.is_active ? 1 : 0.55,
  }}
>
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {portal.label}
        </span>
        {!portal.is_active && (
          <span style={{
            fontFamily: 'DM Sans', fontSize: 11, padding: '2px 7px',
            borderRadius: 5, background: 'var(--surface2)', color: 'var(--text3)',
          }}>
            Revoked
          </span>
        )}
      </div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {getPortalUrl(portal.token)}
      </div>
      {portal.last_accessed && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
          Last accessed {new Date(portal.last_accessed).toLocaleDateString()}
        </div>
      )}
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {portal.is_active && (
        <button
          onClick={() => copyUrl(portal.token)}
          style={{
            fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
            padding: '6px 10px', borderRadius: 6,
            background: copied === portal.token ? 'var(--green-bg, #d8f3dc)' : 'var(--surface2)',
            color: copied === portal.token ? 'var(--green)' : 'var(--text2)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          {copied === portal.token ? 'Copied!' : 'Copy URL'}
        </button>
      )}
      {portal.is_active && (
        <button
          onClick={() => { if (confirm('Revoke this portal link? The client will lose access.')) revokeMutation.mutate(portal.id); }}
          style={{
            fontFamily: 'DM Sans', fontSize: 12,
            padding: '6px 10px', borderRadius: 6,
            background: 'transparent', color: 'var(--red)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          Revoke
        </button>
      )}
    </div>
  </div>

  {portal.is_active && (
    <ApprovalsPanel projectId={projectId} portalId={portal.id} />
  )}
</div>
```

- [ ] **Step 4: Run TypeScript to verify**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/modules/projects/components/ApprovalsPanel.tsx apps/web/modules/projects/pages/PortalSettingsPage.tsx
rtk git commit -m "feat(projects): add ApprovalsPanel and integrate into portal settings"
```

---

## Task 5: Standalone approve/reject landing page

This page lives at `/portal/approve/:token` (a different URL pattern from `/portal/:token/*`). It is public — no auth required. The `token` here is a signed JWT from the approval email, not a portal session token.

**Files:**
- Create: `apps/web/app/(portal)/portal/approve/[token]/page.tsx`

- [ ] **Step 1: Verify the route will not conflict with the existing portal layout**

Run:
```bash
ls "apps/web/app/(portal)/portal/"
```
Expected output includes `[token]/` and nothing named `approve`. Next.js resolves static segments ("approve") before dynamic ones (`[token]`), so `/portal/approve/xxx` will NOT match `app/(portal)/portal/[token]/` — it will be a 404 until we create `approve/[token]/page.tsx`. The existing `[token]` layout at `app/(portal)/portal/[token]/layout.tsx` will NOT wrap this new page.

- [ ] **Step 2: Create the approve landing page**

Create `apps/web/app/(portal)/portal/approve/[token]/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { portalApproveApi } from '@/modules/projects/lib/api';
import type { ApproveTokenInfo } from '@/modules/projects/lib/api';

type PageState = 'loading' | 'ready' | 'done' | 'error';

export default function ApprovePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [info, setInfo] = useState<ApproveTokenInfo | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneAction, setDoneAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (!token) return;
    portalApproveApi.getInfo(token).then(json => {
      if (json.error || !json.data) {
        setError(json.error?.message ?? 'Invalid or expired link.');
        setState('error');
        return;
      }
      if (json.data.already_responded) {
        setState('done');
        setDoneAction(json.data.action);
        setInfo(json.data);
        return;
      }
      setInfo(json.data);
      setState('ready');
    }).catch(() => {
      setError('Failed to load approval request.');
      setState('error');
    });
  }, [token]);

  async function handleSubmit() {
    if (!token || !info) return;
    setSubmitting(true);
    try {
      const json = await portalApproveApi.submit(token);
      if (json.error) {
        setError(json.error.message ?? 'Something went wrong.');
        return;
      }
      setDoneAction(info.action);
      setState('done');
    } catch {
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const isApprove = info?.action === 'approve';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, #f7f6f2)',
        fontFamily: 'DM Sans, sans-serif',
        padding: 24,
      }}
    >
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div
        style={{
          width: 440,
          maxWidth: '100%',
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #e4e0d8)',
          borderRadius: 16,
          padding: 36,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          animation: 'fadeInUp .3s ease both',
        }}
      >
        {state === 'loading' && (
          <p style={{ textAlign: 'center', color: 'var(--text3, #9e998f)', fontSize: 14 }}>Loading…</p>
        )}

        {state === 'error' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>⚠️</span>
            </div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', textAlign: 'center', margin: '0 0 10px' }}>
              Link Invalid
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text2, #6b665c)', textAlign: 'center', margin: 0 }}>
              {error}
            </p>
          </>
        )}

        {state === 'done' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>{doneAction === 'approve' ? '✅' : '❌'}</span>
            </div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', textAlign: 'center', margin: '0 0 10px' }}>
              {doneAction === 'approve' ? 'Approval Recorded' : 'Rejection Recorded'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text2, #6b665c)', textAlign: 'center', margin: 0 }}>
              {info?.already_responded
                ? 'This request has already been responded to.'
                : `Your ${doneAction === 'approve' ? 'approval' : 'rejection'} has been recorded for "${info?.project_name ?? 'this project'}".`}
            </p>
          </>
        )}

        {state === 'ready' && info && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 40 }}>{isApprove ? '👍' : '👎'}</span>
            </div>
            <h1
              style={{
                fontFamily: 'Instrument Serif, serif',
                fontSize: 24,
                color: 'var(--text, #1a1814)',
                textAlign: 'center',
                margin: '0 0 10px',
              }}
            >
              {isApprove ? 'Approve Request' : 'Reject Request'}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text2, #6b665c)',
                textAlign: 'center',
                margin: '0 0 28px',
                lineHeight: 1.6,
              }}
            >
              You are being asked to <strong>{isApprove ? 'approve' : 'reject'}</strong> a request for{' '}
              <strong>{info.project_name}</strong>.
            </p>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--red, #991b1b)', textAlign: 'center', marginBottom: 16 }}>
                {error}
              </p>
            )}

            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              style={{
                display: 'block',
                width: '100%',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 15,
                fontWeight: 600,
                padding: '12px 0',
                borderRadius: 10,
                background: isApprove ? 'var(--green, #2d6a4f)' : 'var(--red, #991b1b)',
                color: '#fff',
                border: 'none',
                cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.65 : 1,
                transition: 'opacity .15s',
              }}
            >
              {submitting ? 'Submitting…' : isApprove ? 'Confirm Approval' : 'Confirm Rejection'}
            </button>

            <p style={{ fontSize: 12, color: 'var(--text3, #9e998f)', textAlign: 'center', marginTop: 14, margin: '14px 0 0' }}>
              This action is final and will be logged on the project.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript to verify**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add "apps/web/app/(portal)/portal/approve/[token]/page.tsx"
rtk git commit -m "feat(portal): add standalone approve/reject landing page"
```

---

## Task 6: LinkedProjectCard + ContactDrawer integration

**Files:**
- Create: `apps/web/modules/projects/components/LinkedProjectCard.tsx`
- Modify: `apps/web/modules/contacts/components/ContactDrawer.tsx`

- [ ] **Step 1: Create LinkedProjectCard.tsx**

```typescript
// apps/web/modules/projects/components/LinkedProjectCard.tsx
'use client';

import Link from 'next/link';
import type { ProjectWithProgress } from '@/modules/projects/lib/api';

interface Props {
  project: ProjectWithProgress;
  animationDelay?: number;
}

const HEALTH_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  ON_TRACK:  { bg: 'var(--green-bg, #d8f3dc)',  color: 'var(--green, #2d6a4f)',  label: 'On Track'  },
  AT_RISK:   { bg: 'var(--amber-bg, #fef3c7)',  color: 'var(--amber, #92400e)',  label: 'At Risk'   },
  OFF_TRACK: { bg: 'var(--red-bg, #fee2e2)',    color: 'var(--red, #991b1b)',    label: 'Off Track' },
};

export function LinkedProjectCard({ project, animationDelay = 0 }: Props) {
  const health = HEALTH_STYLES[project.health] ?? HEALTH_STYLES.ON_TRACK;

  return (
    <Link
      href={`/projects/${project.id}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        animation: 'fadeInUp .22s ease both',
        animationDelay: `${animationDelay}ms`,
        transition: 'border-color .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--text3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {project.color && (
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: project.color, flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            color: 'var(--text)', flex: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {project.name}
        </span>
        <span
          style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            padding: '2px 7px', borderRadius: 20,
            background: health.bg, color: health.color, flexShrink: 0,
          }}
        >
          {health.label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            flex: 1, height: 4,
            background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${project.progress}%`,
              background: project.color ?? 'var(--green)',
              borderRadius: 2,
              transition: 'width .4s ease',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: 'DM Sans', fontSize: 11,
            color: 'var(--text3)', flexShrink: 0,
          }}
        >
          {project.progress}%
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Run TypeScript to verify**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Add the `@keyframes fadeInUp` declaration and "Projects" section to ContactDrawer.tsx**

Open `apps/web/modules/contacts/components/ContactDrawer.tsx`. Make these two changes:

**Change 1** — Add these two imports at the top of the file, after the existing imports:

```typescript
import { useQuery } from '@tanstack/react-query';
import { pmApi } from '@/modules/projects/lib/api';
import { LinkedProjectCard } from '@/modules/projects/components/LinkedProjectCard';
```

Note: `useQuery` is already imported in the file (`useQuery, useMutation, useQueryClient`). Only add `pmApi` and `LinkedProjectCard`.

**Change 2** — Inside `ContactDrawer`, add a query for linked projects right after the existing `const tasks = ...` declarations (before the `return` statement):

```typescript
  const { data: linkedProjectsData } = useQuery({
    queryKey: ['contact-projects', contactId],
    queryFn: async () => pmApi.listProjectsByContact(await getToken(), contactId),
  });
  const linkedProjects = linkedProjectsData?.data ?? [];
```

**Change 3** — Inside the JSX, add a "Projects" section after the Tasks section and before the Activity timeline section. Find the closing `</div>` of the tasks section (which ends with `{addingTask && ...}`) and insert this block immediately after it:

```tsx
{/* Linked Projects */}
{linkedProjects.length > 0 && (
  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
    <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 10 }}>
      Projects
    </span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {linkedProjects.map((p, i) => (
        <LinkedProjectCard key={p.id} project={p} animationDelay={i * 30} />
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Run TypeScript to verify**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/modules/projects/components/LinkedProjectCard.tsx apps/web/modules/contacts/components/ContactDrawer.tsx
rtk git commit -m "feat(crm): add LinkedProjectCard and linked projects section to ContactDrawer"
```

---

## Task 7: ItemDetail (deal) linked project section

**Files:**
- Modify: `apps/web/modules/pipeline/components/detail/ItemDetail.tsx`

`ItemDetail` renders the deal/item detail slide-over panel. We add a "Project" section below the stage mover.

- [ ] **Step 1: Write the failing import test**

Add this temporary import to `apps/web/modules/pipeline/components/detail/ItemDetail.tsx`:
```typescript
import { LinkedProjectCard } from '@/modules/projects/components/LinkedProjectCard';
```
Run:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep LinkedProjectCard
```
Expected: This should already compile successfully (file exists from Task 6). If it does, the import is valid — skip to Step 3.

- [ ] **Step 2: Add imports and linked-project query to ItemDetail.tsx**

Open `apps/web/modules/pipeline/components/detail/ItemDetail.tsx`. Make these changes:

**Change 1** — Add these imports at the top (after the existing imports):

```typescript
import { useQuery } from '@tanstack/react-query';
import { pmApi } from '@/modules/projects/lib/api';
import { LinkedProjectCard } from '@/modules/projects/components/LinkedProjectCard';
```

Note: `useQuery` is already imported. Only add `pmApi` and `LinkedProjectCard`.

**Change 2** — Inside the `ItemDetail` component function body, add this query right after the existing `const deleteMut = useMutation(...)` block:

```typescript
  const { data: linkedProjectsData } = useQuery({
    queryKey: ['deal-projects', itemId],
    queryFn: async () => pmApi.listProjectsByDeal(await getToken(), itemId),
    enabled: !!itemId,
  });
  const linkedProjects = linkedProjectsData?.data ?? [];
```

**Change 3** — In the JSX, after the "Stage mover" section (the `{item && (<div style={{ padding: '12px 20px' ...`  block) and before the Tabs section, insert:

```tsx
{/* Linked projects */}
{linkedProjects.length > 0 && (
  <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
    <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    <label
      style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.6px', color: 'var(--text3)',
        fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 8,
      }}
    >
      Project
    </label>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {linkedProjects.map((p, i) => (
        <LinkedProjectCard key={p.id} project={p} animationDelay={i * 30} />
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Run TypeScript to verify**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/modules/pipeline/components/detail/ItemDetail.tsx
rtk git commit -m "feat(pipeline): show linked project in deal detail panel"
```

---

## Task 8: Cross-module integration settings page

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`
- Create: `apps/web/app/(dashboard)/settings/integrations/page.tsx`

- [ ] **Step 1: Write the failing TypeScript check**

Try to navigate to the `integrations` page mentally: it doesn't exist yet.

Add a temporary import test to `apps/web/app/(dashboard)/settings/layout.tsx`:
```typescript
// Temp: import '@/app/(dashboard)/settings/integrations/page';
```
Run tsc — this will fail at runtime (page not found), but we can verify the file is missing. Since this is a page route, the test is "the page returns 404 until we create it." Proceed directly to implementation.

- [ ] **Step 2: Add "Integrations" tab to settings layout**

Open `apps/web/app/(dashboard)/settings/layout.tsx`. Find the `ALL_TABS` array and add a new entry immediately after the `notifications` entry:

```typescript
  { href: '/settings/integrations', label: 'Integrations', adminOnly: true },
```

Also add `/settings/integrations` to the redirect guard `useEffect` condition (the `pathname.startsWith(...)` list):

```typescript
pathname.startsWith('/settings/integrations')
```

The updated `ALL_TABS` array:
```typescript
const ALL_TABS: Tab[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/users', label: 'Users & Groups', adminOnly: true },
  { href: '/settings/ssh', label: 'SSH Keys', adminOnly: true },
  { href: '/settings/api-keys', label: 'API Keys', adminOnly: true },
  { href: '/settings/modules', label: 'Modules', adminOnly: true },
  { href: '/settings/plugins', label: 'Plugins', adminOnly: true },
  { href: '/settings/activity', label: 'Activity', adminOnly: true },
  { href: '/settings/notifications', label: 'Notifications', adminOnly: true },
  { href: '/settings/integrations', label: 'Integrations', adminOnly: true },
];
```

The updated redirect guard `useEffect` condition:
```typescript
    if (!isLoading && !isAdmin && (
      pathname.startsWith('/settings/users') ||
      pathname.startsWith('/settings/groups') ||
      pathname.startsWith('/settings/pipelines') ||
      pathname.startsWith('/settings/tasks') ||
      pathname.startsWith('/settings/ssh') ||
      pathname.startsWith('/settings/api-keys') ||
      pathname.startsWith('/settings/modules') ||
      pathname.startsWith('/settings/plugins') ||
      pathname.startsWith('/settings/activity') ||
      pathname.startsWith('/settings/notifications') ||
      pathname.startsWith('/settings/integrations')
    )) {
```

- [ ] **Step 3: Create the integrations settings page**

Create `apps/web/app/(dashboard)/settings/integrations/page.tsx`:

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { crossModuleApi } from '@/modules/projects/lib/api';

interface SettingMeta {
  key: string;
  label: string;
  description: string;
  group: string;
}

const SETTINGS: SettingMeta[] = [
  {
    key: 'pm.deal_link_enabled',
    label: 'Link projects to deals and contacts',
    description: 'Allow a project to be linked to a CRM deal or contact. Linked projects appear in the deal and contact detail panels.',
    group: 'CRM → Projects',
  },
  {
    key: 'pm.deal_close_auto_spawn',
    label: 'Auto-create project when deal is won',
    description: 'When a deal moves to a Won stage, automatically create a linked project for it. Requires "Link projects to deals" to be enabled.',
    group: 'CRM → Projects',
  },
  {
    key: 'pm.project_complete_deal_stage',
    label: 'Move deal to Won when project completes',
    description: 'When a project is marked complete, automatically advance its linked deal to the pipeline\'s Won stage.',
    group: 'CRM → Projects',
  },
  {
    key: 'crm.project_health_on_record',
    label: 'Show project health on CRM records',
    description: 'Display the linked project\'s health status (On Track / At Risk / Off Track) inside the contact and deal detail panels.',
    group: 'Projects → CRM',
  },
];

export default function IntegrationsSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['cross-module-settings'],
    queryFn: async () => crossModuleApi.list(await getToken()),
  });

  const settings = data?.data ?? [];

  function isEnabled(key: string) {
    return settings.find(s => s.key === key)?.enabled ?? false;
  }

  const toggleMut = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const token = await getToken();
      return crossModuleApi.patch(token, key, { enabled });
    },
    onSuccess: (_, { key, enabled }) => {
      qc.setQueryData<typeof data>(['cross-module-settings'], prev => {
        if (!prev) return prev;
        const updated = prev.data.map(s => s.key === key ? { ...s, enabled } : s);
        return { ...prev, data: updated };
      });
    },
  });

  const groups = Array.from(new Set(SETTINGS.map(s => s.group)));

  return (
    <div style={{ maxWidth: 640 }}>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Integrations</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, marginTop: 0 }}>
        Configure how modules interact with each other. Changes apply workspace-wide.
      </p>

      {isLoading && (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      )}

      {!isLoading && groups.map((group, gi) => (
        <div key={group} style={{ marginBottom: 28, animation: 'fadeInUp .25s ease both', animationDelay: `${gi * 40}ms` }}>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
            color: 'var(--text3)', textTransform: 'uppercase',
            letterSpacing: '0.07em', margin: '0 0 10px',
          }}>
            {group}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SETTINGS.filter(s => s.group === group).map((s, i) => {
              const enabled = isEnabled(s.key);
              const pending = toggleMut.isPending && toggleMut.variables?.key === s.key;
              return (
                <div
                  key={s.key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    animation: 'fadeInUp .25s ease both',
                    animationDelay: `${(gi * 4 + i) * 35}ms`,
                  }}
                >
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>{s.description}</p>
                  </div>
                  <button
                    disabled={pending}
                    onClick={() => toggleMut.mutate({ key: s.key, enabled: !enabled })}
                    style={{
                      position: 'relative', width: 44, height: 24, borderRadius: 999,
                      background: enabled ? 'var(--green)' : 'var(--border)',
                      border: 'none', cursor: pending ? 'default' : 'pointer',
                      transition: 'background .2s', flexShrink: 0,
                      opacity: pending ? 0.6 : 1,
                    }}
                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${s.label}`}
                  >
                    <span style={{
                      position: 'absolute', top: 3,
                      left: enabled ? 23 : 3,
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fff', transition: 'left .2s',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run TypeScript to verify**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/app/(dashboard)/settings/layout.tsx "apps/web/app/(dashboard)/settings/integrations/page.tsx"
rtk git commit -m "feat(settings): add Integrations page with cross-module toggles"
```

---

## Task 9: Animation polish pass

All new components already have entry animations from their creation steps. This task verifies consistency and adds the `fadeInUp` keyframe where it was missed.

**Files (verify and patch where needed):**
- `apps/web/modules/projects/components/LinkedProjectCard.tsx` — uses `animation: 'fadeInUp .22s ease both'` (added in Task 6 ✓)
- `apps/web/modules/projects/components/ApprovalsPanel.tsx` — `fadeInUp` on each approval row (added in Task 4 ✓)
- `apps/web/app/(dashboard)/settings/integrations/page.tsx` — `fadeInUp` on each setting group and row (added in Task 8 ✓)
- `apps/web/app/(portal)/portal/approve/[token]/page.tsx` — card-level `fadeInUp` (added in Task 5 ✓)

The `@keyframes fadeInUp` declaration is inlined as `<style>` in each component that uses it. Since these are client components and the keyframe is declared inline, there's no global stylesheet required.

- [ ] **Step 1: Verify all animations are present**

Run a grep to confirm no new files are missing the animation:

```bash
cd apps/web && grep -l "fadeInUp" modules/projects/components/ApprovalsPanel.tsx modules/projects/components/LinkedProjectCard.tsx "app/(portal)/portal/approve/[token]/page.tsx" "app/(dashboard)/settings/integrations/page.tsx"
```
Expected: all 4 files listed (no missing files in output).

- [ ] **Step 2: Verify the whole web build compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -40
```
Expected: no errors from any file touched in this plan.

- [ ] **Step 3: Run API tests to confirm backend is not broken**

```bash
cd apps/api && pnpm vitest run src/routes/portal.test.ts --reporter=verbose 2>&1 | tail -30
```
Expected: all tests pass.

- [ ] **Step 4: Final commit**

```bash
rtk git add -A
rtk git commit -m "feat(projects/crm): PR4 cross-module frontend — approvals panel, portal approve page, CRM project links, integrations settings"
```

---

## Self-review checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `ApprovalsPanel` inside project | Task 4 |
| `ApprovalRequestModal` with optional recipient_email | Task 3 |
| `ApprovalBadge` (pending count) | Task 2 |
| `portal/approve/[token]` landing page | Task 5 |
| `LinkedProjectCard` | Task 6 |
| `ContactProjectsCard` (shown in ContactDrawer) | Task 6 |
| CRM settings integration section | Task 8 |
| Final animation polish pass | Task 9 |

**Placeholder scan:** None — all code blocks are complete and runnable.

**Type consistency:**
- `ApprovalRequest.status` is `'PENDING' | 'APPROVED' | 'REJECTED'` (uppercase) in api.ts — matches what the backend returns (Plan 4A portal.ts stores `status: text` but the existing portal client page already used uppercase `'PENDING' | 'APPROVED' | 'REJECTED'` literals, confirming this is correct).
- `ApproveTokenInfo.action` is `'approve' | 'reject'` — matches Plan 4A `jwt.sign({ aid, act }, ...)` where `act` is `'approve'` or `'reject'`.
- `CrossModuleSetting.key` is `string` — matches the generic `CrossModuleSettingKey` type union from Plan 4A which the backend returns as a string.
- `ProjectWithProgress.progress` is `number` — already defined in api.ts and used by `LinkedProjectCard`.
- `pmApi.listProjectsByContact(token, contactId)` and `pmApi.listProjectsByDeal(token, dealId)` both call `/api/projects?contact_id=...` and `/api/projects?deal_id=...` — these filter params are added to the projects list endpoint in Plan 4A Task 3.

**Route conflict:** `/portal/approve/[token]` does NOT conflict with `/portal/[token]/` — Next.js resolves static path segments before dynamic ones. Verified in Task 5 Step 1.
