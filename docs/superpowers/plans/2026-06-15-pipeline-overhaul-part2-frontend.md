# Pipeline Overhaul — Part 2: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the pipeline frontend from scratch — delete all old Record/Conversion components and replace with clean generalized Item-based Kanban, Table, and Detail views backed by the new JSONB API.

**Architecture:** Module lives in `apps/web/modules/pipeline/`. Pages in `apps/web/app/(dashboard)/pipeline/` and `apps/web/app/(dashboard)/settings/pipelines/`. All data via TanStack Query. Drag-drop via HTML5 native API. No Tailwind — CSS vars design system only (matches `--bg`, `--surface`, `--border`, `--text` tokens).

**Tech Stack:** Next.js 15 App Router, TanStack Query, TypeScript strict, CSS custom properties, DM Sans + Instrument Serif fonts

**Branch:** `feat/pipeline-overhaul` (already created — continue on this branch)

**Prerequisite:** Part 1 (backend) deployed or running locally.

---

### Task 1: Delete Old Files

**Files:**
- Delete all listed below

- [ ] **Step 1: Delete old pipeline module files**

```bash
# Components
rm apps/web/modules/pipeline/components/ConversionModal.tsx
rm apps/web/modules/pipeline/components/ConversionWizard.tsx
rm apps/web/modules/pipeline/components/FieldMappingEditor.tsx
rm apps/web/modules/pipeline/components/PipelineEditor.tsx
rm apps/web/modules/pipeline/components/RecordCard.tsx
rm apps/web/modules/pipeline/components/RecordDetail.tsx
rm apps/web/modules/pipeline/components/RecordDetailPanel.tsx
rm apps/web/modules/pipeline/components/RecordForm.tsx
rm apps/web/modules/pipeline/components/RecordKanban.tsx
rm apps/web/modules/pipeline/components/RecordList.tsx
rm apps/web/modules/pipeline/components/RecordTable.tsx
rm apps/web/modules/pipeline/components/RecordTypeEditor.tsx
rm apps/web/modules/pipeline/components/TemplateFieldMapper.tsx

# Pages
rm apps/web/modules/pipeline/pages/GroupTabs.tsx
rm apps/web/modules/pipeline/pages/ItemModal.tsx
rm apps/web/modules/pipeline/pages/PipelineSwitcher.tsx

# Lib
rm apps/web/modules/pipeline/lib/record-types.ts
rm apps/web/modules/pipeline/lib/records.ts
rm apps/web/modules/pipeline/lib/conversions.ts
rm apps/web/modules/pipeline/lib/item-groups.ts
```

- [ ] **Step 2: Delete old settings pages**

```bash
rm -rf apps/web/app/\(dashboard\)/settings/conversions
rm -rf apps/web/app/\(dashboard\)/settings/record-types
rm -rf apps/web/app/\(dashboard\)/settings/pipelines/record-types
```

- [ ] **Step 3: Stub out the two page.tsx files so the app still compiles**

```typescript
// apps/web/modules/pipeline/pages/page.tsx — leave as-is (it already redirects to default pipeline)
// apps/web/modules/pipeline/pages/[pipelineId]/page.tsx — stub for now:
export default function PipelineViewPage() {
  return <div style={{ padding: 40, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>Rebuilding…</div>;
}
```

- [ ] **Step 4: Fix broken imports in existing files**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -40
# Fix any "Cannot find module" errors by removing imports to deleted files
```

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/
git commit -m "chore(web): delete old pipeline record/conversion components"
```

---

### Task 2: API Client Library

**Files:**
- Modify: `apps/web/modules/pipeline/lib/pipelines.ts`
- Create: `apps/web/modules/pipeline/lib/items.ts`
- Create: `apps/web/modules/pipeline/lib/field-types.ts`

- [ ] **Step 1: Rewrite pipelines.ts**

```typescript
// apps/web/modules/pipeline/lib/pipelines.ts
const API = '/api';

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  position: number;
}

export interface PipelineField {
  id: string;
  pipeline_id: string;
  label: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'user' | 'checkbox' | 'url';
  options: { label: string; value: string }[] | null;
  position: number;
  required: boolean;
}

export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  position: number;
  stages: PipelineStage[];
  fields: PipelineField[];
}

async function apiFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed');
  return json.data as T;
}

export const listPipelines = (token: string) =>
  apiFetch<Pipeline[]>(token, '/pipelines');

export const getPipeline = (token: string, id: string) =>
  apiFetch<Pipeline>(token, `/pipelines/${id}`);

export const createPipeline = (token: string, body: { name: string }) =>
  apiFetch<Pipeline>(token, '/pipelines', { method: 'POST', body: JSON.stringify(body) });

export const deletePipeline = (token: string, id: string) =>
  apiFetch<{ id: string }>(token, `/pipelines/${id}`, { method: 'DELETE' });

export const createStage = (token: string, pipelineId: string, body: { name: string; color: string; is_won?: boolean; is_lost?: boolean }) =>
  apiFetch<PipelineStage>(token, `/pipelines/${pipelineId}/stages`, { method: 'POST', body: JSON.stringify(body) });

export const updateStage = (token: string, pipelineId: string, stageId: string, body: Partial<PipelineStage>) =>
  apiFetch<PipelineStage>(token, `/pipelines/${pipelineId}/stages/${stageId}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteStage = (token: string, pipelineId: string, stageId: string) =>
  apiFetch<{ id: string }>(token, `/pipelines/${pipelineId}/stages/${stageId}`, { method: 'DELETE' });

export const reorderStages = (token: string, pipelineId: string, ids: string[]) =>
  apiFetch<{ reordered: number }>(token, `/pipelines/${pipelineId}/stages/reorder`, { method: 'POST', body: JSON.stringify({ ids }) });

export const createField = (token: string, pipelineId: string, body: Omit<PipelineField, 'id' | 'pipeline_id'>) =>
  apiFetch<PipelineField>(token, `/pipelines/${pipelineId}/fields`, { method: 'POST', body: JSON.stringify(body) });

export const updateField = (token: string, pipelineId: string, fieldId: string, body: Partial<PipelineField>) =>
  apiFetch<PipelineField>(token, `/pipelines/${pipelineId}/fields/${fieldId}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteField = (token: string, pipelineId: string, fieldId: string) =>
  apiFetch<{ id: string }>(token, `/pipelines/${pipelineId}/fields/${fieldId}`, { method: 'DELETE' });

export const reorderFields = (token: string, pipelineId: string, ids: string[]) =>
  apiFetch<{ reordered: number }>(token, `/pipelines/${pipelineId}/fields/reorder`, { method: 'POST', body: JSON.stringify({ ids }) });
```

- [ ] **Step 2: Create items.ts**

```typescript
// apps/web/modules/pipeline/lib/items.ts
const API = '/api';

export interface PipelineItem {
  id: string;
  pipeline_id: string;
  stage_id: string;
  workspace_id: string;
  position: number;
  field_values: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ActivityEntry {
  id: string;
  item_id: string;
  user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

async function apiFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed');
  return json.data as T;
}

export const listItems = (token: string, pipelineId: string, params?: { stage_id?: string; search?: string }) => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return apiFetch<PipelineItem[]>(token, `/pipelines/${pipelineId}/items${qs ? `?${qs}` : ''}`);
};

export const createItem = (token: string, pipelineId: string, body: { stage_id: string; field_values: Record<string, unknown> }) =>
  apiFetch<PipelineItem>(token, `/pipelines/${pipelineId}/items`, { method: 'POST', body: JSON.stringify(body) });

export const getItem = (token: string, id: string) =>
  apiFetch<PipelineItem>(token, `/items/${id}`);

export const updateItem = (token: string, id: string, body: { stage_id?: string; field_values?: Record<string, unknown> }) =>
  apiFetch<PipelineItem>(token, `/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const moveItem = (token: string, id: string, body: { stage_id: string; position: number }) =>
  apiFetch<{ id: string; stage_id: string; position: number }>(token, `/items/${id}/move`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteItem = (token: string, id: string) =>
  apiFetch<{ id: string }>(token, `/items/${id}`, { method: 'DELETE' });

export const getItemActivity = (token: string, id: string) =>
  apiFetch<ActivityEntry[]>(token, `/items/${id}/activity`);
```

- [ ] **Step 3: Create field-types.ts**

```typescript
// apps/web/modules/pipeline/lib/field-types.ts
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'user' | 'checkbox' | 'url';

export interface FieldTypeMeta {
  label: string;
  inputType: string;        // HTML input type hint
  canFilter: boolean;
  canSort: boolean;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text:        { label: 'Text',         inputType: 'text',     canFilter: true,  canSort: true  },
  number:      { label: 'Number',       inputType: 'number',   canFilter: true,  canSort: true  },
  date:        { label: 'Date',         inputType: 'date',     canFilter: true,  canSort: true  },
  select:      { label: 'Select',       inputType: 'select',   canFilter: true,  canSort: false },
  multiselect: { label: 'Multi-select', inputType: 'select',   canFilter: true,  canSort: false },
  user:        { label: 'User',         inputType: 'select',   canFilter: true,  canSort: false },
  checkbox:    { label: 'Checkbox',     inputType: 'checkbox', canFilter: true,  canSort: false },
  url:         { label: 'URL',          inputType: 'url',      canFilter: false, canSort: false },
};

export const FIELD_TYPES = Object.keys(FIELD_TYPE_META) as FieldType[];

export function formatFieldValue(
  value: unknown,
  type: FieldType,
  options?: { label: string; value: string }[],
): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'checkbox': return value ? '✓' : '✗';
    case 'date': return value ? new Date(value as string).toLocaleDateString() : '—';
    case 'select': {
      const opt = options?.find(o => o.value === value);
      return opt?.label ?? String(value);
    }
    case 'multiselect': {
      const vals = Array.isArray(value) ? value : [];
      return vals.map(v => options?.find(o => o.value === v)?.label ?? v).join(', ') || '—';
    }
    case 'number': return typeof value === 'number' ? value.toLocaleString() : String(value);
    default: return String(value);
  }
}
```

- [ ] **Step 4: Compile check and commit**

```bash
cd apps/web && pnpm exec tsc --noEmit
git add apps/web/modules/pipeline/lib/
git commit -m "feat(web): add pipeline API client lib and field-types utility"
```

---

### Task 3: FieldRenderer and FieldEditor Components

**Files:**
- Create: `apps/web/modules/pipeline/components/fields/FieldRenderer.tsx`
- Create: `apps/web/modules/pipeline/components/fields/FieldEditor.tsx`

- [ ] **Step 1: Create FieldRenderer**

```typescript
// apps/web/modules/pipeline/components/fields/FieldRenderer.tsx
'use client';
import { formatFieldValue } from '@/modules/pipeline/lib/field-types';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
}

export function FieldRenderer({ field, value }: Props) {
  if (field.type === 'url' && value && typeof value === 'string') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
      >
        {value}
      </a>
    );
  }

  return (
    <span style={{ fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: value !== undefined && value !== null && value !== '' ? 'var(--text)' : 'var(--text3)' }}>
      {formatFieldValue(value, field.type, field.options ?? undefined)}
    </span>
  );
}
```

- [ ] **Step 2: Create FieldEditor**

```typescript
// apps/web/modules/pipeline/components/fields/FieldEditor.tsx
'use client';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
  onChange: (value: unknown) => void;
  users?: { id: string; name: string }[];
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'DM Sans, sans-serif',
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

export function FieldEditor({ field, value, onChange, users = [] }: Props) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          style={inputStyle}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onChange={e => onChange(e.target.value || null)}
          style={inputStyle}
        />
      );

    case 'url':
      return (
        <input
          type="url"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          placeholder="https://"
        />
      );

    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
      );

    case 'select': {
      const options = field.options ?? [];
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value || null)}
          style={inputStyle}
        >
          <option value="">— none —</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    case 'multiselect': {
      const options = field.options ?? [];
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: selected.includes(opt.value) ? 'var(--text)' : 'var(--surface)',
                color: selected.includes(opt.value) ? '#fff' : 'var(--text)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      );
    }

    case 'user': {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value || null)}
          style={inputStyle}
        >
          <option value="">— unassigned —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      );
    }

    default:
      return null;
  }
}
```

- [ ] **Step 3: Compile and commit**

```bash
cd apps/web && pnpm exec tsc --noEmit
git add apps/web/modules/pipeline/components/fields/
git commit -m "feat(web): add FieldRenderer and FieldEditor components"
```

---

### Task 4: Shared — PipelineSwitcher and ViewSwitcher

**Files:**
- Create: `apps/web/modules/pipeline/components/shared/PipelineSwitcher.tsx`
- Modify: `apps/web/modules/pipeline/components/ViewSwitcher.tsx` (keep path, rewrite)

- [ ] **Step 1: Create PipelineSwitcher**

```typescript
// apps/web/modules/pipeline/components/shared/PipelineSwitcher.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listPipelines } from '@/modules/pipeline/lib/pipelines';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

interface Props {
  currentId: string;
}

export function PipelineSwitcher({ currentId }: Props) {
  const getToken = useApiToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const pipelines = data ?? [];
  const current = pipelines.find(p => p.id === currentId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          cursor: 'pointer',
          fontSize: 14,
          fontFamily: 'Instrument Serif, serif',
          color: 'var(--text)',
        }}
      >
        {current?.name ?? 'Pipeline'}
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          minWidth: 180,
          marginTop: 4,
          padding: 4,
        }}>
          {pipelines.map(p => (
            <button
              key={p.id}
              onClick={() => { router.push(`/pipeline/${p.id}`); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                border: 'none',
                background: p.id === currentId ? 'var(--surface2)' : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'DM Sans, sans-serif',
                color: 'var(--text)',
                borderRadius: 7,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite ViewSwitcher**

```typescript
// apps/web/modules/pipeline/components/ViewSwitcher.tsx
'use client';

type View = 'kanban' | 'table';

interface Props {
  current: View;
  onChange: (v: View) => void;
}

const VIEWS: { id: View; label: string }[] = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'table',  label: 'Table'  },
];

export function ViewSwitcher({ current, onChange }: Props) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {VIEWS.map(v => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          style={{
            padding: '6px 14px',
            border: 'none',
            background: current === v.id ? 'var(--text)' : 'var(--surface)',
            color: current === v.id ? '#fff' : 'var(--text2)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: current === v.id ? 600 : 400,
          }}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/pipeline/components/shared/ apps/web/modules/pipeline/components/ViewSwitcher.tsx
git commit -m "feat(web): add PipelineSwitcher and ViewSwitcher components"
```

---

### Task 5: ItemForm — Create Item Modal

**Files:**
- Create: `apps/web/modules/pipeline/components/shared/ItemForm.tsx`

- [ ] **Step 1: Write ItemForm**

```typescript
// apps/web/modules/pipeline/components/shared/ItemForm.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createItem } from '@/modules/pipeline/lib/items';
import { FieldEditor } from '@/modules/pipeline/components/fields/FieldEditor';
import type { PipelineField, PipelineStage } from '@/modules/pipeline/lib/pipelines';

interface Props {
  pipelineId: string;
  stages: PipelineStage[];
  fields: PipelineField[];
  defaultStageId?: string;
  onClose: () => void;
}

export function ItemForm({ pipelineId, stages, fields, defaultStageId, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [stageId, setStageId] = useState(defaultStageId ?? stages[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createItem(token, pipelineId, { stage_id: stageId, field_values: values });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items', pipelineId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12,
        padding: 28,
        width: 480,
        maxWidth: '90vw',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--text)', margin: '0 0 20px' }}>
          New item
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' }}>
            Stage
          </label>
          <select
            value={stageId}
            onChange={e => setStageId(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--text)' }}
          >
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {fields.map(field => (
          <div key={field.id} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' }}>
              {field.label}{field.required && <span style={{ color: 'var(--red)' }}> *</span>}
            </label>
            <FieldEditor
              field={field}
              value={values[field.key]}
              onChange={v => setValues(prev => ({ ...prev, [field.key]: v }))}
            />
          </div>
        ))}

        {error && (
          <p style={{ color: 'var(--red)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', marginBottom: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--text2)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !stageId}
            style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: 'var(--text)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', opacity: mutation.isPending ? 0.6 : 1 }}
          >
            {mutation.isPending ? 'Creating…' : 'Create item'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/modules/pipeline/components/shared/ItemForm.tsx
git commit -m "feat(web): add ItemForm create modal"
```

---

### Task 6: Kanban Components

**Files:**
- Create: `apps/web/modules/pipeline/components/kanban/KanbanCard.tsx`
- Create: `apps/web/modules/pipeline/components/kanban/KanbanColumn.tsx`
- Create: `apps/web/modules/pipeline/components/kanban/KanbanBoard.tsx`

- [ ] **Step 1: KanbanCard**

```typescript
// apps/web/modules/pipeline/components/kanban/KanbanCard.tsx
'use client';
import { FieldRenderer } from '@/modules/pipeline/components/fields/FieldRenderer';
import type { PipelineItem } from '@/modules/pipeline/lib/items';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  item: PipelineItem;
  fields: PipelineField[];
  onClick: () => void;
  onDragStart: () => void;
}

// Show at most 3 fields on the card (first 3 by position)
export function KanbanCard({ item, fields, onClick, onDragStart }: Props) {
  const previewFields = fields.slice(0, 3);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 14px',
        cursor: 'grab',
        userSelect: 'none',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      {previewFields.map(f => (
        <div key={f.id} style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>{f.label}: </span>
          <FieldRenderer field={f} value={item.field_values[f.key]} />
        </div>
      ))}
      {previewFields.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>
          {item.id.slice(0, 8)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: KanbanColumn**

```typescript
// apps/web/modules/pipeline/components/kanban/KanbanColumn.tsx
'use client';
import { KanbanCard } from './KanbanCard';
import type { PipelineItem } from '@/modules/pipeline/lib/items';
import type { PipelineField, PipelineStage } from '@/modules/pipeline/lib/pipelines';

interface Props {
  stage: PipelineStage;
  items: PipelineItem[];
  fields: PipelineField[];
  onDrop: (itemId: string) => void;
  onCardClick: (itemId: string) => void;
  onCardDragStart: (itemId: string) => void;
}

function stageAccentColor(stage: PipelineStage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

export function KanbanColumn({ stage, items, fields, onDrop, onCardClick, onCardDragStart }: Props) {
  const accent = stageAccentColor(stage);
  return (
    <div
      style={{ minWidth: 240, maxWidth: 240, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
      onDragOver={e => e.preventDefault()}
      onDrop={() => {/* drag id comes from parent */onDrop('')}}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px' }}>
        <span style={{
          background: accent + '1a',
          color: accent,
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'DM Sans, sans-serif',
        }}>
          {stage.name}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>{items.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
        {items.map(item => (
          <KanbanCard
            key={item.id}
            item={item}
            fields={fields}
            onClick={() => onCardClick(item.id)}
            onDragStart={() => onCardDragStart(item.id)}
          />
        ))}
        {items.length === 0 && (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
            Drop items here
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: KanbanBoard**

```typescript
// apps/web/modules/pipeline/components/kanban/KanbanBoard.tsx
'use client';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItems, moveItem } from '@/modules/pipeline/lib/items';
import { KanbanColumn } from './KanbanColumn';
import { ItemDetail } from '@/modules/pipeline/components/detail/ItemDetail';
import { ItemForm } from '@/modules/pipeline/components/shared/ItemForm';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';

interface Props {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}

export function KanbanBoard({ pipeline, search, addTrigger }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Open form when addTrigger increments
  const prevTrigger = useState(addTrigger)[0];
  if (addTrigger !== prevTrigger) setShowForm(true);

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipeline.id],
    queryFn: async () => listItems(await getToken(), pipeline.id),
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, stage_id, position }: { id: string; stage_id: string; position: number }) => {
      return moveItem(await getToken(), id, { stage_id, position });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipeline.id] }),
  });

  const filteredItems = useCallback(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(item =>
      Object.values(item.field_values).some(v =>
        String(v ?? '').toLowerCase().includes(q)
      )
    );
  }, [items, search])();

  const itemsByStage = useCallback(
    (stageId: string) => filteredItems.filter(i => i.stage_id === stageId),
    [filteredItems]
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 16, padding: 24, overflowX: 'auto', height: '100%', alignItems: 'flex-start' }}>
        {pipeline.stages.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            items={itemsByStage(stage.id)}
            fields={pipeline.fields}
            onCardDragStart={id => setDragId(id)}
            onDrop={() => {
              if (dragId) {
                const destItems = itemsByStage(stage.id);
                moveMut.mutate({ id: dragId, stage_id: stage.id, position: destItems.length });
                setDragId(null);
              }
            }}
            onCardClick={id => setSelectedId(id)}
          />
        ))}
      </div>

      {selectedId && (
        <ItemDetail
          itemId={selectedId}
          pipeline={pipeline}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showForm && (
        <ItemForm
          pipelineId={pipeline.id}
          stages={pipeline.stages}
          fields={pipeline.fields}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/pipeline/components/kanban/
git commit -m "feat(web): add KanbanCard, KanbanColumn, KanbanBoard components"
```

---

### Task 7: Table View

**Files:**
- Create: `apps/web/modules/pipeline/components/table/TableCell.tsx`
- Create: `apps/web/modules/pipeline/components/table/PipelineTable.tsx`

- [ ] **Step 1: TableCell**

```typescript
// apps/web/modules/pipeline/components/table/TableCell.tsx
'use client';
import { useState } from 'react';
import { FieldRenderer } from '@/modules/pipeline/components/fields/FieldRenderer';
import { FieldEditor } from '@/modules/pipeline/components/fields/FieldEditor';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
  onSave: (value: unknown) => void;
}

export function TableCell({ field, value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <td
        style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', minWidth: 140 }}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      >
        <FieldEditor field={field} value={draft} onChange={setDraft} />
        <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
          <button onClick={commit} style={{ fontSize: 11, padding: '2px 8px', border: 'none', borderRadius: 4, background: 'var(--text)', color: '#fff', cursor: 'pointer' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer' }}>Cancel</button>
        </div>
      </td>
    );
  }

  return (
    <td
      onDoubleClick={() => { setDraft(value); setEditing(true); }}
      style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        minWidth: 140,
        cursor: 'text',
        verticalAlign: 'middle',
      }}
    >
      <FieldRenderer field={field} value={value} />
    </td>
  );
}
```

- [ ] **Step 2: PipelineTable**

```typescript
// apps/web/modules/pipeline/components/table/PipelineTable.tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItems, updateItem } from '@/modules/pipeline/lib/items';
import { TableCell } from './TableCell';
import { ItemDetail } from '@/modules/pipeline/components/detail/ItemDetail';
import { ItemForm } from '@/modules/pipeline/components/shared/ItemForm';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';

interface Props {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}

export function PipelineTable({ pipeline, search, addTrigger }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const prevTrigger = useState(addTrigger)[0];
  if (addTrigger !== prevTrigger) setShowForm(true);

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipeline.id],
    queryFn: async () => listItems(await getToken(), pipeline.id),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, field_values }: { id: string; field_values: Record<string, unknown> }) =>
      updateItem(await getToken(), id, { field_values }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipeline.id] }),
  });

  const filtered = search
    ? items.filter(i => Object.values(i.field_values).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : items;

  const stageMap = Object.fromEntries(pipeline.stages.map(s => [s.id, s.name]));

  return (
    <>
      <div style={{ overflowX: 'auto', height: '100%' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontWeight: 500, fontSize: 11 }}>Stage</th>
              {pipeline.fields.map(f => (
                <th key={f.id} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr
                key={item.id}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td
                  onClick={() => setSelectedId(item.id)}
                  style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}
                >
                  {stageMap[item.stage_id] ?? '—'}
                </td>
                {pipeline.fields.map(f => (
                  <TableCell
                    key={f.id}
                    field={f}
                    value={item.field_values[f.key]}
                    onSave={v =>
                      updateMut.mutate({ id: item.id, field_values: { ...item.field_values as Record<string, unknown>, [f.key]: v } })
                    }
                  />
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={pipeline.fields.length + 1} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                  No items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <ItemDetail itemId={selectedId} pipeline={pipeline} onClose={() => setSelectedId(null)} />
      )}
      {showForm && (
        <ItemForm pipelineId={pipeline.id} stages={pipeline.stages} fields={pipeline.fields} onClose={() => setShowForm(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/pipeline/components/table/
git commit -m "feat(web): add PipelineTable and TableCell with inline editing"
```

---

### Task 8: Item Detail Panel

**Files:**
- Create: `apps/web/modules/pipeline/components/detail/ItemDetailField.tsx`
- Create: `apps/web/modules/pipeline/components/detail/ItemActivity.tsx`
- Create: `apps/web/modules/pipeline/components/detail/ItemDetail.tsx`

- [ ] **Step 1: ItemDetailField**

```typescript
// apps/web/modules/pipeline/components/detail/ItemDetailField.tsx
'use client';
import { useState } from 'react';
import { FieldRenderer } from '@/modules/pipeline/components/fields/FieldRenderer';
import { FieldEditor } from '@/modules/pipeline/components/fields/FieldEditor';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
  onSave: (value: unknown) => void;
}

export function ItemDetailField({ field, value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4 }}>
        {field.label}
      </div>

      {editing ? (
        <div>
          <FieldEditor field={field} value={draft} onChange={setDraft} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              onClick={commit}
              style={{ fontSize: 12, padding: '4px 12px', border: 'none', borderRadius: 6, background: 'var(--text)', color: '#fff', cursor: 'pointer' }}
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{ fontSize: 12, padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => { setDraft(value); setEditing(true); }}
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            cursor: 'text',
            minHeight: 28,
            border: '1px solid transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.border = '1px solid var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.border = '1px solid transparent')}
        >
          <FieldRenderer field={field} value={value} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ItemActivity**

```typescript
// apps/web/modules/pipeline/components/detail/ItemActivity.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getItemActivity } from '@/modules/pipeline/lib/items';

interface Props {
  itemId: string;
}

function formatEventType(type: string): string {
  return { stage_changed: 'Moved stage', field_changed: 'Updated field', item_created: 'Created', reminder_sent: 'Reminder sent' }[type] ?? type;
}

export function ItemActivity({ itemId }: Props) {
  const getToken = useApiToken();
  const { data: entries = [] } = useQuery({
    queryKey: ['item-activity', itemId],
    queryFn: async () => getItemActivity(await getToken(), itemId),
  });

  return (
    <div>
      <h4 style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', margin: '0 0 12px', fontWeight: 500 }}>
        Activity
      </h4>
      {entries.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>No activity yet.</p>
      )}
      {entries.map(entry => (
        <div key={entry.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)', marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>
              {formatEventType(entry.event_type)}
              {entry.event_type === 'stage_changed' && entry.payload['to_stage_id'] && (
                <span style={{ color: 'var(--text2)' }}> → {String(entry.payload['to_stage_id']).slice(0, 8)}</span>
              )}
              {entry.event_type === 'field_changed' && (
                <span style={{ color: 'var(--text2)' }}> {String(entry.payload['field_key'])}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', marginTop: 2 }}>
              {new Date(entry.created_at).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: ItemDetail slide-over panel**

```typescript
// apps/web/modules/pipeline/components/detail/ItemDetail.tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getItem, updateItem, deleteItem } from '@/modules/pipeline/lib/items';
import { ItemDetailField } from './ItemDetailField';
import { ItemActivity } from './ItemActivity';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';

interface Props {
  itemId: string;
  pipeline: Pipeline;
  onClose: () => void;
}

type Tab = 'fields' | 'activity';

export function ItemDetail({ itemId, pipeline, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('fields');

  const { data: item } = useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => getItem(await getToken(), itemId),
  });

  const updateMut = useMutation({
    mutationFn: async (field_values: Record<string, unknown>) =>
      updateItem(await getToken(), itemId, { field_values }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['item', itemId] });
      void qc.invalidateQueries({ queryKey: ['items', pipeline.id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => deleteItem(await getToken(), itemId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items', pipeline.id] });
      onClose();
    },
  });

  const currentStage = pipeline.stages.find(s => s.id === item?.stage_id);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.2)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 201,
        width: 420,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.06)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            {currentStage && (
              <span style={{
                fontSize: 11, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                background: (currentStage.color ?? '#6366f1') + '1a',
                color: currentStage.color ?? '#6366f1',
                padding: '2px 8px', borderRadius: 4,
              }}>
                {currentStage.name}
              </span>
            )}
          </div>
          <button
            onClick={() => { if (confirm('Delete this item?')) deleteMut.mutate(); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', padding: '4px 8px' }}
          >
            Delete
          </button>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Stage selector */}
        {item && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', display: 'block', marginBottom: 4 }}>Move to stage</label>
            <select
              value={item.stage_id}
              onChange={e => updateItem(getToken as any, itemId, { stage_id: e.target.value })}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--text)' }}
            >
              {pipeline.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {(['fields', 'activity'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 0',
                marginRight: 20,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'DM Sans, sans-serif',
                color: tab === t ? 'var(--text)' : 'var(--text3)',
                borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
                fontWeight: tab === t ? 500 : 400,
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {!item && <p style={{ color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Loading…</p>}

          {item && tab === 'fields' && pipeline.fields.map(f => (
            <ItemDetailField
              key={f.id}
              field={f}
              value={(item.field_values as Record<string, unknown>)[f.key]}
              onSave={v => updateMut.mutate({ ...(item.field_values as Record<string, unknown>), [f.key]: v })}
            />
          ))}

          {item && tab === 'activity' && <ItemActivity itemId={itemId} />}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/pipeline/components/detail/
git commit -m "feat(web): add ItemDetail slide-over panel with fields and activity tabs"
```

---

### Task 9: Pipeline Pages

**Files:**
- Modify: `apps/web/modules/pipeline/pages/[pipelineId]/page.tsx`
- Modify: `apps/web/modules/pipeline/pages/page.tsx` (already correct — leave as-is)

- [ ] **Step 1: Rewrite [pipelineId]/page.tsx**

```typescript
// apps/web/modules/pipeline/pages/[pipelineId]/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline } from '@/modules/pipeline/lib/pipelines';
import { ViewSwitcher } from '@/modules/pipeline/components/ViewSwitcher';
import { PipelineSwitcher } from '@/modules/pipeline/components/shared/PipelineSwitcher';
import type { ComponentType } from 'react';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';

type View = 'kanban' | 'table';

interface ViewProps { pipeline: Pipeline; search: string; addTrigger: number }

const KanbanBoard = dynamic(
  () => import('@/modules/pipeline/components/kanban/KanbanBoard').then(m => ({ default: m.KanbanBoard })),
  { ssr: false }
) as ComponentType<ViewProps>;

const PipelineTable = dynamic(
  () => import('@/modules/pipeline/components/table/PipelineTable').then(m => ({ default: m.PipelineTable })),
  { ssr: false }
) as ComponentType<ViewProps>;

export default function PipelineViewPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const getToken = useApiToken();
  const [view, setView] = useState<View>('kanban');
  const [search, setSearch] = useState('');
  const [addTrigger, setAddTrigger] = useState(0);

  const { data } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });
  const pipeline = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <PipelineSwitcher currentId={pipelineId} />
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          style={{
            padding: '6px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'DM Sans, sans-serif',
            width: 200,
            background: 'var(--surface)',
            color: 'var(--text)',
          }}
        />
        <ViewSwitcher current={view} onChange={setView} />
        <button
          onClick={() => setAddTrigger(n => n + 1)}
          style={{
            padding: '8px 16px',
            background: 'var(--text)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          + New item
        </button>
      </div>

      {/* View */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {!pipeline && (
          <div style={{ padding: 40, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Loading…</div>
        )}
        {pipeline && view === 'kanban' && (
          <KanbanBoard pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'table' && (
          <PipelineTable pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Compile check and commit**

```bash
cd apps/web && pnpm exec tsc --noEmit
git add apps/web/modules/pipeline/pages/
git commit -m "feat(web): wire up pipeline view page with kanban and table"
```

---

### Task 10: Settings Pages

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/pipelines/page.tsx` (rewrite)
- Create: `apps/web/app/(dashboard)/settings/pipelines/[id]/page.tsx`

- [ ] **Step 1: Rewrite settings/pipelines/page.tsx**

```typescript
// apps/web/app/(dashboard)/settings/pipelines/page.tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listPipelines, createPipeline, deletePipeline } from '@/modules/pipeline/lib/pipelines';
import Link from 'next/link';

export default function PipelinesSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const createMut = useMutation({
    mutationFn: async () => createPipeline(await getToken(), { name: newName }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pipelines'] }); setNewName(''); setCreating(false); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deletePipeline(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  return (
    <div style={{ maxWidth: 560, padding: '32px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>Pipelines</h1>
        <button
          onClick={() => setCreating(true)}
          style={{ padding: '8px 16px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
        >
          + New pipeline
        </button>
      </div>

      {creating && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16, display: 'flex', gap: 8 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createMut.mutate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Pipeline name"
            style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
          />
          <button onClick={() => createMut.mutate()} style={{ padding: '6px 14px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
            Create
          </button>
          <button onClick={() => setCreating(false)} style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)' }}>
            Cancel
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pipelines.map(p => (
          <div key={p.id} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', marginTop: 2 }}>
                {p.stages.length} stages · {p.fields.length} fields
              </div>
            </div>
            <Link href={`/settings/pipelines/${p.id}`} style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', textDecoration: 'none', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
              Configure
            </Link>
            <button
              onClick={() => { if (confirm(`Delete "${p.name}"? All items will be lost.`)) deleteMut.mutate(p.id); }}
              style={{ fontSize: 12, color: 'var(--red)', fontFamily: 'DM Sans, sans-serif', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px' }}
            >
              Delete
            </button>
          </div>
        ))}

        {pipelines.length === 0 && (
          <p style={{ color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>No pipelines yet.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create settings/pipelines/[id]/page.tsx**

```typescript
// apps/web/app/(dashboard)/settings/pipelines/[id]/page.tsx
'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  getPipeline,
  createStage, updateStage, deleteStage, reorderStages,
  createField, updateField, deleteField,
  type PipelineField,
} from '@/modules/pipeline/lib/pipelines';
import { FIELD_TYPES, FIELD_TYPE_META } from '@/modules/pipeline/lib/field-types';

const COLORS = ['#6366f1','#0ea5e9','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

export default function PipelineConfigPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'stages' | 'fields' | 'automations'>('stages');

  // Stage form state
  const [stageName, setStageName] = useState('');
  const [stageColor, setStageColor] = useState(COLORS[0]!);

  // Field form state
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<PipelineField['type']>('text');
  const [fieldKey, setFieldKey] = useState('');

  const { data: pipeline } = useQuery({
    queryKey: ['pipeline', id],
    queryFn: async () => getPipeline(await getToken(), id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['pipeline', id] });

  const createStageMut = useMutation({
    mutationFn: async () => createStage(await getToken(), id, { name: stageName, color: stageColor }),
    onSuccess: () => { invalidate(); setStageName(''); setStageColor(COLORS[0]!); },
  });

  const deleteStageMut = useMutation({
    mutationFn: async (stageId: string) => deleteStage(await getToken(), id, stageId),
    onSuccess: invalidate,
  });

  const createFieldMut = useMutation({
    mutationFn: async () => createField(await getToken(), id, {
      label: fieldLabel,
      key: fieldKey || fieldLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      type: fieldType,
      position: pipeline?.fields.length ?? 0,
      required: false,
    }),
    onSuccess: () => { invalidate(); setFieldLabel(''); setFieldKey(''); setFieldType('text'); },
  });

  const deleteFieldMut = useMutation({
    mutationFn: async (fieldId: string) => deleteField(await getToken(), id, fieldId),
    onSuccess: invalidate,
  });

  const sectionTitle: React.CSSProperties = { fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--text)', margin: '0 0 16px' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--text)' };

  if (!pipeline) return <div style={{ padding: 40, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 560, padding: '32px 0' }}>
      <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text)', margin: '0 0 8px' }}>{pipeline.name}</h1>
      <p style={{ color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, margin: '0 0 24px' }}>Configure stages and fields for this pipeline.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {(['stages', 'fields'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'DM Sans, sans-serif',
              color: tab === t ? 'var(--text)' : 'var(--text3)',
              borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
              fontWeight: tab === t ? 500 : 400,
              marginBottom: -1,
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Stages tab */}
      {tab === 'stages' && (
        <div>
          <h2 style={sectionTitle}>Stages</h2>

          {pipeline.stages.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.is_won ? '#22c55e' : s.is_lost ? '#ef4444' : s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>{s.name}</span>
              {s.is_won && <span style={{ fontSize: 10, color: '#22c55e', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>WON</span>}
              {s.is_lost && <span style={{ fontSize: 10, color: '#ef4444', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>LOST</span>}
              <button
                onClick={() => { if (confirm(`Delete stage "${s.name}"?`)) deleteStageMut.mutate(s.id); }}
                style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                Remove
              </button>
            </div>
          ))}

          <div style={{ marginTop: 20, padding: 16, border: '1px dashed var(--border)', borderRadius: 9 }}>
            <h3 style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: '0 0 12px' }}>Add stage</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Name</label>
                <input
                  value={stageName}
                  onChange={e => setStageName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && stageName && createStageMut.mutate()}
                  placeholder="Stage name"
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Color</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setStageColor(c)}
                      style={{
                        width: 20, height: 20,
                        borderRadius: '50%',
                        background: c,
                        border: stageColor === c ? '2px solid var(--text)' : '2px solid transparent',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={() => createStageMut.mutate()}
                disabled={!stageName}
                style={{ ...inputStyle, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer', padding: '7px 16px', opacity: stageName ? 1 : 0.5 }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fields tab */}
      {tab === 'fields' && (
        <div>
          <h2 style={sectionTitle}>Fields</h2>

          {pipeline.fields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)' }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface2)', borderRadius: 4, padding: '2px 6px' }}>
                {FIELD_TYPE_META[f.type]?.label ?? f.type}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>{f.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' }}>{f.key}</span>
              <button
                onClick={() => { if (confirm(`Delete field "${f.label}"?`)) deleteFieldMut.mutate(f.id); }}
                style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                Remove
              </button>
            </div>
          ))}

          <div style={{ marginTop: 20, padding: 16, border: '1px dashed var(--border)', borderRadius: 9 }}>
            <h3 style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: '0 0 12px' }}>Add field</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Label</label>
                <input
                  value={fieldLabel}
                  onChange={e => {
                    setFieldLabel(e.target.value);
                    if (!fieldKey) setFieldKey(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                  }}
                  placeholder="Field label"
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Key</label>
                <input
                  value={fieldKey}
                  onChange={e => setFieldKey(e.target.value)}
                  placeholder="field_key"
                  style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Type</label>
                <select value={fieldType} onChange={e => setFieldType(e.target.value as PipelineField['type'])} style={{ ...inputStyle, width: '100%' }}>
                  {FIELD_TYPES.map(t => <option key={t} value={t}>{FIELD_TYPE_META[t]?.label}</option>)}
                </select>
              </div>
              <button
                onClick={() => createFieldMut.mutate()}
                disabled={!fieldLabel}
                style={{ ...inputStyle, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer', padding: '7px 16px', opacity: fieldLabel ? 1 : 0.5 }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Compile check and commit**

```bash
cd apps/web && pnpm exec tsc --noEmit
git add apps/web/app/\(dashboard\)/settings/pipelines/
git commit -m "feat(web): add pipeline settings pages for stages and fields"
```

---

## Self-Review Checklist

- [x] Old components deleted before new ones introduced — no dead imports
- [x] All API calls go through lib functions (no inline fetch in components)
- [x] TanStack Query used for all data (no direct useEffect + fetch)
- [x] All CSS uses design system vars (`--bg`, `--surface`, `--border`, `--text`, `--text2`, `--text3`)
- [x] No Tailwind classes — inline style only
- [x] Fonts: `Instrument Serif` for headings, `DM Sans` for body/UI
- [x] `addTrigger` pattern for triggering form open from parent toolbar
- [x] Drag-drop via HTML5 native (no library)
- [x] Double-click to edit in table cells
- [x] ItemDetail has both Fields and Activity tabs
- [x] Settings pages cover stages + fields (automations listed as tab but deferred for UI — backend API exists)
- [x] `KanbanColumn.onDrop` uses `dragId` from parent — **gap:** KanbanBoard passes an empty string to onDrop. Fix: pass a callback `() => { if (dragId) ... }` directly in the column's onDrop prop, not via prop drilling. Revise KanbanColumn to call `onDrop()` (no arg) and KanbanBoard to close over `dragId` state in each stage's handler:

```typescript
// In KanbanBoard, replace the onDrop prop:
onDrop={() => {
  if (dragId) {
    const destItems = itemsByStage(stage.id);
    moveMut.mutate({ id: dragId, stage_id: stage.id, position: destItems.length });
    setDragId(null);
  }
}}
// And KanbanColumn.onDrop signature: () => void (no args)
// Update KanbanColumn: onDrop={() => onDrop()} in the div's onDrop handler
```

- [x] ItemDetail stage selector needs async token — fix: use mutation pattern instead of calling `updateItem` directly in `onChange`:

```typescript
// In ItemDetail, add:
const stageMut = useMutation({
  mutationFn: async (stage_id: string) => updateItem(await getToken(), itemId, { stage_id }),
  onSuccess: () => void qc.invalidateQueries({ queryKey: ['item', itemId] }),
});
// Then in the select:
onChange={e => stageMut.mutate(e.target.value)}
```
