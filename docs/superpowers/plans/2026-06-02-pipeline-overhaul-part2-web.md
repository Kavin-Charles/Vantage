# Pipeline Overhaul — Part 2: Web UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete generic pipeline UI — lib files, settings pages, kanban/table/list views, record detail panel, record form, conversion wizard. Delete all deals-specific web code.

**Architecture:** Next.js App Router (app dir). API calls via `apiFetch` from `@vencore/api-client` (configured with empty base URL — Next.js proxies `/api/*`). State via `@tanstack/react-query`. DnD via HTML5 native drag events. Design system: CSS variables from `vencore-full.html` — match exactly.

**Tech Stack:** Next.js 14 App Router, TypeScript, React Query, `apiFetch` from `@vencore/api-client`

**Depends on:** Part 1 (`2026-06-02-pipeline-overhaul-part1-api.md`) must be complete first.

**Design tokens** (use these everywhere — no Tailwind, inline `style=` props):
```
--bg: #f7f6f2    --surface: #ffffff    --surface2: #f0ede6
--border: #e4e0d8    --text: #1a1814    --text2: #6b665c    --text3: #9e998f
--green: #2d6a4f / --green-bg: #d8f3dc
--amber: #92400e / --amber-bg: #fef3c7
--red: #991b1b / --red-bg: #fee2e2
--blue: #1e3a8a / --blue-bg: #dbeafe
```
Fonts: `Instrument Serif` (names/numbers/display) + `DM Sans` (UI/body).
Reference: `apps/web/vencore-full.html` — match it exactly for all new UI.

---

### Task 1: Web Lib Files

**Files:**
- Create: `apps/web/lib/record-types.ts`
- Create: `apps/web/lib/records.ts`
- Modify: `apps/web/lib/pipelines.ts` (full rewrite)

- [ ] **Create `apps/web/lib/record-types.ts`**

```typescript
import { apiFetch } from './api';
import type {
  RecordType, RecordTypeField, RecordTypeWithFields,
  ConversionTemplate, ConversionTemplateWithMappings, ConversionFieldMapping,
} from '@vencore/types';

export function listRecordTypes(token: string) {
  return apiFetch<{ data: RecordType[] }>('/api/record-types', { token });
}
export function createRecordType(token: string, body: {
  name: string; icon?: string; description?: string;
  auto_number_enabled?: boolean; auto_number_prefix?: string;
}) {
  return apiFetch<{ data: RecordType }>('/api/record-types', {
    method: 'POST', body: JSON.stringify(body), token,
  });
}
export function updateRecordType(token: string, id: string, body: Partial<{
  name: string; icon: string; description: string;
  auto_number_enabled: boolean; auto_number_prefix: string; position: number;
}>) {
  return apiFetch<{ data: RecordType }>(`/api/record-types/${id}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}
export function deleteRecordType(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/record-types/${id}`, { method: 'DELETE', token });
}
export function listFields(token: string, typeId: string) {
  return apiFetch<{ data: RecordTypeField[] }>(`/api/record-types/${typeId}/fields`, { token });
}
export function addField(token: string, typeId: string, body: {
  label: string; field_type: string; is_required?: boolean;
  options?: { label: string; value: string }[]; position?: number;
}) {
  return apiFetch<{ data: RecordTypeField }>(`/api/record-types/${typeId}/fields`, {
    method: 'POST', body: JSON.stringify(body), token,
  });
}
export function updateField(token: string, typeId: string, fieldId: string, body: Partial<{
  label: string; is_required: boolean; options: { label: string; value: string }[]; position: number;
}>) {
  return apiFetch<{ data: RecordTypeField }>(`/api/record-types/${typeId}/fields/${fieldId}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}
export function deleteField(token: string, typeId: string, fieldId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/record-types/${typeId}/fields/${fieldId}`, {
    method: 'DELETE', token,
  });
}
export function reorderFields(token: string, typeId: string, ids: string[]) {
  return apiFetch<{ data: { ids: string[] } }>(`/api/record-types/${typeId}/fields/reorder`, {
    method: 'PATCH', body: JSON.stringify({ ids }), token,
  });
}
export function listConversions(token: string, typeId: string) {
  return apiFetch<{ data: ConversionTemplateWithMappings[] }>(`/api/record-types/${typeId}/conversions`, { token });
}
export function createConversion(token: string, typeId: string, body: {
  name: string; target_type_id: string; target_pipeline_id: string; target_stage_id: string;
  field_mappings: Partial<ConversionFieldMapping>[];
}) {
  return apiFetch<{ data: ConversionTemplateWithMappings }>(`/api/record-types/${typeId}/conversions`, {
    method: 'POST', body: JSON.stringify(body), token,
  });
}
export function updateConversion(token: string, typeId: string, tid: string, body: Partial<{
  name: string; target_pipeline_id: string; target_stage_id: string;
  field_mappings: Partial<ConversionFieldMapping>[];
}>) {
  return apiFetch<{ data: ConversionTemplate }>(`/api/record-types/${typeId}/conversions/${tid}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}
export function deleteConversion(token: string, typeId: string, tid: string) {
  return apiFetch<{ data: { id: string } }>(`/api/record-types/${typeId}/conversions/${tid}`, {
    method: 'DELETE', token,
  });
}
```

- [ ] **Create `apps/web/lib/records.ts`**

```typescript
import { apiFetch } from './api';
import type { PipelineRecordWithValues, PipelineRecord } from '@vencore/types';

export function listRecords(token: string, params: {
  pipeline_id?: string; stage_id?: string; record_type_id?: string;
  owner_id?: string; contact_id?: string; company_id?: string;
  q?: string; page?: number; per_page?: number;
}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
  return apiFetch<{ data: PipelineRecordWithValues[]; page: number; per_page: number }>(
    `/api/records?${qs}`, { token }
  );
}
export function getRecord(token: string, id: string) {
  return apiFetch<{ data: PipelineRecordWithValues }>(`/api/records/${id}`, { token });
}
export function createRecord(token: string, body: {
  record_type_id: string; pipeline_id: string; stage_id: string;
  name: string; owner_id: string; contact_id?: string; company_id?: string;
  field_values?: Record<string, unknown>;
}) {
  return apiFetch<{ data: PipelineRecordWithValues }>('/api/records', {
    method: 'POST', body: JSON.stringify(body), token,
  });
}
export function updateRecord(token: string, id: string, body: Partial<{
  name: string; stage_id: string; owner_id: string;
  contact_id: string | null; company_id: string | null;
  field_values: Record<string, unknown>;
}>) {
  return apiFetch<{ data: PipelineRecordWithValues }>(`/api/records/${id}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}
export function deleteRecord(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/records/${id}`, { method: 'DELETE', token });
}
export function convertRecord(token: string, id: string, body: {
  template_id: string; field_overrides?: Record<string, unknown>;
}) {
  return apiFetch<{ data: { source: PipelineRecord; target: PipelineRecordWithValues } }>(
    `/api/records/${id}/convert`,
    { method: 'POST', body: JSON.stringify(body), token }
  );
}
```

- [ ] **Rewrite `apps/web/lib/pipelines.ts`**

```typescript
import { apiFetch } from './api';
import type { Pipeline, PipelineWithDetails, PipelineStage } from '@vencore/types';

export function listPipelines(token: string) {
  return apiFetch<{ data: PipelineWithDetails[] }>('/api/pipelines', { token });
}
export function getPipeline(token: string, id: string) {
  return apiFetch<{ data: PipelineWithDetails }>(`/api/pipelines/${id}`, { token });
}
export function createPipeline(token: string, body: { name: string; record_type_id: string; view?: string }) {
  return apiFetch<{ data: Pipeline }>('/api/pipelines', {
    method: 'POST', body: JSON.stringify(body), token,
  });
}
export function updatePipeline(token: string, id: string, body: Partial<{
  name: string; view: string; table_columns: string[] | null; is_default: boolean;
}>) {
  return apiFetch<{ data: Pipeline }>(`/api/pipelines/${id}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}
export function deletePipeline(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${id}`, { method: 'DELETE', token });
}
export function addStage(token: string, pipelineId: string, body: {
  name: string; color?: string; is_won?: boolean; is_lost?: boolean; position?: number;
}) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages`, {
    method: 'POST', body: JSON.stringify(body), token,
  });
}
export function updateStage(token: string, pipelineId: string, stageId: string, body: Partial<{
  name: string; color: string; is_won: boolean; is_lost: boolean; position: number;
}>) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}
export function deleteStage(token: string, pipelineId: string, stageId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'DELETE', token,
  });
}
export function reorderStages(token: string, pipelineId: string, ids: string[]) {
  return apiFetch<{ data: { ids: string[] } }>(`/api/pipelines/${pipelineId}/stages/reorder`, {
    method: 'PATCH', body: JSON.stringify({ ids }), token,
  });
}
```

- [ ] **Verify TS compiles**
```bash
cd apps/web && pnpm lint
```

- [ ] **Commit**
```bash
git add apps/web/lib/record-types.ts apps/web/lib/records.ts apps/web/lib/pipelines.ts
git commit -m "feat: add record-types + records web lib, rewrite pipelines lib"
```

---

### Task 2: Settings Components

**Files:**
- Create: `apps/web/components/pipeline/PipelineEditor.tsx`
- Create: `apps/web/components/pipeline/RecordTypeEditor.tsx`
- Create: `apps/web/components/pipeline/FieldMappingEditor.tsx`

- [ ] **Create `PipelineEditor.tsx`**

Stage list editor — rendered inside settings/pipelines. Props: `pipelineId: string`.

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { getPipeline, addStage, updateStage, deleteStage, reorderStages } from '@/lib/pipelines';
import type { PipelineStage } from '@vencore/types';

const COLORS = ['#6366f1','#8b5cf6','#a855f7','#ec4899','#22c55e','#ef4444','#f59e0b','#3b82f6'];

export function PipelineEditor({ pipelineId }: { pipelineId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });

  const pipeline = data?.data;
  const stages = pipeline?.stages ?? [];

  const addMut = useMutation({
    mutationFn: async (name: string) => addStage(await getToken(), pipelineId, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }); setAdding(false); setNewName(''); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...body }: Partial<PipelineStage> & { id: string }) =>
      updateStage(await getToken(), pipelineId, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteStage(await getToken(), pipelineId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => reorderStages(await getToken(), pipelineId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = stages.map(s => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragId);
    reorderMut.mutate(reordered);
    setDragId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stages.map(stage => (
        <div
          key={stage.id}
          draggable
          onDragStart={() => setDragId(stage.id)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(stage.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            cursor: 'grab',
          }}
        >
          <span style={{ cursor: 'grab', color: 'var(--text3)', fontSize: 14 }}>⠿</span>
          <input
            defaultValue={stage.name}
            onBlur={e => updateMut.mutate({ id: stage.id, name: e.target.value })}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--text)',
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => updateMut.mutate({ id: stage.id, color: c })}
                style={{
                  width: 14, height: 14, borderRadius: '50%', background: c, border: 'none',
                  cursor: 'pointer', outline: stage.color === c ? '2px solid var(--text)' : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <button
            onClick={() => updateMut.mutate({ id: stage.id, is_won: !stage.is_won })}
            style={{
              padding: '2px 8px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
              background: stage.is_won ? 'var(--green-bg)' : 'var(--surface2)',
              color: stage.is_won ? 'var(--green)' : 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >Won</button>
          <button
            onClick={() => updateMut.mutate({ id: stage.id, is_lost: !stage.is_lost })}
            style={{
              padding: '2px 8px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
              background: stage.is_lost ? 'var(--red-bg)' : 'var(--surface2)',
              color: stage.is_lost ? 'var(--red)' : 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >Lost</button>
          <button
            onClick={() => { if (confirm(`Delete stage "${stage.name}"?`)) deleteMut.mutate(stage.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}
          >×</button>
        </div>
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addMut.mutate(newName); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Stage name"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}
          />
          <button onClick={() => addMut.mutate(newName)} style={{ padding: '4px 12px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Add</button>
          <button onClick={() => setAdding(false)} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{ padding: '8px 12px', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, textAlign: 'left' }}
        >+ Add stage</button>
      )}
    </div>
  );
}
```

- [ ] **Create `RecordTypeEditor.tsx`**

Field list editor with add/edit/reorder/delete. Props: `recordTypeId: string`.

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listFields, addField, updateField, deleteField, reorderFields } from '@/lib/record-types';
import type { RecordTypeField } from '@vencore/types';

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

export function RecordTypeEditor({ recordTypeId }: { recordTypeId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<typeof FIELD_TYPES[number]>('text');
  const [dragId, setDragId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['record-type-fields', recordTypeId],
    queryFn: async () => listFields(await getToken(), recordTypeId),
  });
  const fields = data?.data ?? [];

  const addMut = useMutation({
    mutationFn: async () => addField(await getToken(), recordTypeId, { label: newLabel, field_type: newType, position: fields.length }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] }); setAdding(false); setNewLabel(''); },
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, ...body }: Partial<RecordTypeField> & { id: string }) =>
      updateField(await getToken(), recordTypeId, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] }),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteField(await getToken(), recordTypeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] }),
  });
  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => reorderFields(await getToken(), recordTypeId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] }),
  });

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = fields.map(f => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const r = [...ids]; r.splice(from, 1); r.splice(to, 0, dragId);
    reorderMut.mutate(r); setDragId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {fields.map(field => (
        <div
          key={field.id}
          draggable
          onDragStart={() => setDragId(field.id)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(field.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
        >
          <span style={{ cursor: 'grab', color: 'var(--text3)' }}>⠿</span>
          <input
            defaultValue={field.label}
            onBlur={e => updateMut.mutate({ id: field.id, label: e.target.value })}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}
          />
          <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--surface2)', borderRadius: 10, color: 'var(--text2)', border: '1px solid var(--border)' }}>
            {field.field_type}
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={field.is_required}
              onChange={e => updateMut.mutate({ id: field.id, is_required: e.target.checked })} />
            Required
          </label>
          <button onClick={() => { if (confirm(`Delete field "${field.label}"?`)) deleteMut.mutate(field.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Field label"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }} />
          <select value={newType} onChange={e => setNewType(e.target.value as any)}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => addMut.mutate()} style={{ padding: '4px 12px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Add</button>
          <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ padding: '8px 12px', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, textAlign: 'left' }}>
          + Add field
        </button>
      )}
    </div>
  );
}
```

- [ ] **Create `FieldMappingEditor.tsx`**

Conversion template field mapper. Props: `sourceTypeId: string; targetTypeId: string; value: Mapping[]; onChange: (m: Mapping[]) => void`.

```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listFields } from '@/lib/record-types';
import type { ConversionFieldMapping } from '@vencore/types';

type Mapping = Partial<ConversionFieldMapping>;

const BUILTINS = ['name', 'contact_id', 'company_id', 'owner_id'];

export function FieldMappingEditor({
  sourceTypeId, targetTypeId, value, onChange,
}: {
  sourceTypeId: string;
  targetTypeId: string;
  value: Mapping[];
  onChange: (m: Mapping[]) => void;
}) {
  const getToken = useApiToken();
  const { data: srcData } = useQuery({
    queryKey: ['record-type-fields', sourceTypeId],
    queryFn: async () => listFields(await getToken(), sourceTypeId),
  });
  const { data: tgtData } = useQuery({
    queryKey: ['record-type-fields', targetTypeId],
    queryFn: async () => listFields(await getToken(), targetTypeId),
  });
  const srcFields = srcData?.data ?? [];
  const tgtFields = tgtData?.data ?? [];

  function update(i: number, patch: Partial<Mapping>) {
    onChange(value.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={m.source_builtin ?? m.source_field_id ?? ''}
            onChange={e => {
              const v = e.target.value;
              if (BUILTINS.includes(v)) update(i, { source_builtin: v, source_field_id: undefined });
              else update(i, { source_field_id: v, source_builtin: undefined });
            }}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">— Source field —</option>
            <optgroup label="Built-in">
              {BUILTINS.map(b => <option key={b} value={b}>{b}</option>)}
            </optgroup>
            <optgroup label="Custom">
              {srcFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </optgroup>
          </select>
          <span style={{ color: 'var(--text3)' }}>→</span>
          <select
            value={m.target_builtin ?? m.target_field_id ?? ''}
            onChange={e => {
              const v = e.target.value;
              if (BUILTINS.includes(v)) update(i, { target_builtin: v, target_field_id: undefined });
              else update(i, { target_field_id: v, target_builtin: undefined });
            }}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">— Target field —</option>
            <optgroup label="Built-in">
              {BUILTINS.map(b => <option key={b} value={b}>{b}</option>)}
            </optgroup>
            <optgroup label="Custom">
              {tgtFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </optgroup>
          </select>
          <button onClick={() => remove(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, {}])}
        style={{ padding: '6px 12px', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text2)', fontSize: 13, textAlign: 'left' }}
      >+ Add mapping</button>
    </div>
  );
}
```

- [ ] **Commit**
```bash
git add apps/web/components/pipeline/
git commit -m "feat: add PipelineEditor, RecordTypeEditor, FieldMappingEditor settings components"
```

---

### Task 3: Settings Pages

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/pipelines/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/pipelines/record-types/page.tsx`
- Delete: `apps/web/app/(dashboard)/settings/pipelines/conversions/` (whole folder)

- [ ] **Write `settings/pipelines/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listPipelines, createPipeline, deletePipeline } from '@/lib/pipelines';
import { listRecordTypes } from '@/lib/record-types';
import { PipelineEditor } from '@/components/pipeline/PipelineEditor';
import type { PipelineWithDetails } from '@vencore/types';

export default function PipelinesSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTypeId, setNewTypeId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });
  const { data: typesData } = useQuery({
    queryKey: ['record-types'],
    queryFn: async () => listRecordTypes(await getToken()),
  });

  const pipelines: PipelineWithDetails[] = data?.data ?? [];
  const recordTypes = typesData?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () => createPipeline(await getToken(), { name: newName, record_type_id: newTypeId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pipelines'] }); setCreating(false); setNewName(''); },
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => deletePipeline(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>Pipelines</h1>
        <button
          onClick={() => setCreating(true)}
          style={{ padding: '8px 16px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}
        >+ New pipeline</button>
      </div>

      {creating && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Pipeline name"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 14 }} />
            <select value={newTypeId} onChange={e => setNewTypeId(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
              <option value="">Record type…</option>
              {recordTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => createMut.mutate()} disabled={!newName || !newTypeId}
              style={{ padding: '8px 16px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>Create</button>
            <button onClick={() => setCreating(false)}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text2)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pipelines.map(p => (
          <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 15, flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{p.record_type?.name} · {p.stages.length} stages</span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{expanded === p.id ? '▲' : '▼'}</span>
            </div>
            {expanded === p.id && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ marginTop: 16 }}>
                  <PipelineEditor pipelineId={p.id} />
                </div>
                <button
                  onClick={() => { if (confirm(`Delete pipeline "${p.name}"?`)) deleteMut.mutate(p.id); }}
                  style={{ marginTop: 16, padding: '6px 12px', background: 'var(--red-bg)', color: 'var(--red)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                >Delete pipeline</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Write `settings/pipelines/record-types/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listRecordTypes, createRecordType, listConversions, createConversion, deleteConversion } from '@/lib/record-types';
import { listPipelines } from '@/lib/pipelines';
import { RecordTypeEditor } from '@/components/pipeline/RecordTypeEditor';
import { FieldMappingEditor } from '@/components/pipeline/FieldMappingEditor';
import type { ConversionFieldMapping } from '@vencore/types';

export default function RecordTypesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, 'fields' | 'conversions'>>({});
  const [addingConversion, setAddingConversion] = useState<string | null>(null);
  const [convForm, setConvForm] = useState({ name: '', target_type_id: '', target_pipeline_id: '', target_stage_id: '' });
  const [convMappings, setConvMappings] = useState<Partial<ConversionFieldMapping>[]>([]);

  const { data } = useQuery({ queryKey: ['record-types'], queryFn: async () => listRecordTypes(await getToken()) });
  const { data: pipelinesData } = useQuery({ queryKey: ['pipelines'], queryFn: async () => listPipelines(await getToken()) });
  const types = data?.data ?? [];
  const pipelines = pipelinesData?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () => createRecordType(await getToken(), { name: 'New Type' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-types'] }),
  });

  function tab(typeId: string) { return activeTab[typeId] ?? 'fields'; }
  function setTab(typeId: string, t: 'fields' | 'conversions') {
    setActiveTab(prev => ({ ...prev, [typeId]: t }));
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>Record Types</h1>
        <button onClick={() => createMut.mutate()}
          style={{ padding: '8px 16px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          + New type
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {types.map(rt => (
          <div key={rt.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === rt.id ? null : rt.id)}>
              <span style={{ fontSize: 18 }}>{rt.icon ?? '📋'}</span>
              <span style={{ flex: 1, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 15 }}>{rt.name}</span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{expanded === rt.id ? '▲' : '▼'}</span>
            </div>
            {expanded === rt.id && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                  {(['fields', 'conversions'] as const).map(t => (
                    <button key={t} onClick={() => setTab(rt.id, t)}
                      style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', borderBottom: tab(rt.id) === t ? '2px solid var(--text)' : '2px solid transparent', color: tab(rt.id) === t ? 'var(--text)' : 'var(--text2)' }}>
                      {t === 'fields' ? 'Fields' : 'Converts to →'}
                    </button>
                  ))}
                </div>
                <div style={{ padding: 16 }}>
                  {tab(rt.id) === 'fields' && <RecordTypeEditor recordTypeId={rt.id} />}
                  {tab(rt.id) === 'conversions' && (
                    <ConversionsTab
                      typeId={rt.id}
                      types={types}
                      pipelines={pipelines}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversionsTab({ typeId, types, pipelines }: { typeId: string; types: any[]; pipelines: any[] }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', target_type_id: '', target_pipeline_id: '', target_stage_id: '' });
  const [mappings, setMappings] = useState<Partial<ConversionFieldMapping>[]>([]);

  const { data } = useQuery({
    queryKey: ['conversions', typeId],
    queryFn: async () => listConversions(await getToken(), typeId),
  });
  const conversions = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () => createConversion(await getToken(), typeId, { ...form, field_mappings: mappings }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversions', typeId] }); setAdding(false); setMappings([]); },
  });
  const deleteMut = useMutation({
    mutationFn: async (tid: string) => deleteConversion(await getToken(), typeId, tid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversions', typeId] }),
  });

  const targetPipeline = pipelines.find(p => p.id === form.target_pipeline_id);
  const targetStages = targetPipeline?.stages ?? [];

  return (
    <div>
      {conversions.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ flex: 1, fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>{c.name}</span>
          <button onClick={() => deleteMut.mutate(c.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>
      ))}
      {adding ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name"
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
          <select value={form.target_type_id} onChange={e => setForm(f => ({ ...f, target_type_id: e.target.value }))}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
            <option value="">Target record type…</option>
            {types.filter(t => t.id !== typeId).map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
          </select>
          <select value={form.target_pipeline_id} onChange={e => setForm(f => ({ ...f, target_pipeline_id: e.target.value, target_stage_id: '' }))}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
            <option value="">Target pipeline…</option>
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={form.target_stage_id} onChange={e => setForm(f => ({ ...f, target_stage_id: e.target.value }))}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
            <option value="">Initial stage…</option>
            {targetStages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {form.target_type_id && (
            <FieldMappingEditor
              sourceTypeId={typeId}
              targetTypeId={form.target_type_id}
              value={mappings}
              onChange={setMappings}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => createMut.mutate()}
              disabled={!form.name || !form.target_type_id || !form.target_pipeline_id || !form.target_stage_id}
              style={{ padding: '8px 16px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Save</button>
            <button onClick={() => setAdding(false)}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: 8, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
          + Add conversion
        </button>
      )}
    </div>
  );
}
```

- [ ] **Delete conversions folder**
```bash
rm -rf "apps/web/app/(dashboard)/settings/pipelines/conversions"
```

- [ ] **Compile check**
```bash
cd apps/web && pnpm lint
```

- [ ] **Commit**
```bash
git add -A apps/web/app/(dashboard)/settings/pipelines/
git commit -m "feat: settings pages for pipelines and record types"
```

---

### Task 4: Pipeline Pages + ViewSwitcher

**Files:**
- Modify: `apps/web/app/(dashboard)/pipeline/page.tsx`
- Modify: `apps/web/app/(dashboard)/pipeline/[pipelineId]/page.tsx`
- Create: `apps/web/components/pipeline/ViewSwitcher.tsx`

- [ ] **Write `pipeline/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

// Server component — fetch pipelines, redirect to default
export default async function PipelinePage() {
  // Client-side redirect via loading state
  return <PipelineRedirect />;
}
```

Since the page needs auth token (Clerk), it must be a Client Component:

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listPipelines } from '@/lib/pipelines';

export default function PipelinePage() {
  const getToken = useApiToken();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  useEffect(() => {
    if (!data) return;
    const pipelines = data.data ?? [];
    const def = pipelines.find(p => p.is_default) ?? pipelines[0];
    if (def) router.replace(`/pipeline/${def.id}`);
  }, [data, router]);

  if (isLoading) return (
    <div style={{ padding: 40, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>Loading…</div>
  );

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'Instrument Serif, serif', color: 'var(--text)', marginBottom: 16 }}>No pipelines yet</h2>
      <p style={{ color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 24 }}>
        Create your first pipeline in settings.
      </p>
      <a href="/settings/pipelines" style={{ padding: '10px 20px', background: 'var(--text)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
        Go to pipeline settings
      </a>
    </div>
  );
}
```

- [ ] **Create `ViewSwitcher.tsx`**

```tsx
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { updatePipeline } from '@/lib/pipelines';

type View = 'kanban' | 'table' | 'list';

const VIEWS: { id: View; icon: string; label: string }[] = [
  { id: 'kanban', icon: '⬛', label: 'Kanban' },
  { id: 'table', icon: '☰', label: 'Table' },
  { id: 'list', icon: '≡', label: 'List' },
];

export function ViewSwitcher({ pipelineId, current, onChange }: {
  pipelineId: string;
  current: View;
  onChange: (v: View) => void;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (view: View) => updatePipeline(await getToken(), pipelineId, { view }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--surface2)', borderRadius: 8, padding: 3 }}>
      {VIEWS.map(v => (
        <button key={v.id}
          onClick={() => { onChange(v.id); mut.mutate(v.id); }}
          title={v.label}
          style={{
            padding: '5px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
            background: current === v.id ? 'var(--surface)' : 'transparent',
            color: current === v.id ? 'var(--text)' : 'var(--text2)',
            fontSize: 13, fontFamily: 'DM Sans, sans-serif',
            boxShadow: current === v.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >{v.icon} {v.label}</button>
      ))}
    </div>
  );
}
```

- [ ] **Write `pipeline/[pipelineId]/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useApiToken } from '@/lib/useApiToken';
import { getPipeline } from '@/lib/pipelines';
import { ViewSwitcher } from '@/components/pipeline/ViewSwitcher';
import { PipelineSwitcher } from '../PipelineSwitcher';
import { PipelineKanban } from '@/components/pipeline/PipelineKanban';
import { PipelineTable } from '@/components/pipeline/PipelineTable';
import { PipelineList } from '@/components/pipeline/PipelineList';

type View = 'kanban' | 'table' | 'list';

export default function PipelineViewPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const getToken = useApiToken();
  const [view, setView] = useState<View>('kanban');
  const [addTrigger, setAddTrigger] = useState(0);
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
    onSuccess: d => { if (d.data.view) setView(d.data.view as View); },
  });
  const pipeline = data?.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <PipelineSwitcher currentId={pipelineId} />
        <div style={{ flex: 1 }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search records…"
          style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans, sans-serif', width: 200 }}
        />
        {pipeline && (
          <ViewSwitcher pipelineId={pipelineId} current={view} onChange={setView} />
        )}
        <button
          onClick={() => setAddTrigger(n => n + 1)}
          style={{ padding: '8px 16px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
        >+ Add record</button>
      </div>

      {/* View */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {pipeline && view === 'kanban' && (
          <PipelineKanban pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'table' && (
          <PipelineTable pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'list' && (
          <PipelineList pipeline={pipeline} search={search} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Compile check**
```bash
cd apps/web && pnpm lint
```

- [ ] **Commit**
```bash
git add apps/web/app/(dashboard)/pipeline/ apps/web/components/pipeline/ViewSwitcher.tsx
git commit -m "feat: pipeline pages with view switcher"
```

---

### Task 5: PipelineKanban + RecordCard

**Files:**
- Create: `apps/web/components/pipeline/RecordCard.tsx`
- Create: `apps/web/components/pipeline/PipelineKanban.tsx`

- [ ] **Create `RecordCard.tsx`**

```tsx
import type { PipelineRecordWithValues, RecordTypeField } from '@vencore/types';

function getFieldValue(record: PipelineRecordWithValues, fields: RecordTypeField[], label: string): unknown {
  const field = fields.find(f => f.label.toLowerCase() === label.toLowerCase());
  if (!field) return null;
  const fv = record.field_values.find(v => v.field_id === field.id);
  return fv?.value ?? null;
}

export function RecordCard({
  record,
  fields,
  ownerName,
  contactName,
  onClick,
  dragging,
}: {
  record: PipelineRecordWithValues;
  fields: RecordTypeField[];
  ownerName?: string;
  contactName?: string;
  onClick: () => void;
  dragging?: boolean;
}) {
  const value = getFieldValue(record, fields, 'value');
  const fmtValue = value != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
    : null;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        opacity: dragging ? 0.5 : 1,
        userSelect: 'none',
        transition: 'box-shadow 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      {record.record_number && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' }}>
          {record.record_number}
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', marginBottom: 6 }}>
        {record.name}
      </div>
      {(contactName || fmtValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {contactName && (
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>{contactName}</span>
          )}
          {fmtValue && (
            <span style={{ fontSize: 13, fontFamily: 'Instrument Serif, serif', color: 'var(--text)' }}>{fmtValue}</span>
          )}
        </div>
      )}
      {ownerName && (
        <div style={{ marginTop: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%', background: 'var(--surface2)',
            fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif',
            border: '1px solid var(--border)',
          }}>
            {ownerName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Create `PipelineKanban.tsx`**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listRecords, updateRecord } from '@/lib/records';
import { apiFetch } from '@/lib/api';
import { RecordCard } from './RecordCard';
import { RecordDetailPanel } from './RecordDetailPanel';
import { RecordForm } from './RecordForm';
import type { PipelineWithDetails, PipelineRecordWithValues, RecordTypeField } from '@vencore/types';

interface WorkspaceUser { id: string; name: string; }

export function PipelineKanban({
  pipeline, search, addTrigger,
}: { pipeline: PipelineWithDetails; search: string; addTrigger: number }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (addTrigger > 0) setCreateStageId(pipeline.stages[0]?.id ?? null); }, [addTrigger]);

  const { data: recordsData } = useQuery({
    queryKey: ['records', pipeline.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: pipeline.id }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () => apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) =>
      updateRecord(await getToken(), id, { stage_id }),
    onMutate: async ({ id, stage_id }) => {
      await qc.cancelQueries({ queryKey: ['records', pipeline.id] });
      const prev = qc.getQueryData(['records', pipeline.id]);
      qc.setQueryData(['records', pipeline.id], (old: any) => ({
        ...old, data: old.data.map((r: PipelineRecordWithValues) =>
          r.id === id ? { ...r, stage_id } : r
        ),
      }));
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      qc.setQueryData(['records', pipeline.id], ctx?.prev);
      setError('Failed to move record');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['records', pipeline.id] }),
  });

  const allRecords: PipelineRecordWithValues[] = recordsData?.data ?? [];
  const filtered = search
    ? allRecords.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRecords;

  const users = usersData?.data ?? [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  const fields: RecordTypeField[] = pipeline.record_type?.fields ?? [];

  const activeStages = pipeline.stages.filter(s => !s.is_won && !s.is_lost);
  const closedStages = pipeline.stages.filter(s => s.is_won || s.is_lost);

  const valueField = fields.find(f => f.label.toLowerCase() === 'value' && f.field_type === 'number');
  function stageTotal(stageId: string) {
    if (!valueField) return null;
    const total = filtered.filter(r => r.stage_id === stageId).reduce((sum, r) => {
      const fv = r.field_values.find(v => v.field_id === valueField.id);
      return sum + (fv ? Number(fv.value) : 0);
    }, 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total);
  }

  return (
    <>
      {error && (
        <div style={{ margin: '12px 24px', padding: '10px 14px', background: 'var(--amber-bg)', color: 'var(--amber)', borderRadius: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)' }}>×</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, padding: '16px 24px', overflowX: 'auto', height: '100%', alignItems: 'flex-start' }}>
        {activeStages.map(stage => {
          const cards = filtered.filter(r => r.stage_id === stage.id);
          const total = stageTotal(stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragId) moveMut.mutate({ id: dragId, stage_id: stage.id }); setDragId(null); }}
              style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px', marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color ?? '#6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', flex: 1 }}>{stage.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{cards.length}</span>
                {total && <span style={{ fontSize: 12, fontFamily: 'Instrument Serif, serif', color: 'var(--text2)' }}>{total}</span>}
              </div>
              {/* Cards */}
              {cards.map(record => (
                <div
                  key={record.id}
                  draggable
                  onDragStart={() => setDragId(record.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  <RecordCard
                    record={record}
                    fields={fields}
                    ownerName={userMap[record.owner_id]}
                    onClick={() => setSelectedId(record.id)}
                    dragging={dragId === record.id}
                  />
                </div>
              ))}
              {/* Add in this column */}
              <button
                onClick={() => setCreateStageId(stage.id)}
                style={{ padding: '8px', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text3)', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
              >+ Add</button>
            </div>
          );
        })}
        {/* Won/Lost summary */}
        {closedStages.length > 0 && (
          <div style={{ flex: '0 0 160px' }}>
            {closedStages.map(stage => {
              const cnt = filtered.filter(r => r.stage_id === stage.id).length;
              return (
                <div key={stage.id} style={{
                  padding: '10px 12px', background: stage.is_won ? 'var(--green-bg)' : 'var(--red-bg)',
                  borderRadius: 8, marginBottom: 8,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: stage.is_won ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Sans, sans-serif' }}>{stage.name}</div>
                  <div style={{ fontSize: 18, fontFamily: 'Instrument Serif, serif', color: stage.is_won ? 'var(--green)' : 'var(--red)' }}>{cnt}</div>
                  {stageTotal(stage.id) && <div style={{ fontSize: 12, color: stage.is_won ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Sans, sans-serif' }}>{stageTotal(stage.id)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedId && (
        <RecordDetailPanel
          recordId={selectedId}
          pipeline={pipeline}
          onClose={() => setSelectedId(null)}
        />
      )}
      {createStageId && (
        <RecordForm
          pipeline={pipeline}
          defaultStageId={createStageId}
          onClose={() => setCreateStageId(null)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['records', pipeline.id] }); setCreateStageId(null); }}
        />
      )}
    </>
  );
}
```

- [ ] **Compile check + run dev to verify kanban renders**
```bash
cd apps/web && pnpm lint
```

- [ ] **Commit**
```bash
git add apps/web/components/pipeline/RecordCard.tsx apps/web/components/pipeline/PipelineKanban.tsx
git commit -m "feat: PipelineKanban with HTML5 DnD and RecordCard"
```

---

### Task 6: PipelineTable + PipelineList

**Files:**
- Create: `apps/web/components/pipeline/PipelineTable.tsx`
- Create: `apps/web/components/pipeline/PipelineList.tsx`

- [ ] **Create `PipelineTable.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listRecords, updateRecord } from '@/lib/records';
import { RecordDetailPanel } from './RecordDetailPanel';
import type { PipelineWithDetails, PipelineRecordWithValues } from '@vencore/types';

type SortKey = 'name' | 'created_at' | 'stage_id';

export function PipelineTable({ pipeline, search, addTrigger }: {
  pipeline: PipelineWithDetails; search: string; addTrigger: number;
}) {
  const getToken = useApiToken();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);

  const { data } = useQuery({
    queryKey: ['records', pipeline.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: pipeline.id }),
  });
  const qc = useQueryClient();

  const allRecords: PipelineRecordWithValues[] = data?.data ?? [];
  const stageMap = Object.fromEntries(pipeline.stages.map(s => [s.id, s]));
  const fields = pipeline.record_type?.fields ?? [];
  const valueField = fields.find(f => f.label.toLowerCase() === 'value');

  const filtered = search
    ? allRecords.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRecords;

  const sorted = [...filtered].sort((a, b) => {
    let av: string = (a as any)[sort.key] ?? '';
    let bv: string = (b as any)[sort.key] ?? '';
    return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function fmtDate(d: string) { return new Date(d).toLocaleDateString(); }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', userSelect: 'none', background: 'var(--surface)',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 14, color: 'var(--text)', fontFamily: 'DM Sans, sans-serif',
    borderBottom: '1px solid var(--border)', verticalAlign: 'middle',
  };

  return (
    <>
      <div style={{ overflow: 'auto', height: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => toggleSort('name')}>
                Name {sort.key === 'name' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={thStyle} onClick={() => toggleSort('stage_id')}>Stage</th>
              {valueField && <th style={thStyle}>Value</th>}
              <th style={thStyle} onClick={() => toggleSort('created_at')}>
                Created {sort.key === 'created_at' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(record => {
              const stage = stageMap[record.stage_id];
              const fv = valueField ? record.field_values.find(v => v.field_id === valueField.id) : null;
              const val = fv ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(fv.value)) : '—';
              return (
                <tr key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={tdStyle}>{record.record_number && <span style={{ fontSize: 11, color: 'var(--text3)', marginRight: 6 }}>{record.record_number}</span>}{record.name}</td>
                  <td style={tdStyle}>
                    {stage && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, background: `${stage.color}22`, fontSize: 12, fontWeight: 500, color: stage.color ?? 'var(--text)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color ?? '#6366f1' }} />
                      {stage.name}
                    </span>}
                  </td>
                  {valueField && <td style={{ ...tdStyle, fontFamily: 'Instrument Serif, serif' }}>{val}</td>}
                  <td style={{ ...tdStyle, color: 'var(--text2)', fontSize: 12 }}>{fmtDate(record.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedId && (
        <RecordDetailPanel
          recordId={selectedId}
          pipeline={pipeline}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Create `PipelineList.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listRecords } from '@/lib/records';
import { RecordDetailPanel } from './RecordDetailPanel';
import type { PipelineWithDetails, PipelineRecordWithValues } from '@vencore/types';

export function PipelineList({ pipeline, search }: { pipeline: PipelineWithDetails; search: string }) {
  const getToken = useApiToken();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['records', pipeline.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: pipeline.id }),
  });
  const allRecords: PipelineRecordWithValues[] = data?.data ?? [];
  const stageMap = Object.fromEntries(pipeline.stages.map(s => [s.id, s]));
  const fields = pipeline.record_type?.fields ?? [];
  const valueField = fields.find(f => f.label.toLowerCase() === 'value');

  const filtered = search
    ? allRecords.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRecords;

  return (
    <>
      <div style={{ overflow: 'auto', height: '100%' }}>
        {filtered.map(record => {
          const stage = stageMap[record.stage_id];
          const fv = valueField ? record.field_values.find(v => v.field_id === valueField.id) : null;
          const val = fv ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(fv.value)) : null;
          return (
            <div key={record.id}
              onClick={() => setSelectedId(record.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 24px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              {record.record_number && <span style={{ fontSize: 11, color: 'var(--text3)', width: 80, flexShrink: 0 }}>{record.record_number}</span>}
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}>{record.name}</span>
              {stage && (
                <span style={{ padding: '3px 10px', borderRadius: 12, background: `${stage.color}22`, fontSize: 12, color: stage.color ?? 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}>
                  {stage.name}
                </span>
              )}
              {val && <span style={{ fontSize: 14, fontFamily: 'Instrument Serif, serif', color: 'var(--text)', width: 100, textAlign: 'right' }}>{val}</span>}
            </div>
          );
        })}
      </div>
      {selectedId && (
        <RecordDetailPanel recordId={selectedId} pipeline={pipeline} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
```

- [ ] **Commit**
```bash
git add apps/web/components/pipeline/PipelineTable.tsx apps/web/components/pipeline/PipelineList.tsx
git commit -m "feat: PipelineTable and PipelineList views"
```

---

### Task 7: RecordDetailPanel + RecordForm

**Files:**
- Create: `apps/web/components/pipeline/RecordDetailPanel.tsx`
- Create: `apps/web/components/pipeline/RecordForm.tsx`

- [ ] **Create `RecordDetailPanel.tsx`**

Slide-over panel. Inline-editable fields. Auto-save on blur. Conversion buttons in footer.

```tsx
'use client';
import { useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { getRecord, updateRecord, deleteRecord } from '@/lib/records';
import { listConversions } from '@/lib/record-types';
import { ConversionWizard } from './ConversionWizard';
import type { PipelineWithDetails, RecordTypeField, PipelineRecordWithValues } from '@vencore/types';

function FieldInput({ field, value, onSave }: {
  field: RecordTypeField;
  value: unknown;
  onSave: (v: unknown) => void;
}) {
  const [local, setLocal] = useState(String(value ?? ''));
  const common: React.CSSProperties = {
    width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 14, fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)',
  };
  if (field.field_type === 'boolean') {
    return <input type="checkbox" checked={Boolean(value)} onChange={e => onSave(e.target.checked)} />;
  }
  if (field.field_type === 'select' && field.options) {
    return (
      <select value={String(value ?? '')} onChange={e => onSave(e.target.value)} style={common}>
        <option value="">—</option>
        {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onSave(field.field_type === 'number' ? Number(local) : local)}
      style={common}
    />
  );
}

export function RecordDetailPanel({ recordId, pipeline, onClose }: {
  recordId: string;
  pipeline: PipelineWithDetails;
  onClose: () => void;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [convTemplate, setConvTemplate] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['record', recordId],
    queryFn: async () => getRecord(await getToken(), recordId),
  });
  const { data: conversionsData } = useQuery({
    queryKey: ['conversions', pipeline.record_type?.id],
    queryFn: async () => pipeline.record_type ? listConversions(await getToken(), pipeline.record_type.id) : { data: [] },
    enabled: !!pipeline.record_type,
  });

  const record = data?.data;
  const conversions = conversionsData?.data ?? [];
  const fields = pipeline.record_type?.fields ?? [];

  const updateMut = useMutation({
    mutationFn: async (body: Parameters<typeof updateRecord>[2]) =>
      updateRecord(await getToken(), recordId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record', recordId] });
      qc.invalidateQueries({ queryKey: ['records', pipeline.id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => deleteRecord(await getToken(), recordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records', pipeline.id] });
      onClose();
    },
  });

  function saveField(field: RecordTypeField, value: unknown) {
    updateMut.mutate({ field_values: { [field.id]: value } });
  }

  function getFieldValue(field: RecordTypeField): unknown {
    if (!record) return null;
    const fv = record.field_values.find(v => v.field_id === field.id);
    return fv?.value ?? null;
  }

  const stage = pipeline.stages.find(s => s.id === record?.stage_id);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 40 }} />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <input
              defaultValue={record?.name ?? ''}
              onBlur={e => updateMut.mutate({ name: e.target.value })}
              style={{ fontSize: 18, fontFamily: 'Instrument Serif, serif', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', flex: 1, marginRight: 12 }}
            />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {record?.record_number && <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>{record.record_number}</span>}
            {stage && (
              <span style={{ padding: '3px 10px', borderRadius: 12, background: `${stage.color}22`, fontSize: 12, color: stage.color ?? 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}>
                {stage.name}
              </span>
            )}
            <select
              value={record?.stage_id ?? ''}
              onChange={e => updateMut.mutate({ stage_id: e.target.value })}
              style={{ padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'DM Sans, sans-serif', background: 'transparent' }}
            >
              {pipeline.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Fields */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {record && fields.map(field => (
            <div key={field.id} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4 }}>
                {field.label}{field.is_required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
              </label>
              <FieldInput field={field} value={getFieldValue(field)} onSave={v => saveField(field, v)} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {conversions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {conversions.map(c => (
                <button key={c.id} onClick={() => setConvTemplate(c.id)}
                  style={{ padding: '6px 14px', background: 'var(--blue-bg)', color: 'var(--blue)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
                  {c.name} →
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => { if (confirm('Delete this record?')) deleteMut.mutate(); }}
            style={{ padding: '8px 16px', background: 'var(--red-bg)', color: 'var(--red)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
          >Delete record</button>
        </div>
      </div>

      {convTemplate && record && (
        <ConversionWizard
          record={record}
          templateId={convTemplate}
          sourceTypeId={pipeline.record_type!.id}
          onClose={() => setConvTemplate(null)}
          onSuccess={(targetId) => {
            setConvTemplate(null);
            onClose();
            qc.invalidateQueries({ queryKey: ['records'] });
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Create `RecordForm.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { createRecord } from '@/lib/records';
import { apiFetch } from '@/lib/api';
import type { PipelineWithDetails, RecordTypeField } from '@vencore/types';

interface User { id: string; name: string; }

export function RecordForm({ pipeline, defaultStageId, onClose, onSuccess }: {
  pipeline: PipelineWithDetails;
  defaultStageId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const getToken = useApiToken();
  const fields = pipeline.record_type?.fields ?? [];
  const [name, setName] = useState('');
  const [stageId, setStageId] = useState(defaultStageId);
  const [ownerId, setOwnerId] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: usersData } = useState<{ data: User[] } | undefined>(undefined);

  const createMut = useMutation({
    mutationFn: async () => createRecord(await getToken(), {
      record_type_id: pipeline.record_type!.id,
      pipeline_id: pipeline.id,
      stage_id: stageId,
      name,
      owner_id: ownerId,
      field_values: fieldValues,
    }),
    onSuccess: () => { onSuccess(); },
    onError: (e: Error) => setError(e.message),
  });

  function setFv(fieldId: string, value: unknown) {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
    zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modalStyle: React.CSSProperties = {
    background: 'var(--surface)', borderRadius: 14, width: 480,
    maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.16)',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--text)', margin: 0 }}>
            New {pipeline.record_type?.name ?? 'Record'}
          </h2>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4 }}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4 }}>Stage</label>
            <select value={stageId} onChange={e => setStageId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
              {pipeline.stages.filter(s => !s.is_won && !s.is_lost).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {fields.map(field => (
            <div key={field.id}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4 }}>
                {field.label}{field.is_required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
              </label>
              {field.field_type === 'select' && field.options ? (
                <select value={String(fieldValues[field.id] ?? '')} onChange={e => setFv(field.id, e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
                  <option value="">—</option>
                  {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : field.field_type === 'boolean' ? (
                <input type="checkbox" checked={Boolean(fieldValues[field.id])} onChange={e => setFv(field.id, e.target.checked)} />
              ) : (
                <input
                  type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                  value={String(fieldValues[field.id] ?? '')}
                  onChange={e => setFv(field.id, field.field_type === 'number' ? Number(e.target.value) : e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
          <button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}
            style={{ padding: '8px 20px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
            {createMut.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Commit**
```bash
git add apps/web/components/pipeline/RecordDetailPanel.tsx apps/web/components/pipeline/RecordForm.tsx
git commit -m "feat: RecordDetailPanel with auto-save and RecordForm"
```

---

### Task 8: ConversionWizard

**Files:**
- Create: `apps/web/components/pipeline/ConversionWizard.tsx`

- [ ] **Create `ConversionWizard.tsx`**

3-step modal: select template → preview/override fields → confirm.

```tsx
'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { convertRecord } from '@/lib/records';
import { listConversions } from '@/lib/record-types';
import type { PipelineRecordWithValues, ConversionTemplateWithMappings } from '@vencore/types';

type Step = 'select' | 'preview' | 'confirm';

export function ConversionWizard({ record, templateId, sourceTypeId, onClose, onSuccess }: {
  record: PipelineRecordWithValues;
  templateId: string;
  sourceTypeId: string;
  onClose: () => void;
  onSuccess: (targetId: string) => void;
}) {
  const getToken = useApiToken();
  const [step, setStep] = useState<Step>(templateId ? 'preview' : 'select');
  const [selectedId, setSelectedId] = useState<string>(templateId);
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: templatesData } = useQuery({
    queryKey: ['conversions', sourceTypeId],
    queryFn: async () => listConversions(await getToken(), sourceTypeId),
  });
  const templates = templatesData?.data ?? [];
  const template = templates.find(t => t.id === selectedId);

  const convertMut = useMutation({
    mutationFn: async () => convertRecord(await getToken(), record.id, { template_id: selectedId, field_overrides: overrides }),
    onSuccess: (res) => onSuccess(res.data.target.id),
    onError: (e: Error) => setError(e.message),
  });

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modalStyle: React.CSSProperties = {
    background: 'var(--surface)', borderRadius: 14, width: 520,
    maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
  };

  function fvValue(fieldId: string): unknown {
    const fv = record.field_values.find(v => v.field_id === fieldId);
    return fv?.value ?? null;
  }

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--text)', margin: 0 }}>Convert record</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
          {(['select', 'preview', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: 'var(--text3)', margin: '0 6px' }}>›</span>}
              <span style={{ fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: step === s ? 'var(--text)' : 'var(--text3)', fontWeight: step === s ? 600 : 400 }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 24px' }}>
          {error && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          {step === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(t => (
                <div key={t.id}
                  onClick={() => { setSelectedId(t.id); setStep('preview'); }}
                  style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: selectedId === t.id ? 'var(--surface2)' : 'var(--surface)' }}
                >
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{t.name}</div>
                </div>
              ))}
            </div>
          )}

          {step === 'preview' && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>
                Review the pre-filled values. Edit any field before converting.
              </p>
              {template.field_mappings.filter(m => m.target_field_id || m.target_builtin).map((m, i) => {
                const label = m.target_builtin ?? m.target_field_id ?? '';
                const sourceValue = m.source_builtin
                  ? (record as any)[m.source_builtin]
                  : m.source_field_id ? fvValue(m.source_field_id) : '';
                const currentValue = overrides[label] !== undefined ? overrides[label] : sourceValue;
                return (
                  <div key={i}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4 }}>{label}</label>
                    <input
                      value={String(currentValue ?? '')}
                      onChange={e => setOverrides(prev => ({ ...prev, [label]: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {step === 'confirm' && template && (
            <div>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--text2)', marginTop: 0 }}>
                This will create a new record using template <strong>{template.name}</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {step !== 'select' && (
            <button onClick={() => setStep(step === 'confirm' ? 'preview' : 'select')}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>Back</button>
          )}
          {step === 'preview' && (
            <button onClick={() => setStep('confirm')}
              style={{ padding: '8px 20px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>Continue</button>
          )}
          {step === 'confirm' && (
            <button onClick={() => convertMut.mutate()} disabled={convertMut.isPending}
              style={{ padding: '8px 20px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
              {convertMut.isPending ? 'Converting…' : 'Convert'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Commit**
```bash
git add apps/web/components/pipeline/ConversionWizard.tsx
git commit -m "feat: ConversionWizard 3-step modal"
```

---

### Task 9: Delete Old Web Code + Final Cleanup

**Files:**
- Delete: `apps/web/components/deals/` (whole folder)
- Delete: `apps/web/components/pipeline/DealKanban.tsx`
- Delete: `apps/web/lib/deals.ts`

- [ ] **Delete old files**
```bash
rm -rf apps/web/components/deals/
rm apps/web/components/pipeline/DealKanban.tsx
rm apps/web/lib/deals.ts
```

- [ ] **Find and fix any remaining deals imports**
```bash
grep -r "from.*lib/deals\|from.*DealKanban\|from.*deals/" apps/web/src apps/web/app apps/web/components apps/web/lib 2>/dev/null
```
Expected: no output. If any found — remove those imports and replace references with new equivalents.

- [ ] **Full compile check**
```bash
cd apps/web && pnpm lint
```
Expected: 0 errors

- [ ] **Full build check**
```bash
cd apps/web && pnpm build
```
Expected: builds successfully

- [ ] **Run dev and smoke test**
```bash
pnpm dev
```
Open http://localhost:3000/pipeline — verify:
- Redirects to first pipeline
- Kanban renders with stage columns
- Can drag a card between columns
- "+ Add record" opens RecordForm
- Click a card opens RecordDetailPanel
- View switcher switches to table/list
- Settings > Pipelines shows PipelineEditor
- Settings > Record Types shows RecordTypeEditor

- [ ] **Final commit**
```bash
git add -A apps/web/
git commit -m "chore: remove deals-specific web components, pipeline overhaul complete"
```

---

## Part 2 Done

Pipeline overhaul complete. Both parts merged to `feat/pipeline-engine-overhaul`. Open PR when ready.
