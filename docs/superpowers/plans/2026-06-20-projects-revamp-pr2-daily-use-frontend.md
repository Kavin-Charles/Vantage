# Projects Revamp PR2 Daily-Use — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface PR2's backend additions (recurring rules, reorder endpoint, subtask depth) in the UI — a recurring-rules settings panel, drag-to-reorder in both board and list views, visual subtask nesting, clickable Gantt bars, and a richer task detail panel.

**Architecture:** `RecurringRuleModal`/`RecurringRulesPanel` are new components wired into the existing `SettingsPage.tsx` (the established home for project-level configuration — labels already live there). Drag-to-reorder replaces the board's status-only `updateMutation` call with a position-aware `reorderTask` call, and extends the same drag handlers onto `ProjectListPage`'s rows. Subtask nesting is a pure rendering transform (`buildTaskRows`) applied on top of the existing flat task list — no new state beyond a per-row collapsed-set. Gantt bars become clickable via a new `onTaskClick` prop on the existing `GanttChart` SVG component. `TaskDetailPanel` gains a parent breadcrumb and a subtasks list, fed by the already-fetched `tasks` query data rather than a new round-trip.

**Tech Stack:** Next.js App Router, TanStack Query, native HTML5 drag-and-drop (no new dependency, matching the board's existing approach).

> **Note on testing:** `apps/web` has no component-test infrastructure (no testing-library, no `.test.tsx` files anywhere in the app). Plan 1B established the precedent of writing real vitest tests only for pure-logic modules (`lib/api.ts`) and verifying UI/component work manually via `npx tsc --noEmit` + a dev-server check. This plan follows the same precedent — Task 1 has a real automated test; all other tasks are verified manually.

---

## File Structure

| File | Change |
|---|---|
| `apps/web/modules/projects/lib/api.ts` | Add `RecurringRule` type, `reorderTask`, recurring-rule CRUD methods, extend `CreateTaskBody` with `parent_id` |
| `apps/web/modules/projects/lib/api.test.ts` | Add tests for the new methods (extends the file from Plan 1B) |
| `apps/web/modules/projects/components/RecurringRuleModal.tsx` | New file |
| `apps/web/modules/projects/components/RecurringRulesPanel.tsx` | New file |
| `apps/web/modules/projects/pages/SettingsPage.tsx` | Mount `RecurringRulesPanel` |
| `apps/web/modules/projects/pages/ProjectBoardPage.tsx` | Drag-to-reorder (replace status-only drop with position-aware reorder), pass `tasks` into `TaskDetailPanel` |
| `apps/web/modules/projects/pages/ProjectListPage.tsx` | Drag-to-reorder rows, subtask nesting tree, pass `tasks` into `TaskDetailPanel` |
| `apps/web/modules/projects/components/GanttChart.tsx` | Add `onTaskClick` prop, make bars/rows clickable |
| `apps/web/modules/projects/pages/TimelinePage.tsx` | Wire `onTaskClick` to open `TaskDetailPanel` |
| `apps/web/modules/projects/components/TaskDetailPanel.tsx` | Add `allTasks` prop, parent breadcrumb, subtasks section |
| `apps/web/modules/projects/components/TaskCreateModal.tsx` | Add `parentId` prop, send `parent_id` on create |

---

### Task 1: Extend `api.ts` with reorder + recurring-rule methods

**Files:**
- Modify: `apps/web/modules/projects/lib/api.ts`
- Test: `apps/web/modules/projects/lib/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create (or append to, if Plan 1B's version already exists) `apps/web/modules/projects/lib/api.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/shared/lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/modules/shared/lib/api';
import { pmApi } from './api';

describe('pmApi.reorderTask', () => {
  it('posts to the reorder endpoint with status_id and after_task_id', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'task-1', position: 150 } });

    await pmApi.reorderTask('tok', 'project-1', 'task-1', { status_id: 'status-1', after_task_id: 'task-0' });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/tasks/task-1/reorder',
      expect.objectContaining({
        token: 'tok',
        method: 'POST',
        body: JSON.stringify({ status_id: 'status-1', after_task_id: 'task-0' }),
      }),
    );
  });
});

describe('pmApi recurring rules', () => {
  it('lists recurring rules for a project', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: 'rule-1' }] });

    const res = await pmApi.listRecurringRules('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/recurring-rules', { token: 'tok' });
    expect(res.data).toHaveLength(1);
  });

  it('creates a recurring rule', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'rule-1', frequency: 'WEEKLY' } });

    await pmApi.createRecurringRule('tok', 'project-1', { title: 'Weekly check-in', frequency: 'WEEKLY', interval: 1 });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/recurring-rules',
      expect.objectContaining({ token: 'tok', method: 'POST' }),
    );
  });

  it('deletes a recurring rule', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });

    await pmApi.deleteRecurringRule('tok', 'project-1', 'rule-1');

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/recurring-rules/rule-1',
      expect.objectContaining({ token: 'tok', method: 'DELETE' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run modules/projects/lib/api.test.ts`
Expected: FAIL — `pmApi.reorderTask is not a function` (and similarly for the recurring-rule methods).

- [ ] **Step 3: Implement**

In `apps/web/modules/projects/lib/api.ts`, add this interface near `TaskLabel`:

```ts
export interface RecurringRule {
  id: string; project_id: string; title: string; description: string | null;
  status_id: string | null; priority: string; assignee_ids: string[] | null;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number;
  next_run_at: string; is_active: boolean; created_by: string;
  created_at: string; updated_at: string;
}

export interface CreateRecurringRuleBody {
  title: string;
  description?: string;
  status_id?: string;
  priority?: string;
  assignee_ids?: string[];
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
}
```

Update `CreateTaskBody` to add `parent_id`:

```ts
export interface CreateTaskBody {
  title: string;
  status_id?: string;
  priority?: string;
  assignee_ids?: string[];
  due_date?: string | null;
  parent_id?: string;
}
```

Add these methods inside the `pmApi` object, after `deleteTask`:

```ts
  reorderTask: (token: string, projectId: string, taskId: string, body: { status_id?: string; after_task_id?: string | null }) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks/${taskId}/reorder`, { token, method: 'POST', body: JSON.stringify(body) }),
  listRecurringRules: (token: string, projectId: string) =>
    apiFetch<{ data: RecurringRule[] }>(`/api/projects/${projectId}/recurring-rules`, { token }),
  createRecurringRule: (token: string, projectId: string, body: CreateRecurringRuleBody) =>
    apiFetch<{ data: RecurringRule }>(`/api/projects/${projectId}/recurring-rules`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateRecurringRule: (token: string, projectId: string, ruleId: string, body: Partial<CreateRecurringRuleBody & { is_active: boolean }>) =>
    apiFetch<{ data: RecurringRule }>(`/api/projects/${projectId}/recurring-rules/${ruleId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteRecurringRule: (token: string, projectId: string, ruleId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/recurring-rules/${ruleId}`, { token, method: 'DELETE' }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run modules/projects/lib/api.test.ts`
Expected: PASS (4+ tests, including any carried over from Plan 1B).

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/projects/lib/api.ts apps/web/modules/projects/lib/api.test.ts
git commit -m "feat(projects): add reorder and recurring-rule API methods"
```

---

### Task 2: `RecurringRuleModal.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/RecurringRuleModal.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskStatus, type ProjectMember, type RecurringRule } from '@/modules/projects/lib/api';

const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

interface Props {
  projectId: string;
  rule?: RecurringRule | null;
  onClose: () => void;
}

export function RecurringRuleModal({ projectId, rule, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [title, setTitle] = useState(rule?.title ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [statusId, setStatusId] = useState(rule?.status_id ?? '');
  const [priority, setPriority] = useState(rule?.priority ?? 'MEDIUM');
  const [frequency, setFrequency] = useState<typeof FREQUENCIES[number]>(rule?.frequency ?? 'WEEKLY');
  const [interval, setInterval_] = useState(rule?.interval ?? 1);
  const [selectedIds, setSelectedIds] = useState<string[]>(rule?.assignee_ids ?? []);
  const [visible, setVisible] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 150);
  }, [onClose]);

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const res = await pmApi.listStatuses(await getToken(), projectId);
      return res.data ?? [];
    },
  });

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ['members', projectId],
    queryFn: async () => {
      const res = await pmApi.listMembers(await getToken(), projectId);
      return res.data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        status_id: statusId || undefined,
        priority,
        assignee_ids: selectedIds,
        frequency,
        interval,
      };
      return rule
        ? pmApi.updateRecurringRule(token, projectId, rule.id, body)
        : pmApi.createRecurringRule(token, projectId, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recurring-rules', projectId] });
      handleClose();
    },
  });

  function toggleMember(userId: string) {
    setSelectedIds(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));
  }

  const canSubmit = title.trim().length > 0 && interval >= 1 && !saveMutation.isPending;

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
    fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: `rgba(0,0,0,${visible ? 0.3 : 0})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>
            {rule ? 'Edit Recurring Task' : 'New Recurring Task'}
          </span>
          <button type="button" onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div>
          <label style={labelStyle}>Title *</label>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Repeats</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as typeof FREQUENCIES[number])} style={{ ...inputStyle, cursor: 'pointer' }}>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div style={{ width: 100 }}>
            <label style={labelStyle}>Every</label>
            <input type="number" min={1} max={365} value={interval} onChange={e => setInterval_(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <select value={statusId} onChange={e => setStatusId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Default</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Assignees</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {members.map(m => {
              const selected = selectedIds.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleMember(m.user_id)}
                  style={{
                    padding: '5px 11px', borderRadius: 20,
                    border: `1px solid ${selected ? 'var(--text)' : 'var(--border)'}`,
                    background: selected ? 'var(--text)' : 'var(--bg)',
                    color: selected ? '#fff' : 'var(--text2)',
                    fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {m.name ?? m.email}
                </button>
              );
            })}
            {members.length === 0 && (
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>No members in this project.</span>
            )}
          </div>
        </div>

        {saveMutation.isError && (
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: 0 }}>Failed to save rule.</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleClose}
            style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'none', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: 8,
              background: canSubmit ? 'var(--text)' : 'var(--surface2)',
              color: canSubmit ? '#fff' : 'var(--text3)',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {saveMutation.isPending ? 'Saving…' : rule ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` (or the project's existing typecheck command) to confirm no type errors. This component is mounted and exercised visually in Task 3.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/RecurringRuleModal.tsx
git commit -m "feat(projects): add RecurringRuleModal component"
```

---

### Task 3: `RecurringRulesPanel.tsx` + mount in `SettingsPage.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/RecurringRulesPanel.tsx`
- Modify: `apps/web/modules/projects/pages/SettingsPage.tsx`

- [ ] **Step 1: Implement the panel**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type RecurringRule } from '@/modules/projects/lib/api';
import { RecurringRuleModal } from './RecurringRuleModal';
import { Icon } from '@/modules/shared/components/ui/Icon';

const FREQUENCY_LABEL: Record<string, (n: number) => string> = {
  DAILY: n => (n === 1 ? 'Daily' : `Every ${n} days`),
  WEEKLY: n => (n === 1 ? 'Weekly' : `Every ${n} weeks`),
  MONTHLY: n => (n === 1 ? 'Monthly' : `Every ${n} months`),
};

interface Props {
  projectId: string;
}

export function RecurringRulesPanel({ projectId }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: rulesData } = useQuery({
    queryKey: ['recurring-rules', projectId],
    queryFn: async () => {
      const token = await getToken();
      return pmApi.listRecurringRules(token, projectId);
    },
  });
  const rules: RecurringRule[] = rulesData?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: async ({ ruleId, is_active }: { ruleId: string; is_active: boolean }) => {
      const token = await getToken();
      return pmApi.updateRecurringRule(token, projectId, ruleId, { is_active });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recurring-rules', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const token = await getToken();
      return pmApi.deleteRecurringRule(token, projectId, ruleId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recurring-rules', projectId] }),
  });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
          Recurring Tasks
        </p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 7, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Icon name="plus" size={12} color="#fff" /> New Rule
        </button>
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
        Automatically create tasks on a schedule.
      </p>

      {rules.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No recurring rules yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map(rule => (
            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <button
                type="button"
                onClick={() => toggleMutation.mutate({ ruleId: rule.id, is_active: !rule.is_active })}
                title={rule.is_active ? 'Active — click to pause' : 'Paused — click to activate'}
                style={{
                  width: 32, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: rule.is_active ? 'var(--green)' : 'var(--border)', position: 'relative',
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: rule.is_active ? 16 : 2,
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.15s ease',
                }} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.title}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>
                  {(FREQUENCY_LABEL[rule.frequency] ?? (() => rule.frequency))(rule.interval)}
                </div>
              </div>
              <button onClick={() => setEditingRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4 }} title="Edit rule">
                <Icon name="edit" size={13} />
              </button>
              <button onClick={() => deleteMutation.mutate(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4 }} title="Delete rule">
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && <RecurringRuleModal projectId={projectId} onClose={() => setShowCreate(false)} />}
      {editingRule && <RecurringRuleModal projectId={projectId} rule={editingRule} onClose={() => setEditingRule(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Mount in `SettingsPage.tsx`**

In `apps/web/modules/projects/pages/SettingsPage.tsx`, add the import near the other component imports:

```ts
import { RecurringRulesPanel } from '@/modules/projects/components/RecurringRulesPanel';
```

Insert the panel right after the closing `</div>` of the two-column grid (i.e. immediately before the final closing `</div>` of the component's return), so it spans full width below both columns:

```tsx
      </div>

      <RecurringRulesPanel projectId={projectId} />
    </div>
  );
}
```

(This replaces the existing tail `</div>\n  );\n}` — the grid's closing div stays, and `RecurringRulesPanel` is added right after it, before the outer page `</div>`.)

- [ ] **Step 3: Verify manually**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean. Then start the dev server (`npm run dev` from `apps/web`) and visit a project's Settings page — confirm the "Recurring Tasks" panel renders below the General/Labels grid, "New Rule" opens the modal, creating a rule lists it with the toggle/edit/delete controls working.

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/projects/components/RecurringRulesPanel.tsx apps/web/modules/projects/pages/SettingsPage.tsx
git commit -m "feat(projects): add recurring rules panel to project settings"
```

---

### Task 4: Drag-to-reorder in `ProjectBoardPage.tsx`

**Files:**
- Modify: `apps/web/modules/projects/pages/ProjectBoardPage.tsx`

- [ ] **Step 1: Implement**

Replace the `TaskCard` function's signature and root `<div>` (lines 23-58 in the current file) with a version that accepts a drop handler and stops the column's own `onDrop` from also firing:

```tsx
function TaskCard({
  task,
  onClick,
  onDragStart,
  onDropOnCard,
}: {
  task: TaskWithAssignees;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDropOnCard: (e: React.DragEvent, task: TaskWithAssignees) => void;
}) {
  const [hover, setHover] = useState(false);
  const now = new Date();
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const overdue = dueDate && dueDate < now;
  const priorityBorder = task.priority && task.priority !== 'NONE'
    ? PRIORITY_BORDER[task.priority] ?? 'var(--border)'
    : 'var(--border)';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDropOnCard(e, task); }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#ffffff',
        border: `1px solid ${hover ? priorityBorder : 'var(--border)'}`,
        borderLeft: `3px solid ${priorityBorder}`,
        borderRadius: 10,
        padding: '11px 13px 11px 11px',
        cursor: 'pointer', marginBottom: 8,
        boxShadow: hover ? '0 4px 14px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.12s ease',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
    >
```

(The body below the opening `<div>` — title, meta row, priority chip, due date chip, client dot, avatars — is unchanged.)

Inside `ProjectBoardPage`, replace the `updateMutation` block with a `reorderMutation` and rewrite `handleDrop`:

```tsx
  const reorderMutation = useMutation({
    mutationFn: async ({ taskId, statusId, afterTaskId }: { taskId: string; statusId: string; afterTaskId: string | null }) => {
      const token = await getToken();
      return pmApi.reorderTask(token, projectId, taskId, { status_id: statusId, after_task_id: afterTaskId });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  function handleDrop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    if (!draggedTaskId) return;
    const columnTasks = tasks
      .filter(t => t.status_id === statusId && t.id !== draggedTaskId)
      .sort((a, b) => a.position - b.position);
    const lastId = columnTasks.length > 0 ? columnTasks[columnTasks.length - 1]!.id : null;
    reorderMutation.mutate({ taskId: draggedTaskId, statusId, afterTaskId: lastId });
    setDraggedTaskId(null);
  }

  function handleDropOnCard(e: React.DragEvent, targetTask: TaskWithAssignees) {
    if (!draggedTaskId || draggedTaskId === targetTask.id) { setDraggedTaskId(null); return; }
    const columnTasks = tasks
      .filter(t => t.status_id === targetTask.status_id && t.id !== draggedTaskId)
      .sort((a, b) => a.position - b.position);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dropBefore = e.clientY < rect.top + rect.height / 2;
    const idx = columnTasks.findIndex(t => t.id === targetTask.id);
    const afterTaskId = dropBefore ? (idx > 0 ? columnTasks[idx - 1]!.id : null) : targetTask.id;
    reorderMutation.mutate({ taskId: draggedTaskId, statusId: targetTask.status_id, afterTaskId });
    setDraggedTaskId(null);
  }
```

Remove the old `const updateMutation = useMutation({ ... })` block entirely (it's superseded by `reorderMutation` — nothing else in this file used `updateMutation`).

Update the `TaskCard` call site to pass the new prop:

```tsx
                      {columnTasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onClick={() => void openTask(task)}
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDropOnCard={handleDropOnCard}
                        />
                      ))}
```

Finally, pass the already-loaded `tasks` array into `TaskDetailPanel` so it can render subtasks/parent breadcrumb (Task 8 of this plan):

```tsx
      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onUpdate={patch => setSelectedTask(prev => prev ? { ...prev, ...patch } : null)}
        />
      )}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean (note: `allTasks` won't type-check until Task 8 adds the prop to `TaskDetailPanel` — if doing tasks out of order, do Task 8 first or accept a temporary type error here).

Start the dev server and on a project's Board view: drag a card onto another card within the same column — confirm it lands in the correct position (above/below depending on cursor position) and the order persists after a page refresh. Drag a card to a different column — confirm both the status change and position work.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/ProjectBoardPage.tsx
git commit -m "feat(projects): drag-to-reorder tasks within and across board columns"
```

---

### Task 5: Drag-to-reorder rows in `ProjectListPage.tsx`

**Files:**
- Modify: `apps/web/modules/projects/pages/ProjectListPage.tsx`

- [ ] **Step 1: Implement**

Add drag state and a reorder mutation near the top of `ProjectListPage`, alongside the existing `updateMutation`:

```tsx
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const reorderMutation = useMutation({
    mutationFn: async ({ taskId, statusId, afterTaskId }: { taskId: string; statusId: string; afterTaskId: string | null }) => {
      const token = await getToken();
      return pmApi.reorderTask(token, projectId, taskId, { status_id: statusId, after_task_id: afterTaskId });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  function handleDropOnRow(e: React.DragEvent, targetTask: TaskWithAssignees) {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTask.id) { setDraggedTaskId(null); return; }
    const siblings = tasks
      .filter(t => t.status_id === targetTask.status_id && t.id !== draggedTaskId)
      .sort((a, b) => a.position - b.position);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dropBefore = e.clientY < rect.top + rect.height / 2;
    const idx = siblings.findIndex(t => t.id === targetTask.id);
    const afterTaskId = dropBefore ? (idx > 0 ? siblings[idx - 1]!.id : null) : targetTask.id;
    reorderMutation.mutate({ taskId: draggedTaskId, statusId: targetTask.status_id, afterTaskId });
    setDraggedTaskId(null);
  }
```

Update the `<tr>` for each task row to be draggable and accept drops — replace the existing `<tr>` opening tag (the one with `onClick={() => void openTask(task)}`) with:

```tsx
                  <tr
                    key={task.id}
                    draggable
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDropOnRow(e, task)}
                    onClick={() => void openTask(task)}
                    style={{ cursor: 'pointer', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
```

Pass `tasks` into `TaskDetailPanel` (same as Task 4, for the subtasks section added in Task 8):

```tsx
      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onUpdate={patch => {
            setSelectedTask(prev => prev ? { ...prev, ...patch } : null);
            updateMutation.mutate({ taskId: selectedTask.id, patch });
          }}
        />
      )}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean (once Task 8 lands the `allTasks` prop).

Start the dev server and on a project's List view: drag a row and drop it above/below another row in the same status — confirm reordering. Drag a row onto a row in a different status group (since the list isn't grouped visually, this just changes that task's status — acceptable, matches the underlying single reorder endpoint).

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/ProjectListPage.tsx
git commit -m "feat(projects): drag-to-reorder tasks in list view"
```

---

### Task 6: Subtask nesting UI in `ProjectListPage.tsx`

**Files:**
- Modify: `apps/web/modules/projects/pages/ProjectListPage.tsx`

Nesting is only applied when no status filter is active (`filter === 'ALL'`) — filtering to a single status would otherwise orphan children whose parent doesn't match the filter, which is confusing. With "All" selected, the full parent/child tree renders; switching to a specific status falls back to the existing flat filtered list (unchanged from Task 5).

- [ ] **Step 1: Implement**

Add a tree-building helper above the `ProjectListPage` component:

```tsx
interface TaskRow { task: TaskWithAssignees; depth: number; childCount: number }

function buildTaskRows(tasks: TaskWithAssignees[], collapsedIds: Set<string>): TaskRow[] {
  const byParent = new Map<string | null, TaskWithAssignees[]>();
  for (const t of tasks) {
    const key = t.parent_id;
    const arr = byParent.get(key) ?? [];
    arr.push(t);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position);

  const rows: TaskRow[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const t of byParent.get(parentId) ?? []) {
      const childCount = (byParent.get(t.id) ?? []).length;
      rows.push({ task: t, depth, childCount });
      if (childCount > 0 && !collapsedIds.has(t.id)) walk(t.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}
```

Add collapsed-state and compute the rows to render in `ProjectListPage`, near the existing `filtered` memo:

```tsx
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  function toggleCollapsed(taskId: string) {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }

  const rows: TaskRow[] = filter === 'ALL'
    ? buildTaskRows(tasks, collapsedIds)
    : filtered.map(task => ({ task, depth: 0, childCount: 0 }));
```

Replace the `<tbody>`'s `{filtered.map((task, i) => { ... })}` block to iterate `rows` instead of `filtered`, and render the indentation/toggle in the title cell. Replace the whole `<tbody>` block with:

```tsx
            <tbody>
              {rows.map(({ task, depth, childCount }, i) => {
                const status = statuses.find(s => s.id === task.status_id);
                const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                const priorityBorder = task.priority && task.priority !== 'NONE'
                  ? PRIORITY_BORDER[task.priority] ?? 'var(--border)'
                  : 'transparent';
                const isLast = i === rows.length - 1;

                return (
                  <tr
                    key={task.id}
                    draggable
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDropOnRow(e, task)}
                    onClick={() => void openTask(task)}
                    style={{ cursor: 'pointer', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '0', position: 'relative' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '12px 16px',
                        paddingLeft: 16 + depth * 20,
                        borderLeft: `3px solid ${priorityBorder}`,
                      }}>
                        {childCount > 0 && (
                          <button
                            onClick={e => { e.stopPropagation(); toggleCollapsed(task.id); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 0, flexShrink: 0 }}
                          >
                            <Icon name={collapsedIds.has(task.id) ? 'chevron-right' : 'chevron-down'} size={12} />
                          </button>
                        )}
                        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                          {task.title}
                        </span>
                        {childCount > 0 && (
                          <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 10, padding: '1px 6px' }}>
                            {childCount}
                          </span>
                        )}
                        {task.client_visible && (
                          <span style={{
                            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
                            color: 'var(--blue)', background: 'var(--blue-bg)',
                            borderRadius: 5, padding: '2px 6px',
                          }}>
                            Client
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {status ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontFamily: 'DM Sans', fontSize: 12,
                          color: status.color, background: `${status.color}18`,
                          borderRadius: 20, padding: '3px 9px', fontWeight: 500,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, display: 'inline-block', flexShrink: 0 }} />
                          {status.name}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {task.priority && task.priority !== 'NONE' ? (
                        <span style={{
                          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                          color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)',
                          background: PRIORITY_BG[task.priority] ?? 'var(--surface2)',
                          borderRadius: 6, padding: '3px 8px',
                          textTransform: 'uppercase', letterSpacing: '0.03em',
                        }}>
                          {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 12 }}>—</span>}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {task.due_date ? (
                        <span style={{
                          fontFamily: 'DM Sans', fontSize: 12,
                          color: isOverdue ? 'var(--red)' : 'var(--text3)',
                          fontWeight: isOverdue ? 600 : 400,
                        }}>
                          {isOverdue ? '⚠ ' : ''}{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 12 }}>—</span>}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {task.assignees?.length > 0
                        ? <AvatarGroup assignees={task.assignees} />
                        : <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
```

This requires the `Icon` component to support `chevron-right`/`chevron-down` names — check `apps/web/modules/shared/components/ui/Icon.tsx`'s icon map before this step; if those exact names aren't present, use whichever existing chevron/caret icon names the map already defines (e.g. `caret-right`/`caret-down`) instead of adding new ones.

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

Start the dev server, create a task, then create a second task and set its `parent_id` via the API or by editing it in `TaskDetailPanel` once Task 8 lands the subtask UI (or temporarily via a direct API call) — confirm the child renders indented under the parent in the "All" filter, with a collapse toggle and child-count badge, and that switching to a specific status filter falls back to the flat list.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/ProjectListPage.tsx
git commit -m "feat(projects): render subtask nesting in list view"
```

---

### Task 7: Clickable Gantt bars

**Files:**
- Modify: `apps/web/modules/projects/components/GanttChart.tsx`
- Modify: `apps/web/modules/projects/pages/TimelinePage.tsx`

- [ ] **Step 1: Implement `GanttChart.tsx`**

Add an `onTaskClick` prop to `Props` and to the row group:

```tsx
interface Props {
  tasks: GanttTask[];
  startDate: Date;
  endDate: Date;
  onTaskClick?: (taskId: string) => void;
}
```

Update the function signature:

```tsx
export default function GanttChart({ tasks, startDate, endDate, onTaskClick }: Props) {
```

Wrap each task row's `<g key={task.id}>` content so the whole row is clickable when `onTaskClick` is provided — replace the opening of that block:

```tsx
          return (
            <g
              key={task.id}
              onClick={() => onTaskClick?.(task.id)}
              style={{ cursor: onTaskClick ? 'pointer' : 'default' }}
            >
```

(Everything inside the `<g>` — row bg, border, label text, bar rect, "No dates" text — is unchanged; making the `<g>` itself clickable covers the whole row including the bar.)

- [ ] **Step 2: Implement `TimelinePage.tsx`**

Add the imports and state for the detail panel:

```ts
import { useState } from 'react';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type Task, type TaskStatus, type TaskWithAssignees } from '@/modules/projects/lib/api';
```

(`useApiToken` and `pmApi`/`Task`/`TaskStatus` are already imported in the existing file — only add `useState`, `TaskDetailPanel`, and `TaskWithAssignees` if not already present.)

Add state and an open handler inside the `TimelinePage` function, right after `const getToken = useApiToken();`:

```tsx
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignees | null>(null);

  async function openTask(taskId: string) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, taskId);
    setSelectedTask(res.data);
  }
```

Pass `onTaskClick` to `GanttChart` and render the panel — replace the existing render block's tail:

```tsx
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
        <GanttChart tasks={ganttTasks} startDate={minDate} endDate={maxDate} onTaskClick={taskId => void openTask(taskId)} />
      </div>

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          allTasks={tasks as TaskWithAssignees[]}
          onClose={() => setSelectedTask(null)}
          onUpdate={patch => setSelectedTask(prev => prev ? { ...prev, ...patch } : null)}
        />
      )}
    </div>
  );
}
```

Note: `tasks` in `TimelinePage` is typed `Task[]` (it comes from `listTasks`, which actually returns `TaskWithAssignees[]` at runtime — same as every other page in this module). The `as TaskWithAssignees[]` cast matches how the type was already loosely declared in this file (`const tasks: Task[] = tasksData ?? [];`) without changing that existing declaration.

- [ ] **Step 3: Verify manually**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

Start the dev server, open a project's Timeline view, click a Gantt bar (and a row with "No dates") — confirm the task detail panel opens with the correct task.

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/projects/components/GanttChart.tsx apps/web/modules/projects/pages/TimelinePage.tsx
git commit -m "feat(projects): make gantt bars clickable to open task detail"
```

---

### Task 8: Enrich `TaskDetailPanel.tsx` with subtasks + parent breadcrumb

**Files:**
- Modify: `apps/web/modules/projects/components/TaskDetailPanel.tsx`
- Modify: `apps/web/modules/projects/components/TaskCreateModal.tsx`

- [ ] **Step 1: Add `parentId` support to `TaskCreateModal.tsx`**

Update `Props` and the function signature:

```tsx
interface Props {
  projectId: string;
  defaultStatusId?: string;
  parentId?: string;
  onClose: () => void;
}

export function TaskCreateModal({ projectId, defaultStatusId, parentId, onClose }: Props) {
```

Update `createMutation`'s body to include `parent_id` when present:

```tsx
  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.createTask(token, projectId, {
        title: title.trim(),
        status_id: statusId || statuses[0]?.id,
        priority,
        assignee_ids: selectedIds,
        due_date: dueDate || null,
        parent_id: parentId,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      onClose();
    },
  });
```

- [ ] **Step 2: Implement `TaskDetailPanel.tsx`**

Add the imports and `allTasks` prop:

```tsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { pmApi, type TaskWithAssignees, type TaskStatus, type Comment } from '@/modules/projects/lib/api';
import { TaskCreateModal } from './TaskCreateModal';
```

Update `Props`:

```tsx
interface Props {
  projectId: string;
  task: TaskWithAssignees;
  statuses: TaskStatus[];
  allTasks?: TaskWithAssignees[];
  onClose: () => void;
  onUpdate: (patch: Partial<TaskWithAssignees>) => void;
}
```

Update the function signature and add subtask/parent derivation plus a child-status mutation and create-subtask modal state, right after the existing `commentMutation` block:

```tsx
export function TaskDetailPanel({ projectId, task, statuses, allTasks = [], onClose, onUpdate }: Props) {
```

```tsx
  const [showAddSubtask, setShowAddSubtask] = useState(false);

  const subtasks = allTasks.filter(t => t.parent_id === task.id);
  const parentTask = task.parent_id ? allTasks.find(t => t.id === task.parent_id) ?? null : null;

  const childStatusMutation = useMutation({
    mutationFn: async ({ childId, statusId }: { childId: string; statusId: string }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, childId, { status_id: statusId });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  function toggleSubtaskDone(child: TaskWithAssignees) {
    const currentStatus = statuses.find(s => s.id === child.status_id);
    const doneStatus = statuses.find(s => s.is_done);
    const todoStatus = statuses.find(s => !s.is_done);
    if (!doneStatus || !todoStatus) return;
    const targetStatusId = currentStatus?.is_done ? todoStatus.id : doneStatus.id;
    childStatusMutation.mutate({ childId: child.id, statusId: targetStatusId });
  }
```

Insert a parent breadcrumb above the title in the header — replace the header's opening:

```tsx
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          flexDirection: 'column', alignItems: 'stretch', gap: parentTask ? 6 : 0,
        }}>
          {parentTask && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>
              Subtask of <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{parentTask.title}</span>
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
```

(The existing `editingTitle ? ... : ...` title block and the close button stay exactly as they are, just now nested one level deeper inside this new inner `<div>` — close that inner `<div>` with an extra `</div>` right before the header's own closing `</div>`.)

Add a Subtasks section in the body, right before the Comments section:

```tsx
          {/* Subtasks */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={labelStyle}>Subtasks ({subtasks.length})</div>
              <button
                onClick={() => setShowAddSubtask(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans', fontSize: 11 }}
              >
                <Icon name="plus" size={11} /> Add
              </button>
            </div>
            {subtasks.length === 0 ? (
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>No subtasks.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {subtasks.map(child => {
                  const childStatus = statuses.find(s => s.id === child.status_id);
                  return (
                    <label
                      key={child.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={!!childStatus?.is_done}
                        onChange={() => toggleSubtaskDone(child)}
                        style={{ width: 15, height: 15, cursor: 'pointer' }}
                      />
                      <span style={{
                        fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)',
                        textDecoration: childStatus?.is_done ? 'line-through' : 'none',
                        opacity: childStatus?.is_done ? 0.6 : 1,
                      }}>
                        {child.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

```

Add the modal mount right before the closing `</div>` of the panel's body (or anywhere inside the panel's outer fragment, alongside the existing JSX):

```tsx
      {showAddSubtask && (
        <TaskCreateModal
          projectId={projectId}
          parentId={task.id}
          onClose={() => setShowAddSubtask(false)}
        />
      )}
```

- [ ] **Step 3: Verify manually**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

Start the dev server, open a task's detail panel, click "Add" under Subtasks, create one — confirm it appears in the list, the checkbox toggles its done status, and opening the subtask itself (via a future click-through, out of scope here) is not required since this task only adds inline display.

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/projects/components/TaskDetailPanel.tsx apps/web/modules/projects/components/TaskCreateModal.tsx
git commit -m "feat(projects): add subtasks section and parent breadcrumb to task detail panel"
```

---

## Self-Review

**Spec coverage:** RecurringRuleModal ✅, RecurringRulesPanel ✅ (mounted in SettingsPage, the established home for project config), drag-to-reorder in BoardPage ✅ and ListPage ✅, subtask nesting UI ✅ (ProjectListPage tree rendering, gated to the "All" filter to avoid orphaned-child confusion — documented inline as a deliberate scope boundary), clickable Gantt bars ✅, enriched TaskDetailPanel ✅ (subtasks list + parent breadcrumb, using already-cached `tasks` query data rather than a new fetch).

**Placeholder scan:** No TBD markers. One explicit scope note (Task 6's filter-gating decision) is a documented design choice, not a placeholder. Task 6's icon names note a fallback ("use whichever existing chevron/caret icon names the map already defines") because the exact `Icon.tsx` icon map wasn't independently re-verified this pass — this is a one-line lookup for the implementing engineer, not a missing design decision.

**Type consistency:** `RecurringRule`/`CreateRecurringRuleBody` types in `api.ts` match the shape of Plan 2A's backend response and request bodies exactly (`frequency`, `interval`, `assignee_ids`, etc.). `reorderTask`'s body shape (`{ status_id?, after_task_id? }`) matches Plan 2A's `reorderSchema` exactly. `TaskDetailPanel`'s new `allTasks` prop is optional with a `= []` default, so the three call sites (Board, List, Timeline) that now pass it, plus any future call site that doesn't, all type-check. `buildTaskRows`'s `TaskRow` shape (`{ task, depth, childCount }`) is used consistently in both its definition and the `rows.map(...)` destructuring. `CreateTaskBody.parent_id` (added in Task 1) is consumed by `TaskCreateModal`'s `parentId` prop (added in Task 8) — same underlying field, no naming drift.
