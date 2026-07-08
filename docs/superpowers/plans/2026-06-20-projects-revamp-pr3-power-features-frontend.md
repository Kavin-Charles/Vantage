# Projects Revamp PR3 Power Features — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface PR3's backend additions (time tracking, custom fields, richer automation) in the UI — a Time Tracking page, a custom-fields settings panel + per-task renderer, a real rule-builder modal for automation, an automation run-log viewer, and time/custom-field sections in the task detail panel.

**Architecture:** `CustomFieldsManager` slots into `SettingsPage.tsx` next to the existing Labels panel, following its exact CRUD-list pattern. `RuleBuilder` is a new modal (same overlay/card shell as `TaskCreateModal`) that replaces "rules are created via the API" with a real form covering all 8 trigger types and 7 action types. `RuleCard` is extracted from `AutomationPage`'s current inline JSX so the page, the builder, and (future) other surfaces can share one rendering of a rule. `AutomationLogViewer` is a simple list fed by PR3A's `/automation-logs` endpoint. `TaskDetailPanel` gains two new self-contained sections — Custom Fields and Time Tracking — each with its own query/mutation, inserted right before the Comments section (after Plan 2B's Subtasks section). `TablePage` adds one dynamic column per custom field, populated via a parallel per-visible-task fetch (there is no bulk field-values endpoint — see Self-Review). `TimeTrackingPage` is a new top-level project page in the `AnalyticsPage`-style KPI-card layout, reading PR3A's `/time-summary` endpoint.

**Tech Stack:** Next.js App Router, TanStack Query, no new dependencies.

> **Note on testing:** `apps/web` has no component-test infrastructure (no testing-library, no `.test.tsx` files anywhere in the app). Plans 1B and 2B established the precedent of writing real vitest tests only for pure-logic modules (`lib/api.ts`) and verifying UI/component work manually via `npx tsc --noEmit` + a dev-server check. This plan follows the same precedent — Task 1 has a real automated test; all other tasks are verified manually.

---

## File Structure

| File | Change |
|---|---|
| `apps/web/modules/projects/lib/api.ts` | Add `CustomField`, `CustomFieldValue`, `TimeLog`, `TimeSummary`, `AutomationRule`, `AutomationLog` types + corresponding `pmApi` methods |
| `apps/web/modules/projects/lib/api.test.ts` | Add tests for the new methods (extends the file from Plans 1B/2B) |
| `apps/web/modules/projects/components/CustomFieldRenderer.tsx` | New file |
| `apps/web/modules/projects/components/CustomFieldsManager.tsx` | New file |
| `apps/web/modules/projects/pages/SettingsPage.tsx` | Mount `CustomFieldsManager` below the Labels panel |
| `apps/web/modules/projects/components/RuleBuilder.tsx` | New file |
| `apps/web/modules/projects/components/RuleCard.tsx` | New file (extracted from `AutomationPage.tsx`'s current inline JSX) |
| `apps/web/modules/projects/components/AutomationLogViewer.tsx` | New file |
| `apps/web/modules/projects/pages/AutomationPage.tsx` | Revamp: use `pmApi`, `RuleCard`, `RuleBuilder`, mount `AutomationLogViewer` |
| `apps/web/modules/projects/components/TaskDetailPanel.tsx` | Add Custom Fields + Time Tracking sections |
| `apps/web/modules/projects/pages/TablePage.tsx` | Add dynamic custom-field columns |
| `apps/web/modules/projects/pages/TimeTrackingPage.tsx` | New file |
| `apps/web/app/(dashboard)/projects/[id]/time/page.tsx` | New route file |
| `apps/web/app/(dashboard)/projects/[id]/ProjectNav.tsx` | Add `{ href: 'time', label: 'Time' }` entry |

---

### Task 1: Extend `api.ts` with custom-field, time-log, and automation methods

**Files:**
- Modify: `apps/web/modules/projects/lib/api.ts`
- Test: `apps/web/modules/projects/lib/api.test.ts`

- [ ] **Step 1: Write the failing test**

Append to (or create, if it doesn't yet exist) `apps/web/modules/projects/lib/api.test.ts`:

```ts
describe('pmApi custom fields', () => {
  it('lists custom fields for a project', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: 'field-1' }] });

    const res = await pmApi.listCustomFields('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/custom-fields', { token: 'tok' });
    expect(res.data).toHaveLength(1);
  });

  it('upserts a task field value', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { task_id: 'task-1', custom_field_id: 'field-1', value: 'High' } });

    await pmApi.upsertTaskFieldValue('tok', 'project-1', 'task-1', { custom_field_id: 'field-1', value: 'High' });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/tasks/task-1/field-values',
      expect.objectContaining({ token: 'tok', method: 'POST', body: JSON.stringify({ custom_field_id: 'field-1', value: 'High' }) }),
    );
  });
});

describe('pmApi time logs', () => {
  it('creates a time log', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'log-1', minutes: 45 } });

    await pmApi.createTimeLog('tok', 'project-1', 'task-1', { minutes: 45 });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/tasks/task-1/time-logs',
      expect.objectContaining({ token: 'tok', method: 'POST', body: JSON.stringify({ minutes: 45 }) }),
    );
  });

  it('fetches the project time summary', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { total_minutes: 90, by_task: [], by_user: [] } });

    const res = await pmApi.getTimeSummary('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/time-summary', { token: 'tok' });
    expect(res.data.total_minutes).toBe(90);
  });
});

describe('pmApi automation', () => {
  it('creates an automation rule', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'rule-1' } });

    await pmApi.createAutomationRule('tok', 'project-1', {
      name: 'Notify on overdue',
      trigger: { type: 'task_overdue' },
      actions: [{ type: 'send_notification', user_ids: [], message: 'hi' }],
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/automations',
      expect.objectContaining({ token: 'tok', method: 'POST' }),
    );
  });

  it('lists automation logs', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: 'log-1', rule_name: 'Notify on overdue' }] });

    const res = await pmApi.listAutomationLogs('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/automation-logs', { token: 'tok' });
    expect(res.data[0].rule_name).toBe('Notify on overdue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run modules/projects/lib/api.test.ts`
Expected: FAIL — `pmApi.listCustomFields is not a function` (and similarly for the other new methods).

- [ ] **Step 3: Implement**

In `apps/web/modules/projects/lib/api.ts`, add these interfaces after `Milestone`:

```ts
export interface CustomField {
  id: string; project_id: string; name: string;
  field_type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'CHECKBOX' | 'URL';
  options: string[] | null; created_at: string;
}

export interface CustomFieldValue {
  task_id: string; custom_field_id: string; value: string | null;
  name: string; field_type: CustomField['field_type'];
}

export interface TimeLog {
  id: string; task_id: string; user_id: string; minutes: number;
  logged_at: string; note: string | null; user_name: string | null;
}

export interface TimeSummary {
  total_minutes: number;
  by_task: { task_id: string; title: string; total_minutes: number }[];
  by_user: { user_id: string; user_name: string | null; total_minutes: number }[];
}

export interface AutomationTrigger {
  type: 'task_status_changed' | 'task_overdue' | 'task_assigned' | 'milestone_completed' |
    'client_approved' | 'client_rejected' | 'sprint_started' | 'sprint_ended';
  to_status_id?: string;
}

export type AutomationAction =
  | { type: 'send_notification'; user_ids: string[]; message: string }
  | { type: 'change_task_status'; status_id: string }
  | { type: 'assign_task'; user_id: string }
  | { type: 'mark_milestone_complete'; milestone_id: string }
  | { type: 'send_webhook'; url: string; payload?: Record<string, unknown> }
  | { type: 'create_task'; title: string; status_id?: string; assignee_ids?: string[] }
  | { type: 'set_custom_field'; custom_field_id: string; value: string };

export interface AutomationRule {
  id: string; project_id: string; name: string; is_active: boolean;
  trigger: AutomationTrigger; actions: AutomationAction[];
  created_by: string; created_at: string;
}

export interface AutomationLog {
  id: string; rule_id: string; rule_name: string;
  triggered_at: string; success: boolean; detail: string | null;
}
```

Add these methods inside the `pmApi` object, after `listMembers`:

```ts
  listCustomFields: (token: string, projectId: string) =>
    apiFetch<{ data: CustomField[] }>(`/api/projects/${projectId}/custom-fields`, { token }),
  createCustomField: (token: string, projectId: string, body: { name: string; field_type: CustomField['field_type']; options?: string[] }) =>
    apiFetch<{ data: CustomField }>(`/api/projects/${projectId}/custom-fields`, { token, method: 'POST', body: JSON.stringify(body) }),
  deleteCustomField: (token: string, projectId: string, fieldId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/custom-fields/${fieldId}`, { token, method: 'DELETE' }),
  listTaskFieldValues: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: CustomFieldValue[] }>(`/api/projects/${projectId}/tasks/${taskId}/field-values`, { token }),
  upsertTaskFieldValue: (token: string, projectId: string, taskId: string, body: { custom_field_id: string; value: string | number | boolean | null }) =>
    apiFetch<{ data: { task_id: string; custom_field_id: string; value: string | null } }>(`/api/projects/${projectId}/tasks/${taskId}/field-values`, { token, method: 'POST', body: JSON.stringify(body) }),
  listTimeLogs: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: TimeLog[] }>(`/api/projects/${projectId}/tasks/${taskId}/time-logs`, { token }),
  createTimeLog: (token: string, projectId: string, taskId: string, body: { minutes: number; logged_at?: string; note?: string }) =>
    apiFetch<{ data: TimeLog }>(`/api/projects/${projectId}/tasks/${taskId}/time-logs`, { token, method: 'POST', body: JSON.stringify(body) }),
  deleteTimeLog: (token: string, projectId: string, taskId: string, logId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/tasks/${taskId}/time-logs/${logId}`, { token, method: 'DELETE' }),
  getTimeSummary: (token: string, projectId: string) =>
    apiFetch<{ data: TimeSummary }>(`/api/projects/${projectId}/time-summary`, { token }),
  listAutomationRules: (token: string, projectId: string) =>
    apiFetch<{ data: AutomationRule[] }>(`/api/projects/${projectId}/automations`, { token }),
  createAutomationRule: (token: string, projectId: string, body: { name: string; trigger: AutomationTrigger; actions: AutomationAction[]; is_active?: boolean }) =>
    apiFetch<{ data: AutomationRule }>(`/api/projects/${projectId}/automations`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateAutomationRule: (token: string, projectId: string, ruleId: string, body: Partial<{ name: string; trigger: AutomationTrigger; actions: AutomationAction[]; is_active: boolean }>) =>
    apiFetch<{ data: AutomationRule }>(`/api/projects/${projectId}/automations/${ruleId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteAutomationRule: (token: string, projectId: string, ruleId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/automations/${ruleId}`, { token, method: 'DELETE' }),
  listAutomationLogs: (token: string, projectId: string) =>
    apiFetch<{ data: AutomationLog[] }>(`/api/projects/${projectId}/automation-logs`, { token }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run modules/projects/lib/api.test.ts`
Expected: PASS (all tests, including any carried over from Plans 1B/2B).

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/projects/lib/api.ts apps/web/modules/projects/lib/api.test.ts
git commit -m "feat(projects): add custom-field, time-log, and automation API methods"
```

---

### Task 2: `CustomFieldRenderer.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/CustomFieldRenderer.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import type { CustomField } from '@/modules/projects/lib/api';

interface Props {
  field: CustomField;
  value: string | null;
  onChange: (value: string | number | boolean | null) => void;
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13,
  padding: '6px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};

export function CustomFieldRenderer({ field, value, onChange }: Props) {
  if (field.field_type === 'CHECKBOX') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)' }}>
          {value === 'true' ? 'Yes' : 'No'}
        </span>
      </label>
    );
  }

  if (field.field_type === 'SELECT') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="">—</option>
        {(field.options ?? []).map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.field_type === 'NUMBER') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={inputStyle}
      />
    );
  }

  if (field.field_type === 'DATE') {
    return (
      <input
        type="date"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        style={inputStyle}
      />
    );
  }

  if (field.field_type === 'URL') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="url"
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          placeholder="https://…"
          style={inputStyle}
        />
        {value && (
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontFamily: 'DM Sans', fontSize: 12, flexShrink: 0 }}>
            Open
          </a>
        )}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      style={inputStyle}
    />
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No new errors from this file. There is no automated test for this component per the established precedent — it is exercised manually in Task 8 once it's mounted inside `TaskDetailPanel`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/CustomFieldRenderer.tsx
git commit -m "feat(projects): add CustomFieldRenderer component"
```

---

### Task 3: `CustomFieldsManager.tsx` + mount in `SettingsPage.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/CustomFieldsManager.tsx`
- Modify: `apps/web/modules/projects/pages/SettingsPage.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type CustomField } from '@/modules/projects/lib/api';
import { Icon } from '@/modules/shared/components/ui/Icon';

const FIELD_TYPES: CustomField['field_type'][] = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'URL'];

const inputStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13,
  padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};

interface Props {
  projectId: string;
}

export function CustomFieldsManager({ projectId }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: async () => pmApi.listCustomFields(await getToken(), projectId),
  });
  const fields: CustomField[] = data?.data ?? [];

  const [name, setName] = useState('');
  const [type, setType] = useState<CustomField['field_type']>('TEXT');
  const [optionsText, setOptionsText] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const options = type === 'SELECT'
        ? optionsText.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;
      return pmApi.createCustomField(token, projectId, { name: name.trim(), field_type: type, options });
    },
    onSuccess: () => {
      setName('');
      setOptionsText('');
      void qc.invalidateQueries({ queryKey: ['custom-fields', projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const token = await getToken();
      return pmApi.deleteCustomField(token, projectId, fieldId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['custom-fields', projectId] }),
  });

  const canCreate = name.trim().length > 0 && fields.length < 20 &&
    (type !== 'SELECT' || optionsText.trim().length > 0);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 16 }}>
      <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
        Custom Fields
      </p>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
        Track extra task data — budget codes, ticket IDs, anything specific to this project. {fields.length}/20 fields.
      </p>

      {fields.length === 0 && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 16, fontStyle: 'italic' }}>
          No custom fields yet.
        </div>
      )}

      {fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {fields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{f.name}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text2)' }}>
                {f.field_type}
              </span>
              <button
                onClick={() => deleteMutation.mutate(f.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: '0 2px', opacity: 0.7 }}
                title="Delete field"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Field name…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <select value={type} onChange={e => setType(e.target.value as CustomField['field_type'])} style={{ ...inputStyle, width: 120, cursor: 'pointer' }}>
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {type === 'SELECT' && (
          <input
            value={optionsText}
            onChange={e => setOptionsText(e.target.value)}
            placeholder="Options, comma-separated…"
            style={inputStyle}
          />
        )}
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={!canCreate || createMutation.isPending}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
            opacity: !canCreate ? 0.5 : 1, alignSelf: 'flex-start',
          }}
        >
          {createMutation.isPending ? '…' : 'Add Field'}
        </button>
      </div>
      {createMutation.isError && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: '8px 0 0' }}>Failed to create field.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `SettingsPage.tsx`**

In `apps/web/modules/projects/pages/SettingsPage.tsx`, add the import near the other component imports:

```ts
import { CustomFieldsManager } from '@/modules/projects/components/CustomFieldsManager';
```

Then render it right after the Labels card's closing `</div>` (the right-column wrapper currently ends with the Labels card alone) — wrap the right column's contents in a fragment so both cards stack:

```tsx
        {/* Right: Labels + Custom Fields */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            {/* ...existing Labels card content, unchanged... */}
          </div>
          <CustomFieldsManager projectId={projectId} />
        </div>
```

(Only the wrapping `<div>` changes — the Labels card's own JSX between `<p>Labels</p>` and its closing tag stays exactly as it is today. Add the `CustomFieldsManager` line as the new sibling after it.)

- [ ] **Step 3: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors.
Then run the dev server (`pnpm --filter web dev`), open a project's Settings page, and confirm: the Custom Fields panel renders below Labels, adding a TEXT field works, switching the type selector to SELECT reveals the options input, and deleting a field removes it from the list.

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/projects/components/CustomFieldsManager.tsx apps/web/modules/projects/pages/SettingsPage.tsx
git commit -m "feat(projects): add custom fields manager to project settings"
```

---

### Task 4: `RuleBuilder.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/RuleBuilder.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  pmApi, type AutomationRule, type AutomationTrigger, type AutomationAction,
  type TaskStatus, type ProjectMember, type Milestone, type CustomField,
} from '@/modules/projects/lib/api';

const TRIGGER_TYPES: AutomationTrigger['type'][] = [
  'task_status_changed', 'task_overdue', 'task_assigned', 'milestone_completed',
  'client_approved', 'client_rejected', 'sprint_started', 'sprint_ended',
];

const ACTION_TYPES: AutomationAction['type'][] = [
  'send_notification', 'change_task_status', 'assign_task', 'mark_milestone_complete',
  'send_webhook', 'create_task', 'set_custom_field',
];

function defaultAction(type: AutomationAction['type']): AutomationAction {
  switch (type) {
    case 'send_notification': return { type, user_ids: [], message: '' };
    case 'change_task_status': return { type, status_id: '' };
    case 'assign_task': return { type, user_id: '' };
    case 'mark_milestone_complete': return { type, milestone_id: '' };
    case 'send_webhook': return { type, url: '' };
    case 'create_task': return { type, title: '' };
    case 'set_custom_field': return { type, custom_field_id: '', value: '' };
  }
}

interface Props {
  projectId: string;
  rule?: AutomationRule;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
  fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

export function RuleBuilder({ projectId, rule, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);

  const [name, setName] = useState(rule?.name ?? '');
  const [triggerType, setTriggerType] = useState<AutomationTrigger['type']>(rule?.trigger.type ?? 'task_status_changed');
  const [toStatusId, setToStatusId] = useState(rule?.trigger.to_status_id ?? '');
  const [actions, setActions] = useState<AutomationAction[]>(rule?.actions ?? [defaultAction('send_notification')]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    nameRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 150);
  }, [onClose]);

  const { data: statusesData } = useQuery({
    queryKey: ['statuses', projectId],
    queryFn: async () => pmApi.listStatuses(await getToken(), projectId),
  });
  const statuses: TaskStatus[] = statusesData?.data ?? [];

  const { data: membersData } = useQuery({
    queryKey: ['members', projectId],
    queryFn: async () => pmApi.listMembers(await getToken(), projectId),
  });
  const members: ProjectMember[] = membersData?.data ?? [];

  const { data: milestonesData } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => pmApi.listMilestones(await getToken(), projectId),
  });
  const milestones: Milestone[] = milestonesData?.data ?? [];

  const { data: fieldsData } = useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: async () => pmApi.listCustomFields(await getToken(), projectId),
  });
  const customFields: CustomField[] = fieldsData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const trigger: AutomationTrigger = triggerType === 'task_status_changed'
        ? { type: triggerType, ...(toStatusId ? { to_status_id: toStatusId } : {}) }
        : { type: triggerType };
      const body = { name: name.trim(), trigger, actions };
      return rule
        ? pmApi.updateAutomationRule(token, projectId, rule.id, body)
        : pmApi.createAutomationRule(token, projectId, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['automation-rules', projectId] });
      handleClose();
    },
  });

  function updateAction(index: number, next: AutomationAction) {
    setActions(prev => prev.map((a, i) => (i === index ? next : a)));
  }

  function removeAction(index: number) {
    setActions(prev => prev.filter((_, i) => i !== index));
  }

  function toggleUserId(action: AutomationAction & { type: 'send_notification' }, index: number, userId: string) {
    const next = action.user_ids.includes(userId)
      ? action.user_ids.filter(id => id !== userId)
      : [...action.user_ids, userId];
    updateAction(index, { ...action, user_ids: next });
  }

  const canSave = name.trim().length > 0 && actions.length > 0 && actions.length <= 10 && !saveMutation.isPending;

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
          width: 600, maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>
            {rule ? 'Edit Rule' : 'New Rule'}
          </span>
          <button type="button" aria-label="Close" onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div>
          <label style={labelStyle}>Rule Name *</label>
          <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Notify on overdue" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>When</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={triggerType} onChange={e => setTriggerType(e.target.value as AutomationTrigger['type'])} style={{ ...inputStyle, cursor: 'pointer' }}>
              {TRIGGER_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            {triggerType === 'task_status_changed' && (
              <select value={toStatusId} onChange={e => setToStatusId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">any status</option>
                {statuses.map(s => <option key={s.id} value={s.id}>→ {s.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Then ({actions.length}/10)</label>
            <button
              type="button"
              onClick={() => setActions(prev => [...prev, defaultAction('send_notification')])}
              disabled={actions.length >= 10}
              style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', opacity: actions.length >= 10 ? 0.5 : 1 }}
            >
              + Add action
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actions.map((action, index) => (
              <div key={index} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select
                    value={action.type}
                    onChange={e => updateAction(index, defaultAction(e.target.value as AutomationAction['type']))}
                    style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}
                  >
                    {ACTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button type="button" onClick={() => removeAction(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '0 4px' }}>×</button>
                </div>

                {action.type === 'send_notification' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {members.map(m => (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => toggleUserId(action, index, m.user_id)}
                          style={{
                            fontFamily: 'DM Sans', fontSize: 12, padding: '4px 10px', borderRadius: 20,
                            border: '1px solid var(--border)', cursor: 'pointer',
                            background: action.user_ids.includes(m.user_id) ? 'var(--text)' : 'var(--surface)',
                            color: action.user_ids.includes(m.user_id) ? '#fff' : 'var(--text2)',
                          }}
                        >
                          {m.name ?? m.email}
                        </button>
                      ))}
                    </div>
                    <input
                      value={action.message}
                      onChange={e => updateAction(index, { ...action, message: e.target.value })}
                      placeholder="Notification message…"
                      style={inputStyle}
                    />
                  </div>
                )}

                {action.type === 'change_task_status' && (
                  <select value={action.status_id} onChange={e => updateAction(index, { ...action, status_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">select status…</option>
                    {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}

                {action.type === 'assign_task' && (
                  <select value={action.user_id} onChange={e => updateAction(index, { ...action, user_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">select member…</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name ?? m.email}</option>)}
                  </select>
                )}

                {action.type === 'mark_milestone_complete' && (
                  <select value={action.milestone_id} onChange={e => updateAction(index, { ...action, milestone_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">select milestone…</option>
                    {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}

                {action.type === 'send_webhook' && (
                  <input
                    type="url"
                    value={action.url}
                    onChange={e => updateAction(index, { ...action, url: e.target.value })}
                    placeholder="https://…"
                    style={inputStyle}
                  />
                )}

                {action.type === 'create_task' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      value={action.title}
                      onChange={e => updateAction(index, { ...action, title: e.target.value })}
                      placeholder="New task title…"
                      style={inputStyle}
                    />
                    <select
                      value={action.status_id ?? ''}
                      onChange={e => updateAction(index, { ...action, status_id: e.target.value || undefined })}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="">default status</option>
                      {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {action.type === 'set_custom_field' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={action.custom_field_id}
                      onChange={e => updateAction(index, { ...action, custom_field_id: e.target.value })}
                      style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}
                    >
                      <option value="">select field…</option>
                      {customFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <input
                      value={action.value}
                      onChange={e => updateAction(index, { ...action, value: e.target.value })}
                      placeholder="Value…"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {saveMutation.isError && (
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: 0 }}>Failed to save rule.</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button type="button" onClick={handleClose} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'none', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: 8,
              background: canSave ? 'var(--text)' : 'var(--surface2)',
              color: canSave ? '#fff' : 'var(--text3)',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
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

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors. Full interactive verification happens in Task 7 once `AutomationPage.tsx` mounts this component.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/RuleBuilder.tsx
git commit -m "feat(projects): add automation rule builder modal"
```

---

### Task 5: `RuleCard.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/RuleCard.tsx`

- [ ] **Step 1: Write the component**

This extracts and extends the trigger/action label maps and rule-card JSX currently inlined in `AutomationPage.tsx`, adding labels for the two PR3A action types.

```tsx
'use client';

import type { AutomationRule } from '@/modules/projects/lib/api';

export const TRIGGER_LABELS: Record<string, string> = {
  task_status_changed: 'Task status changes',
  task_overdue: 'Task becomes overdue',
  task_assigned: 'Task is assigned',
  milestone_completed: 'Milestone completed',
  client_approved: 'Client approves',
  client_rejected: 'Client rejects',
  sprint_started: 'Sprint starts',
  sprint_ended: 'Sprint ends',
};

export const ACTION_LABELS: Record<string, string> = {
  send_notification: 'Send notification',
  change_task_status: 'Change task status',
  assign_task: 'Assign task',
  mark_milestone_complete: 'Mark milestone complete',
  send_webhook: 'Send webhook',
  create_task: 'Create task',
  set_custom_field: 'Set custom field',
};

interface Props {
  rule: AutomationRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isToggling?: boolean;
}

export function RuleCard({ rule, onToggle, onEdit, onDelete, isToggling }: Props) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10, padding: 16,
      background: 'var(--surface)', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{rule.name}</span>
          <span style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            background: rule.is_active ? 'var(--green-bg)' : 'var(--surface2)',
            color: rule.is_active ? 'var(--green)' : 'var(--text3)',
          }}>
            {rule.is_active ? 'Active' : 'Paused'}
          </span>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 4px' }}>
          When <strong style={{ color: 'var(--text2)' }}>{TRIGGER_LABELS[rule.trigger.type] ?? rule.trigger.type}</strong>
        </p>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: 0 }}>
          Then {rule.actions.map(a => ACTION_LABELS[a.type] ?? a.type).join(', ')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onToggle}
          disabled={isToggling}
          style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}
        >
          {rule.is_active ? 'Pause' : 'Activate'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--red-bg)', background: 'none', color: 'var(--red)', cursor: 'pointer' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors. Visual verification happens in Task 7.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/RuleCard.tsx
git commit -m "feat(projects): extract RuleCard component"
```

---

### Task 6: `AutomationLogViewer.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/AutomationLogViewer.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type AutomationLog } from '@/modules/projects/lib/api';

interface Props {
  projectId: string;
}

export function AutomationLogViewer({ projectId }: Props) {
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['automation-logs', projectId],
    queryFn: async () => pmApi.listAutomationLogs(await getToken(), projectId),
  });
  const logs: AutomationLog[] = data?.data ?? [];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 20 }}>
      <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 14px' }}>
        Recent Runs
      </p>

      {isLoading && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>Loading…</p>
      )}

      {!isLoading && logs.length === 0 && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0, fontStyle: 'italic' }}>
          No automation runs yet.
        </p>
      )}

      {logs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{
                fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, marginTop: 2,
                background: log.success ? 'var(--green-bg)' : 'var(--red-bg)',
                color: log.success ? 'var(--green)' : 'var(--red)',
              }}>
                {log.success ? 'OK' : 'Failed'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{log.rule_name}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                    {new Date(log.triggered_at).toLocaleString()}
                  </span>
                </div>
                {log.detail && (
                  <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>{log.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors. Visual verification happens in Task 7.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/AutomationLogViewer.tsx
git commit -m "feat(projects): add automation log viewer"
```

---

### Task 7: Revamp `AutomationPage.tsx`

**Files:**
- Modify: `apps/web/modules/projects/pages/AutomationPage.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `apps/web/modules/projects/pages/AutomationPage.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type AutomationRule } from '@/modules/projects/lib/api';
import { RuleCard } from '@/modules/projects/components/RuleCard';
import { RuleBuilder } from '@/modules/projects/components/RuleBuilder';
import { AutomationLogViewer } from '@/modules/projects/components/AutomationLogViewer';

const MAX_RULES = 20;

export default function AutomationPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['automation-rules', projectId],
    queryFn: async () => pmApi.listAutomationRules(await getToken(), projectId),
  });
  const rules: AutomationRule[] = data?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: async (rule: AutomationRule) => {
      const token = await getToken();
      return pmApi.updateAutomationRule(token, projectId, rule.id, { is_active: !rule.is_active });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['automation-rules', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const token = await getToken();
      return pmApi.deleteAutomationRule(token, projectId, ruleId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['automation-rules', projectId] }),
  });

  function handleDelete(rule: AutomationRule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    deleteMutation.mutate(rule.id);
  }

  if (isLoading) {
    return <div style={{ padding: 24, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 4px' }}>Automation</h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>
            {rules.length}/{MAX_RULES} rules
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingRule(null); setBuilderOpen(true); }}
          disabled={rules.length >= MAX_RULES}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
            opacity: rules.length >= MAX_RULES ? 0.5 : 1,
          }}
        >
          New Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', padding: '40px 0', textAlign: 'center' }}>
          No automation rules yet. Click "New Rule" to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              isToggling={toggleMutation.isPending && toggleMutation.variables?.id === rule.id}
              onToggle={() => toggleMutation.mutate(rule)}
              onEdit={() => { setEditingRule(rule); setBuilderOpen(true); }}
              onDelete={() => handleDelete(rule)}
            />
          ))}
        </div>
      )}

      <AutomationLogViewer projectId={projectId} />

      {builderOpen && (
        <RuleBuilder
          projectId={projectId}
          rule={editingRule ?? undefined}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors.
Then start the dev server, open a project's Automation page, and confirm: existing rules render via `RuleCard`, "New Rule" opens `RuleBuilder` and creating a rule (e.g. trigger `task_overdue` → action `send_notification`) shows up in the list, "Edit" opens the builder pre-filled, "Pause"/"Activate" toggles the badge, "Delete" removes it after confirmation, and the Recent Runs panel renders (empty state if no rules have fired yet).

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/AutomationPage.tsx
git commit -m "feat(projects): revamp automation page with rule builder and log viewer"
```

---

### Task 8: `TaskDetailPanel.tsx` — Custom Fields + Time Tracking sections

**Files:**
- Modify: `apps/web/modules/projects/components/TaskDetailPanel.tsx`

> By the time this task executes, Plan 2B has already added an `allTasks` prop, a parent breadcrumb, and a "Subtasks" section to this file, inserted right before the existing `{/* Comments */}` block. This task adds two more sections in the same spot, so the body reads: metadata grid → assignees → Subtasks (2B) → **Custom Fields** → **Time Tracking** → Comments.

- [ ] **Step 1: Add imports and new queries/mutations**

At the top of `apps/web/modules/projects/components/TaskDetailPanel.tsx`, extend the import line:

```ts
import { pmApi, type TaskWithAssignees, type TaskStatus, type Comment, type CustomField, type CustomFieldValue, type TimeLog } from '@/modules/projects/lib/api';
import { useAuth } from '@/modules/shared/lib/AuthContext';
```

Inside the component body, after the existing `commentsData` query, add:

```ts
  const { user } = useAuth();

  const { data: fieldsData } = useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: async () => pmApi.listCustomFields(await getToken(), projectId),
  });
  const customFields: CustomField[] = fieldsData?.data ?? [];

  const { data: valuesData } = useQuery({
    queryKey: ['field-values', projectId, task.id],
    queryFn: async () => pmApi.listTaskFieldValues(await getToken(), projectId, task.id),
  });
  const fieldValues: CustomFieldValue[] = valuesData?.data ?? [];

  const upsertValueMutation = useMutation({
    mutationFn: async (body: { custom_field_id: string; value: string | number | boolean | null }) => {
      const token = await getToken();
      return pmApi.upsertTaskFieldValue(token, projectId, task.id, body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['field-values', projectId, task.id] }),
  });

  const { data: timeLogsData } = useQuery({
    queryKey: ['time-logs', projectId, task.id],
    queryFn: async () => pmApi.listTimeLogs(await getToken(), projectId, task.id),
  });
  const timeLogs: TimeLog[] = timeLogsData?.data ?? [];

  const [minutesInput, setMinutesInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const createTimeLogMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.createTimeLog(token, projectId, task.id, {
        minutes: Number(minutesInput),
        note: noteInput.trim() || undefined,
      });
    },
    onSuccess: () => {
      setMinutesInput('');
      setNoteInput('');
      void qc.invalidateQueries({ queryKey: ['time-logs', projectId, task.id] });
    },
  });

  const deleteTimeLogMutation = useMutation({
    mutationFn: async (logId: string) => {
      const token = await getToken();
      return pmApi.deleteTimeLog(token, projectId, task.id, logId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['time-logs', projectId, task.id] }),
  });

  const totalLoggedMinutes = timeLogs.reduce((sum, l) => sum + l.minutes, 0);
```

- [ ] **Step 2: Add the import for `CustomFieldRenderer`**

```ts
import { CustomFieldRenderer } from '@/modules/projects/components/CustomFieldRenderer';
```

- [ ] **Step 3: Insert the two new sections**

Find the `{/* Comments */}` comment in the body (this sits right after Plan 2B's Subtasks section) and insert the following immediately before it:

```tsx
          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>Custom Fields</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {customFields.map(field => {
                  const existing = fieldValues.find(v => v.custom_field_id === field.id);
                  return (
                    <div key={field.id}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{field.name}</div>
                      <CustomFieldRenderer
                        field={field}
                        value={existing?.value ?? null}
                        onChange={value => upsertValueMutation.mutate({ custom_field_id: field.id, value })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time Tracking */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ ...labelStyle, marginBottom: 0 }}>Time Tracking</div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                {Math.floor(totalLoggedMinutes / 60)}h {totalLoggedMinutes % 60}m logged
              </span>
            </div>

            {timeLogs.length === 0 ? (
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', marginBottom: 10 }}>No time logged yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {timeLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg)' }}>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {Math.floor(log.minutes / 60)}h {log.minutes % 60}m
                    </span>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', flex: 1 }}>
                      {log.user_name ?? 'Unknown'}{log.note ? ` — ${log.note}` : ''}
                    </span>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>
                      {new Date(log.logged_at).toLocaleDateString()}
                    </span>
                    {log.user_id === user?.id && (
                      <button
                        onClick={() => deleteTimeLogMutation.mutate(log.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px' }}
                        title="Delete log"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                min={1}
                max={1440}
                value={minutesInput}
                onChange={e => setMinutesInput(e.target.value)}
                placeholder="Minutes"
                style={{ ...selectStyle, width: 90 }}
              />
              <input
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Note (optional)…"
                style={{ ...selectStyle, flex: 1 }}
              />
              <button
                onClick={() => { if (Number(minutesInput) > 0) createTimeLogMutation.mutate(); }}
                disabled={!minutesInput || Number(minutesInput) <= 0 || createTimeLogMutation.isPending}
                style={{
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
                  background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: !minutesInput || Number(minutesInput) <= 0 ? 0.5 : 1,
                }}
              >
                {createTimeLogMutation.isPending ? '…' : 'Log'}
              </button>
            </div>
          </div>

```

(`selectStyle` is the existing inline style object already defined earlier in this file and reused by the Priority/Due-date selects — reuse it here rather than introducing a third style object.)

- [ ] **Step 4: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors.
Then open a task's detail panel and confirm: if the project has custom fields, they render with the right input type and persist on change; logging time appends a row with the correct duration and updates the total; deleting a log you created removes it (and the delete button is hidden on other users' logs).

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/projects/components/TaskDetailPanel.tsx
git commit -m "feat(projects): add custom fields and time tracking to task detail panel"
```

---

### Task 9: `TablePage.tsx` — dynamic custom-field columns

**Files:**
- Modify: `apps/web/modules/projects/pages/TablePage.tsx`

- [ ] **Step 1: Add the custom-fields query and per-task value fetches**

In `apps/web/modules/projects/pages/TablePage.tsx`, extend the import line:

```ts
import { pmApi, type TaskWithAssignees, type TaskStatus, type CustomField, type CustomFieldValue } from '@/modules/projects/lib/api';
```

After the existing `statuses` query, add:

```ts
  const { data: fieldsData } = useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: async () => pmApi.listCustomFields(await getToken(), projectId),
  });
  const customFields: CustomField[] = fieldsData?.data ?? [];

  const visibleTaskIds = filtered.map(t => t.id);

  const { data: valuesData } = useQuery({
    queryKey: ['field-values-bulk', projectId, visibleTaskIds.join(',')],
    queryFn: async () => {
      const token = await getToken();
      const results = await Promise.all(
        visibleTaskIds.map(taskId => pmApi.listTaskFieldValues(token, projectId, taskId)),
      );
      const map = new Map<string, CustomFieldValue[]>();
      visibleTaskIds.forEach((taskId, i) => map.set(taskId, results[i].data ?? []));
      return map;
    },
    enabled: visibleTaskIds.length > 0 && customFields.length > 0,
  });
  const valuesByTask = valuesData ?? new Map<string, CustomFieldValue[]>();
```

(`filtered` is the existing `useMemo`-derived, already-filtered task list this page renders rows from — the custom-field fetch runs only over what's actually visible, since there is no bulk project-wide field-values endpoint on the backend.)

- [ ] **Step 2: Render the extra header cells**

Find the table header row (the one rendering `['Task','Status','Priority','Due Date','Assignees','Est.']`) and add one `<th>` per custom field after the existing ones:

```tsx
                {customFields.map(f => (
                  <th key={f.id} style={thStyle}>{f.name}</th>
                ))}
```

(`thStyle` is the existing style object already applied to the other header cells in this file.)

- [ ] **Step 3: Render the extra body cells**

In the row-rendering loop, after the existing cells for a task `t`, add:

```tsx
                {customFields.map(f => {
                  const value = valuesByTask.get(t.id)?.find(v => v.custom_field_id === f.id)?.value ?? null;
                  return (
                    <td key={f.id} style={tdStyle}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)' }}>
                        {f.field_type === 'CHECKBOX' ? (value === 'true' ? '✓' : '—') : (value ?? '—')}
                      </span>
                    </td>
                  );
                })}
```

(`tdStyle` is the existing style object already applied to the other body cells in this file. This is a read-only display — editing custom fields happens in `TaskDetailPanel`, not inline in the table, matching the table's existing read-mostly pattern for everything except Status.)

- [ ] **Step 4: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors.
Then open the Table view on a project with at least one custom field set on at least one task, and confirm a new column appears per field, populated for tasks that have a value and showing `—` for tasks that don't.

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/projects/pages/TablePage.tsx
git commit -m "feat(projects): show custom field columns in table view"
```

---

### Task 10: `TimeTrackingPage.tsx` + route + nav entry

**Files:**
- Create: `apps/web/modules/projects/pages/TimeTrackingPage.tsx`
- Create: `apps/web/app/(dashboard)/projects/[id]/time/page.tsx`
- Modify: `apps/web/app/(dashboard)/projects/[id]/ProjectNav.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TimeSummary } from '@/modules/projects/lib/api';

function formatHM(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', flex: 1, minWidth: 0 }}>
      <div style={{ height: 4, background: 'var(--blue)' }} />
      <div style={{ padding: '20px 22px 22px' }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          {label}
        </div>
        <div style={{ fontFamily: 'Instrument Serif', fontSize: 36, color: 'var(--text)', lineHeight: 1, marginBottom: 6 }}>
          {value}
        </div>
        {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>{sub}</div>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'Instrument Serif', fontSize: 17, color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  );
}

export default function TimeTrackingPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['time-summary', projectId],
    queryFn: async () => pmApi.getTimeSummary(await getToken(), projectId),
  });
  const summary: TimeSummary | undefined = data?.data;

  if (isLoading) {
    return <div style={{ padding: 32, fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>Loading time tracking…</div>;
  }

  const byTask = summary?.by_task ?? [];
  const byUser = summary?.by_user ?? [];
  const maxTaskMinutes = Math.max(...byTask.map(t => t.total_minutes), 1);

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        <KpiCard label="Total Logged" value={formatHM(summary?.total_minutes ?? 0)} sub="across all tasks" />
        <KpiCard label="Tasks With Time" value={String(byTask.length)} sub="tasks logged against" />
        <KpiCard label="Contributors" value={String(byUser.length)} sub="people logging time" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <Section title="By Task">
          {byTask.length === 0 ? (
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>No time logged yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {byTask.map(t => {
                const pct = Math.round((t.total_minutes / maxTaskMinutes) * 100);
                return (
                  <div key={t.task_id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>{t.title}</span>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{formatHM(t.total_minutes)}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: 'var(--blue)', width: `${pct}%`, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="By Person">
          {byUser.length === 0 ? (
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>No time logged yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {byUser.map(u => (
                <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>{u.user_name ?? 'Unknown'}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{formatHM(u.total_minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route file**

Create `apps/web/app/(dashboard)/projects/[id]/time/page.tsx`:

```ts
export { default } from '@/modules/projects/pages/TimeTrackingPage';
```

- [ ] **Step 3: Add the nav entry**

In `apps/web/app/(dashboard)/projects/[id]/ProjectNav.tsx`, find the `NAV` array and add a `time` entry right after `sprints` (matching the working top-level-route pattern — not after `automation`, which points at a route that does not exist):

```ts
const NAV = [
  { href: 'tasks', label: 'Tasks' },
  { href: 'roadmap', label: 'Roadmap' },
  { href: 'milestones', label: 'Milestones' },
  { href: 'members', label: 'Members' },
  { href: 'sprints', label: 'Sprints' },
  { href: 'time', label: 'Time' },
  { href: 'analytics', label: 'Analytics' },
  { href: 'portal', label: 'Portal' },
  { href: 'docs', label: 'Docs' },
  { href: 'automation', label: 'Automation' },
  { href: 'settings', label: 'Settings' },
];
```

(Read the file first to confirm the exact current property names on each entry — e.g. whether it's `label` or the link text is derived from `href` directly — and match that shape exactly when inserting the new `time` entry.)

- [ ] **Step 4: Verify manually**

Run: `cd apps/web && npx tsc --noEmit` — expect no new errors.
Then start the dev server, open a project, click "Time" in the nav, and confirm the page loads with KPI cards and the by-task/by-user breakdowns (or their empty states if no time has been logged).

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/projects/pages/TimeTrackingPage.tsx "apps/web/app/(dashboard)/projects/[id]/time/page.tsx" "apps/web/app/(dashboard)/projects/[id]/ProjectNav.tsx"
git commit -m "feat(projects): add time tracking page"
```

---

## Self-Review

**Spec coverage:** Time Tracking UI ✅ (`TimeTrackingPage` + per-task logging in `TaskDetailPanel`), Custom Fields UI ✅ (`CustomFieldsManager` + `CustomFieldRenderer` + per-task editing in `TaskDetailPanel` + read-only columns in `TablePage`), richer automation rules UI ✅ (`RuleBuilder` covers all 8 trigger types and all 7 action types including PR3A's two new ones, `RuleCard` replaces the inline JSX, `AutomationLogViewer` surfaces PR3A's `/automation-logs` endpoint — closing the "rules are created via the API" gap entirely).

**Placeholder scan:** No TBD markers. Task 9's body-cell snippet and Task 10's nav-entry step both reference existing style objects/array shapes by name (`thStyle`, `tdStyle`, the `NAV` array's actual property names) rather than guessing their exact current form, with an explicit instruction to read the file first — this is a pointer to real, already-existing code in the target file, not a placeholder for content that doesn't exist yet.

**Type consistency:** `TimeSummary`'s shape (`total_minutes`, `by_task: [{task_id, title, total_minutes}]`, `by_user: [{user_id, user_name, total_minutes}]`) matches Plan 3A's `createTimeSummaryRouter` response exactly. `AutomationLog`'s shape (`id`, `rule_id`, `rule_name`, `triggered_at`, `success`, `detail`) matches Plan 3A's `createAutomationLogsRouter` response exactly. `AutomationAction`'s `create_task` (`title`, `status_id?`, `assignee_ids?`) and `set_custom_field` (`custom_field_id`, `value`) variants match Plan 3A's extended `actionSchema` exactly, including `value` being a plain `string` (not the broader union `CustomFieldValue.value` uses elsewhere) since that's what the Zod schema on the backend requires for this one action type. `CustomField`'s `field_type` union and `CustomFieldRenderer`'s per-type branches use identical literals throughout (`TEXT`/`NUMBER`/`DATE`/`SELECT`/`CHECKBOX`/`URL`), matching the backend's `createFieldSchema` enum verbatim.

**Known, deliberate tradeoff:** `TablePage`'s custom-field columns (Task 9) fetch one `field-values` request per visible task in parallel, because `custom-fields.ts`'s `createTaskFieldValuesRouter` only exposes a per-task GET — there is no project-wide bulk listing endpoint. Adding one would be a backend change, which is out of scope for a frontend-only plan; the per-task fan-out is bounded by whatever the table's existing filters already render, not the project's total task count, so it scales with what's on screen rather than with project size.
