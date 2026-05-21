# Enquiry → Quote → Job Conversion Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI for Vantage's record conversion system — a slide-over drawer, a prefill form modal, and a Settings page for admins to configure conversion templates with field mappings.

**Architecture:** The backend conversion engine (templates, field mappings, execute endpoint) already exists in `apps/api/src/routes/conversions.ts`. `RecordDetail.tsx` (drawer) and `ConversionModal.tsx` (basic modal) already exist but need enhancement. Three backend endpoints need additions/improvements. The Settings → Conversions page is new.

**Tech Stack:** Next.js 14 App Router, React, TanStack Query, Express/Kysely backend, TypeScript strict mode, Vitest for API tests.

---

## Existing files (read before editing)

- `apps/api/src/routes/conversions.ts` — backend routes (templates CRUD + convert execute)
- `apps/api/src/routes/conversions.test.ts` — existing tests
- `apps/web/components/pipeline/RecordDetail.tsx` — drawer component (already wired to RecordTable + RecordList via `onClick`)
- `apps/web/components/pipeline/ConversionModal.tsx` — basic modal (template list only, no prefill)
- `apps/web/app/(dashboard)/settings/layout.tsx` — settings tab nav

---

## Task 1: Backend — enhance conversions API

**Files:**
- Modify: `apps/api/src/routes/conversions.ts`
- Modify: `apps/api/src/routes/conversions.test.ts`

Three changes: (a) add `GET /templates/:id` returning template + enriched field_mappings, (b) enhance `GET /records/:id/conversions` to include source/target record names, (c) extend `POST /records/:id/convert` to accept optional `field_overrides`.

- [ ] **Step 1: Write failing tests**

Open `apps/api/src/routes/conversions.test.ts`. Append these three test blocks at the end of the file (before the closing):

```typescript
describe('GET /templates/:id', () => {
  it('returns template with enriched field_mappings', async () => {
    const template = { id: 'tpl-1', name: 'Enquiry → Quote', workspace_id: 'ws-1', source_type_id: 'rt-1', target_type_id: 'rt-2', target_pipeline_id: 'pl-1', target_stage_id: 'st-1', position: 0, created_at: new Date().toISOString() };
    const mapping = { id: 'map-1', template_id: 'tpl-1', source_field_id: null, source_builtin: 'name', target_field_id: null, target_builtin: 'name' };

    let callCount = 0;
    const chain: Record<string, unknown> = {};
    const methods = ['selectFrom','insertInto','updateTable','deleteFrom','values','set','where','select',
      'selectAll','innerJoin','returning','returningAll','onConflict','doNothing',
      'execute','executeTakeFirst','executeTakeFirstOrThrow','orderBy','limit','offset','in'];
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
    chain['executeTakeFirst'] = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? Promise.resolve(template) : Promise.resolve(null);
    });
    chain['execute'] = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 2 ? Promise.resolve([mapping]) : Promise.resolve([]);
    });
    const db = { selectFrom: vi.fn().mockReturnValue(chain), insertInto: vi.fn().mockReturnValue(chain), updateTable: vi.fn().mockReturnValue(chain), deleteFrom: vi.fn().mockReturnValue(chain), fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) } };

    const router = createConversionsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'get', '/templates/:id');
    const req = mockReq({ params: { id: 'tpl-1' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: { field_mappings: unknown[] } };
    expect(call.data.field_mappings).toBeDefined();
  });
});

describe('GET /records/:id/conversions (enriched)', () => {
  it('returns conversions with source and target record names', async () => {
    const conv = { id: 'conv-1', source_record_id: 'src-1', target_record_id: 'tgt-1', template_id: 'tpl-1', converted_by: 'user-1', converted_at: new Date().toISOString() };
    const srcRecord = { id: 'src-1', name: 'Enquiry 1', record_number: 'ENQ-001' };
    const tgtRecord = { id: 'tgt-1', name: 'Quote 1', record_number: 'QUO-001' };

    let callCount = 0;
    const chain: Record<string, unknown> = {};
    const methods = ['selectFrom','insertInto','updateTable','deleteFrom','values','set','where','select',
      'selectAll','returning','returningAll','execute','executeTakeFirst','executeTakeFirstOrThrow','orderBy','in','or'];
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
    chain['executeTakeFirst'] = vi.fn().mockResolvedValue({ id: 'src-1' });
    chain['execute'] = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([conv]);
      return Promise.resolve([srcRecord, tgtRecord]);
    });
    const db = { selectFrom: vi.fn().mockReturnValue(chain), insertInto: vi.fn().mockReturnValue(chain), updateTable: vi.fn().mockReturnValue(chain), deleteFrom: vi.fn().mockReturnValue(chain), fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) } };

    const router = createConversionsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'get', '/records/:id/conversions');
    const req = mockReq({ params: { id: 'src-1' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: Array<{ target_record_name: unknown }> };
    expect(call.data[0]?.target_record_name).toBeDefined();
  });
});

describe('POST /records/:id/convert with field_overrides', () => {
  it('uses field_overrides to override the record name', async () => {
    const sourceRecord = { id: 'src-1', workspace_id: 'ws-1', name: 'Original Name', deleted_at: null, owner_id: 'user-1', contact_id: null, company_id: null };
    const templateRow = { id: 'tpl-1', target_type_id: 'rt-2', target_pipeline_id: 'pl-1', target_stage_id: 'st-1', workspace_id: 'ws-1' };
    const targetRecord = { id: 'tgt-1' };

    let takeFCount = 0;
    const chain: Record<string, unknown> = {};
    const methods = ['selectFrom','insertInto','updateTable','deleteFrom','values','set','where','select',
      'selectAll','returning','returningAll','execute','executeTakeFirst','executeTakeFirstOrThrow','orderBy','in'];
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirst'] = vi.fn().mockImplementation(() => {
      takeFCount++;
      if (takeFCount === 1) return Promise.resolve(sourceRecord);
      if (takeFCount === 2) return Promise.resolve(templateRow);
      return Promise.resolve(null);
    });
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(targetRecord);

    const mockDb = {
      selectFrom: vi.fn().mockReturnValue(chain),
      insertInto: vi.fn().mockReturnValue(chain),
      updateTable: vi.fn().mockReturnValue(chain),
      deleteFrom: vi.fn().mockReturnValue(chain),
      transaction: vi.fn().mockReturnValue({
        execute: vi.fn().mockImplementation(async (fn: (trx: unknown) => Promise<unknown>) =>
          fn({ insertInto: vi.fn().mockReturnValue(chain) })
        ),
      }),
      fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
    };

    const router = createConversionsRouter(mockDb as unknown as Kysely<Database>);
    const handler = getHandler(router, 'post', '/records/:id/convert');
    const req = mockReq({
      params: { id: 'src-1' },
      body: { template_id: '00000000-0000-0000-0000-000000000002', field_overrides: { name: 'Override Name' } },
    });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: { record_id: 'tgt-1' }, error: null });
  });
});
```

- [ ] **Step 2: Run tests — expect 3 failures**

```bash
cd apps/api && pnpm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: 3 new test blocks fail with "route not found" or similar.

- [ ] **Step 3: Add GET /templates/:id to conversions.ts**

In `apps/api/src/routes/conversions.ts`, add this route **after the `GET /templates` route and before the `POST /templates` route**:

```typescript
  // Get single template with enriched field_mappings
  router.get('/templates/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const template = await db
        .selectFrom('conversion_templates')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!template) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } });
        return;
      }
      const mappings = await db
        .selectFrom('conversion_field_mappings')
        .selectAll()
        .where('template_id', '=', req.params['id']!)
        .execute();

      // Enrich with field labels from record_type_fields
      const fieldIds = [
        ...mappings.map(m => m.source_field_id),
        ...mappings.map(m => m.target_field_id),
      ].filter((id): id is string => id !== null);

      const fields = fieldIds.length > 0
        ? await db
          .selectFrom('record_type_fields')
          .select(['id', 'label', 'field_type', 'options', 'is_required'])
          .where('id', 'in', fieldIds)
          .execute()
        : [];
      const fieldMap = new Map(fields.map(f => [f.id, f]));

      const enrichedMappings = mappings.map(m => ({
        ...m,
        source_field_label: m.source_field_id ? (fieldMap.get(m.source_field_id)?.label ?? null) : null,
        target_field_label: m.target_field_id ? (fieldMap.get(m.target_field_id)?.label ?? null) : null,
        target_field_type: m.target_field_id ? (fieldMap.get(m.target_field_id)?.field_type ?? null) : null,
        target_field_options: m.target_field_id ? (fieldMap.get(m.target_field_id)?.options ?? null) : null,
        target_field_required: m.target_field_id ? (fieldMap.get(m.target_field_id)?.is_required ?? false) : false,
      }));

      res.json({ data: { ...template, field_mappings: enrichedMappings }, error: null });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 4: Replace GET /records/:id/conversions with enriched version**

Find the existing `router.get('/records/:id/conversions', ...)` handler and replace its body with:

```typescript
  router.get('/records/:id/conversions', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const record = await db
        .selectFrom('pipeline_records')
        .select(['id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!record) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record not found' } });
        return;
      }
      const conversions = await db
        .selectFrom('record_conversions')
        .selectAll()
        .where(eb => eb.or([
          eb('source_record_id', '=', req.params['id']!),
          eb('target_record_id', '=', req.params['id']!),
        ]))
        .orderBy('converted_at', 'desc')
        .execute();

      // Enrich with record names
      const allIds = [
        ...conversions.map(c => c.source_record_id),
        ...conversions.map(c => c.target_record_id),
      ].filter((id, idx, arr) => arr.indexOf(id) === idx);

      const relatedRecords = allIds.length > 0
        ? await db
          .selectFrom('pipeline_records')
          .select(['id', 'name', 'record_number'])
          .where('id', 'in', allIds)
          .execute()
        : [];
      const recordMap = new Map(relatedRecords.map(r => [r.id, r]));

      const enriched = conversions.map(c => ({
        ...c,
        source_record_name: recordMap.get(c.source_record_id)?.name ?? null,
        source_record_number: recordMap.get(c.source_record_id)?.record_number ?? null,
        target_record_name: recordMap.get(c.target_record_id)?.name ?? null,
        target_record_number: recordMap.get(c.target_record_id)?.record_number ?? null,
      }));

      res.json({ data: enriched, error: null });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 5: Extend POST /records/:id/convert to accept field_overrides**

In `apps/api/src/routes/conversions.ts`, find `router.post('/records/:id/convert', ...)`.

Replace the body schema line:
```typescript
const bodyParsed = z.object({ template_id: z.string().uuid() }).safeParse(req.body);
```
with:
```typescript
const bodyParsed = z.object({
  template_id: z.string().uuid(),
  field_overrides: z.record(z.unknown()).optional(),
}).safeParse(req.body);
```

Then find the destructure line `const { template_id } = bodyParsed.data;` and replace with:
```typescript
const { template_id, field_overrides = {} } = bodyParsed.data;
```

Then add this constant before the transaction block (after `const fieldMappingsToCopy = ...`):
```typescript
const BUILTIN_KEYS = new Set(['name', 'contact_id', 'company_id', 'owner_id']);
```

Then inside the transaction, replace the `pipeline_records` insert values with:
```typescript
          .values({
            workspace_id: workspace.id,
            record_type_id: template.target_type_id,
            pipeline_id: template.target_pipeline_id,
            stage_id: template.target_stage_id,
            record_number: record_number ?? null,
            name: (field_overrides['name'] as string | undefined) ?? (builtins['name'] as string | undefined) ?? sourceRecord.name,
            contact_id: (field_overrides['contact_id'] as string | undefined) ?? (builtins['contact_id'] as string | undefined) ?? sourceRecord.contact_id ?? null,
            company_id: (field_overrides['company_id'] as string | undefined) ?? (builtins['company_id'] as string | undefined) ?? sourceRecord.company_id ?? null,
            owner_id: (field_overrides['owner_id'] as string | undefined) ?? (builtins['owner_id'] as string | undefined) ?? sourceRecord.owner_id,
          } as never)
```

Then after the `fieldValueInserts` loop (the one building from `fieldMappingsToCopy`), add:
```typescript
        // Apply custom field_overrides (user-edited values take precedence over template mappings)
        for (const [key, val] of Object.entries(field_overrides)) {
          if (!BUILTIN_KEYS.has(key) && val !== undefined && val !== null) {
            const idx = fieldValueInserts.findIndex(i => i.field_id === key);
            const serialised = typeof val === 'string' ? val : JSON.stringify(val);
            if (idx >= 0) {
              fieldValueInserts[idx] = { record_id: created.id, field_id: key, value: serialised };
            } else {
              fieldValueInserts.push({ record_id: created.id, field_id: key, value: serialised });
            }
          }
        }
```

- [ ] **Step 6: Run tests — all should pass**

```bash
cd apps/api && pnpm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all existing tests pass + 3 new ones pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/conversions.ts apps/api/src/routes/conversions.test.ts
git commit -m "feat: enhance conversions API — GET templates/:id, enriched history, field_overrides"
```

---

## Task 2: Frontend API client

**Files:**
- Create: `apps/web/lib/conversions.ts`

- [ ] **Step 1: Create the file**

```typescript
// apps/web/lib/conversions.ts

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await res.json()) as { data: T; error: { message: string } | null };
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed');
  return json.data;
}

export interface ConversionTemplate {
  id: string;
  workspace_id: string;
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  position: number;
  created_at: string;
}

export interface EnrichedFieldMapping {
  id: string;
  template_id: string;
  source_field_id: string | null;
  source_builtin: string | null;
  target_field_id: string | null;
  target_builtin: string | null;
  source_field_label: string | null;
  target_field_label: string | null;
  target_field_type: string | null;
  target_field_options: unknown;
  target_field_required: boolean;
}

export interface ConversionTemplateWithMappings extends ConversionTemplate {
  field_mappings: EnrichedFieldMapping[];
}

export interface EnrichedConversion {
  id: string;
  source_record_id: string;
  target_record_id: string;
  template_id: string;
  converted_by: string;
  converted_at: string;
  source_record_name: string | null;
  source_record_number: string | null;
  target_record_name: string | null;
  target_record_number: string | null;
}

export interface RawFieldMapping {
  source_field_id?: string | null;
  source_builtin?: string | null;
  target_field_id?: string | null;
  target_builtin?: string | null;
}

export interface CreateTemplateBody {
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  field_mappings: RawFieldMapping[];
}

export function listTemplates(params?: { source_type_id?: string }): Promise<ConversionTemplate[]> {
  const qs = params?.source_type_id ? `?source_type_id=${encodeURIComponent(params.source_type_id)}` : '';
  return apiFetch(`/templates${qs}`);
}

export function getTemplate(id: string): Promise<ConversionTemplateWithMappings> {
  return apiFetch(`/templates/${id}`);
}

export function createTemplate(body: CreateTemplateBody): Promise<ConversionTemplate> {
  return apiFetch('/templates', { method: 'POST', body: JSON.stringify(body) });
}

export function updateTemplate(id: string, body: CreateTemplateBody): Promise<ConversionTemplate> {
  return apiFetch(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/templates/${id}`, { method: 'DELETE' });
}

export function convertRecord(
  recordId: string,
  body: { template_id: string; field_overrides?: Record<string, unknown> },
): Promise<{ record_id: string }> {
  return apiFetch(`/records/${recordId}/convert`, { method: 'POST', body: JSON.stringify(body) });
}

export function getRecordConversions(recordId: string): Promise<EnrichedConversion[]> {
  return apiFetch(`/records/${recordId}/conversions`);
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd apps/web && pnpm type-check 2>&1 | head -20
```

Expected: no errors related to `lib/conversions.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/conversions.ts
git commit -m "feat: add conversions API client"
```

---

## Task 3: Enhance ConversionModal — two-stage with prefill form

**Files:**
- Modify: `apps/web/components/pipeline/ConversionModal.tsx`

The current modal only shows a template list and immediately converts. Replace it with a two-stage modal: (1) template selection, (2) prefill form showing mapped fields with user-editable values.

- [ ] **Step 1: Replace ConversionModal.tsx entirely**

```typescript
// apps/web/components/pipeline/ConversionModal.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listTemplates,
  getTemplate,
  convertRecord,
  type ConversionTemplate,
  type ConversionTemplateWithMappings,
} from '@/lib/conversions';

interface SourceRecord {
  id: string;
  name: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  field_values: { id: string; record_id: string; field_id: string; value: unknown }[];
}

interface RecordTypeField {
  id: string;
  label: string;
  field_type: string;
  options: unknown;
  is_required: boolean;
}

interface Props {
  recordId: string;
  recordTypeId: string;
  onClose: () => void;
  onConverted: (newRecordId: string) => void;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json() as { data: T };
  if (!res.ok) throw new Error((json as unknown as { error: { message: string } }).error?.message ?? 'Failed');
  return json.data;
}

const BUILTIN_LABELS: Record<string, string> = {
  name: 'Name',
  contact_id: 'Contact',
  company_id: 'Company',
  owner_id: 'Owner',
};

const inputStyle = (invalid: boolean): React.CSSProperties => ({
  width: '100%',
  border: `1px solid ${invalid ? '#ef4444' : 'var(--border)'}`,
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'DM Sans, sans-serif',
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text3)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export function ConversionModal({ recordId, recordTypeId, onClose, onConverted }: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Stage 1: list templates
  const { data: templates = [] } = useQuery<ConversionTemplate[]>({
    queryKey: ['conversion-templates', recordTypeId],
    queryFn: () => listTemplates({ source_type_id: recordTypeId }),
  });

  // Stage 2 data — only fetched after template selection
  const { data: templateWithMappings } = useQuery<ConversionTemplateWithMappings>({
    queryKey: ['conversion-template', selectedTemplateId],
    queryFn: () => getTemplate(selectedTemplateId!),
    enabled: !!selectedTemplateId,
  });

  const { data: sourceRecord } = useQuery<SourceRecord>({
    queryKey: ['record-for-convert', recordId],
    queryFn: () => fetchJson(`/records/${recordId}`),
    enabled: !!selectedTemplateId,
  });

  const { data: targetFields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', templateWithMappings?.target_type_id],
    queryFn: () => fetchJson(`/record-types/${templateWithMappings!.target_type_id}/fields`),
    enabled: !!templateWithMappings,
  });

  // Compute pre-fills from template mappings + source record values
  const preFills = useMemo<Record<string, string>>(() => {
    if (!templateWithMappings || !sourceRecord) return {};
    const sourceValueMap = new Map(
      (sourceRecord.field_values ?? []).map(fv => [fv.field_id, String(fv.value ?? '')])
    );
    const result: Record<string, string> = {};

    for (const m of templateWithMappings.field_mappings) {
      if (m.source_builtin && m.target_builtin) {
        const val = (sourceRecord as Record<string, unknown>)[m.source_builtin];
        if (val != null) result[m.target_builtin] = String(val);
      }
      if (m.source_field_id && m.target_field_id) {
        const val = sourceValueMap.get(m.source_field_id);
        if (val !== undefined) result[m.target_field_id] = val;
      }
      if (m.source_builtin && m.target_field_id) {
        const val = (sourceRecord as Record<string, unknown>)[m.source_builtin];
        if (val != null) result[m.target_field_id] = String(val);
      }
    }
    if (!result['name']) result['name'] = sourceRecord.name;
    return result;
  }, [templateWithMappings, sourceRecord]);

  // Seed form when preFills first become available
  useEffect(() => {
    if (Object.keys(preFills).length > 0) {
      setFormValues(preFills);
    }
  }, [JSON.stringify(preFills)]); // eslint-disable-line react-hooks/exhaustive-deps

  const convert = useMutation({
    mutationFn: () =>
      convertRecord(recordId, {
        template_id: selectedTemplateId!,
        field_overrides: formValues,
      }),
    onSuccess: data => onConverted(data.record_id),
    onError: (err: Error) => setFormError(err.message),
  });

  function handleSubmit() {
    if (!formValues['name']?.trim()) {
      setFormError('Name is required');
      return;
    }
    const missingRequired = targetFields.filter(
      f => f.is_required && !formValues[f.id]?.trim()
    );
    if (missingRequired.length > 0) {
      setFormError(`Required fields missing: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }
    setFormError(null);
    convert.mutate();
  }

  // Mapped builtin target keys (excluding 'name' which is always shown)
  const mappedBuiltins = templateWithMappings
    ? templateWithMappings.field_mappings
        .filter(m => m.target_builtin && m.target_builtin !== 'name')
        .map(m => m.target_builtin!)
    : [];

  function renderFieldInput(fieldId: string, fieldType: string, options: unknown, required: boolean) {
    const val = formValues[fieldId] ?? '';
    const invalid = required && !val.trim();
    if (fieldType === 'select' && Array.isArray(options)) {
      return (
        <select
          value={val}
          onChange={e => setFormValues(v => ({ ...v, [fieldId]: e.target.value }))}
          style={{ ...inputStyle(invalid), background: '#fff', cursor: 'pointer' }}
        >
          <option value="">— select —</option>
          {(options as string[]).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    const inputType = fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text';
    return (
      <input
        type={inputType}
        value={val}
        onChange={e => setFormValues(v => ({ ...v, [fieldId]: e.target.value }))}
        style={inputStyle(invalid)}
      />
    );
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: 32,
    width: 520, maxHeight: '80vh', overflowY: 'auto',
    fontFamily: 'DM Sans, sans-serif',
  };
  const btnSecondary: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };
  const btnPrimary: React.CSSProperties = {
    background: 'var(--text, #1a1814)', color: '#fff',
    border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, fontWeight: 400, margin: '0 0 20px' }}>
          {selectedTemplateId ? 'Review & Convert' : 'Convert Record'}
        </h2>

        {!selectedTemplateId ? (
          /* ── Stage 1: Template selection ── */
          <>
            {templates.length === 0 && (
              <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24 }}>
                No conversion templates configured for this record type.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {templates.map(tpl => (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, border: '1px solid var(--border)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  {tpl.name}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
            </div>
          </>
        ) : (
          /* ── Stage 2: Prefill form ── */
          <>
            {(!templateWithMappings || !sourceRecord) ? (
              <p style={{ color: 'var(--text3)' }}>Loading…</p>
            ) : (
              <>
                {/* Name (always shown, required) */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Name *</label>
                  <input
                    value={formValues['name'] ?? ''}
                    onChange={e => setFormValues(v => ({ ...v, name: e.target.value }))}
                    style={inputStyle(!formValues['name']?.trim())}
                  />
                </div>

                {/* Mapped builtin fields (contact_id, company_id, owner_id) */}
                {mappedBuiltins.map(key => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>{BUILTIN_LABELS[key] ?? key}</label>
                    <input
                      value={formValues[key] ?? ''}
                      onChange={e => setFormValues(v => ({ ...v, [key]: e.target.value }))}
                      style={inputStyle(false)}
                    />
                  </div>
                ))}

                {/* All target type fields — pre-filled if mapped, empty otherwise; required = red border */}
                {targetFields.map(field => (
                  <div key={field.id} style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>
                      {field.label}{field.is_required ? ' *' : ''}
                    </label>
                    {renderFieldInput(field.id, field.field_type, field.options, field.is_required)}
                  </div>
                ))}

                {formError && (
                  <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginBottom: 12 }}>{formError}</p>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button onClick={() => { setSelectedTemplateId(null); setFormValues({}); setFormError(null); }} style={btnSecondary}>
                    Back
                  </button>
                  <button onClick={onClose} style={btnSecondary}>Cancel</button>
                  <button onClick={handleSubmit} disabled={convert.isPending} style={btnPrimary}>
                    {convert.isPending ? 'Converting…' : 'Convert'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm type-check 2>&1 | head -20
```

Expected: no errors in ConversionModal.tsx.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/pipeline/ConversionModal.tsx
git commit -m "feat: two-stage ConversionModal with field prefill and validation"
```

---

## Task 4: Enhance RecordDetail — names in conversion history + empty state

**Files:**
- Modify: `apps/web/components/pipeline/RecordDetail.tsx`

Two changes: (1) show real record names in conversion history instead of UUID fragments, (2) show an empty state when no templates are configured for this record type.

- [ ] **Step 1: Update RecordDetail.tsx**

Full replacement of the file:

```typescript
// apps/web/components/pipeline/RecordDetail.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConversionModal } from './ConversionModal';
import { getRecordConversions, listTemplates, type EnrichedConversion } from '@/lib/conversions';

interface PipelineRecord {
  id: string;
  name: string;
  record_number: string | null;
  record_type_id: string;
  pipeline_id: string;
  stage_id: string;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  const json = await res.json() as { data: T; error: { message: string } | null };
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

export function RecordDetail({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [showConvert, setShowConvert] = useState(false);
  const [editName, setEditName] = useState<string | null>(null);

  const { data: record } = useQuery<PipelineRecord>({
    queryKey: ['record', recordId],
    queryFn: () => apiFetch(`/records/${recordId}`),
  });

  const { data: conversions = [] } = useQuery<EnrichedConversion[]>({
    queryKey: ['record-conversions', recordId],
    queryFn: () => getRecordConversions(recordId),
    enabled: !!record,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['conversion-templates', record?.record_type_id],
    queryFn: () => listTemplates({ source_type_id: record!.record_type_id }),
    enabled: !!record,
  });

  const updateRecord = useMutation({
    mutationFn: (data: Partial<PipelineRecord>) =>
      apiFetch(`/records/${recordId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['record', recordId] }); setEditName(null); },
  });

  if (!record) return null;

  const isAdmin = true; // TODO: wire to auth context when available

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 900 }} onClick={onClose} />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
        zIndex: 950, display: 'flex', flexDirection: 'column',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {/* Header */}
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {record.record_number && (
              <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 4px', fontFamily: 'monospace' }}>
                {record.record_number}
              </p>
            )}
            {editName !== null ? (
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => updateRecord.mutate({ name: editName })}
                onKeyDown={e => {
                  if (e.key === 'Enter') updateRecord.mutate({ name: editName });
                  if (e.key === 'Escape') setEditName(null);
                }}
                autoFocus
                style={{
                  fontFamily: 'Instrument Serif, serif', fontSize: 20, fontWeight: 400,
                  border: 'none', borderBottom: '2px solid var(--text)', outline: 'none',
                  width: '100%', padding: 0, background: 'transparent',
                }}
              />
            ) : (
              <h2
                onClick={() => setEditName(record.name)}
                style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, fontWeight: 400, margin: 0, cursor: 'text' }}
              >
                {record.name}
              </h2>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 22, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Convert section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
              Conversions
            </h3>
            {templates.length > 0 ? (
              <button
                onClick={() => setShowConvert(true)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
                }}
              >
                Convert…
              </button>
            ) : (
              <p style={{ color: 'var(--text3)', fontSize: 13, margin: 0 }}>
                No conversions configured.
                {isAdmin && (
                  <>
                    {' '}
                    <a href="/settings/conversions" style={{ color: 'var(--text2)', textDecoration: 'underline', fontSize: 13 }}>
                      Set up in Settings
                    </a>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Conversion history */}
          {conversions.length > 0 && (
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                Conversion History
              </h3>
              {conversions.map(conv => {
                const isSource = conv.source_record_id === recordId;
                const otherName = isSource
                  ? (conv.target_record_name ?? conv.target_record_id.slice(0, 8) + '…')
                  : (conv.source_record_name ?? conv.source_record_id.slice(0, 8) + '…');
                const otherNumber = isSource ? conv.target_record_number : conv.source_record_number;
                return (
                  <div key={conv.id} style={{ fontSize: 13, color: 'var(--text2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    {isSource ? '→' : '←'}{' '}
                    {otherNumber && (
                      <code style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', marginRight: 6 }}>
                        {otherNumber}
                      </code>
                    )}
                    {otherName}
                    <span style={{ color: 'var(--text3)', marginLeft: 8, fontSize: 11 }}>
                      {new Date(conv.converted_at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showConvert && (
        <ConversionModal
          recordId={recordId}
          recordTypeId={record.record_type_id}
          onClose={() => setShowConvert(false)}
          onConverted={newId => {
            setShowConvert(false);
            void qc.invalidateQueries({ queryKey: ['record-conversions', recordId] });
            void qc.invalidateQueries({ queryKey: ['records'] });
            alert(`Converted! New record ID: ${newId}`);
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm type-check 2>&1 | head -20
```

Expected: no errors in RecordDetail.tsx.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/pipeline/RecordDetail.tsx
git commit -m "feat: show record names in conversion history, add empty state"
```

---

## Task 5: TemplateFieldMapper component

**Files:**
- Create: `apps/web/components/pipeline/TemplateFieldMapper.tsx`

Click-to-link field mapper. Left column: source fields. Right column: target fields. Clicking a source then a target creates a mapping pair. Existing pairs shown at the bottom with × to unlink.

- [ ] **Step 1: Create TemplateFieldMapper.tsx**

```typescript
// apps/web/components/pipeline/TemplateFieldMapper.tsx
'use client';

import { useState } from 'react';
import type { RawFieldMapping } from '@/lib/conversions';

export interface MappableField {
  id: string;
  label: string;
  isBuiltin?: boolean;
}

interface Props {
  sourceFields: MappableField[];
  targetFields: MappableField[];
  mappings: RawFieldMapping[];
  onChange: (mappings: RawFieldMapping[]) => void;
}

const SOURCE_BUILTINS: MappableField[] = [
  { id: '__name', label: 'Name', isBuiltin: true },
  { id: '__contact_id', label: 'Contact', isBuiltin: true },
  { id: '__company_id', label: 'Company', isBuiltin: true },
  { id: '__owner_id', label: 'Owner', isBuiltin: true },
];

const TARGET_BUILTINS: MappableField[] = [
  { id: '__name', label: 'Name', isBuiltin: true },
  { id: '__contact_id', label: 'Contact', isBuiltin: true },
  { id: '__company_id', label: 'Company', isBuiltin: true },
  { id: '__owner_id', label: 'Owner', isBuiltin: true },
];

function fieldKey(f: MappableField): string {
  return f.isBuiltin ? `builtin:${f.id.replace('__', '')}` : `field:${f.id}`;
}

function mappingKey(m: RawFieldMapping): string {
  const src = m.source_builtin ? `builtin:${m.source_builtin}` : `field:${m.source_field_id}`;
  const tgt = m.target_builtin ? `builtin:${m.target_builtin}` : `field:${m.target_field_id}`;
  return `${src}→${tgt}`;
}

function isMapped(m: RawFieldMapping, field: MappableField, side: 'source' | 'target'): boolean {
  if (side === 'source') {
    if (field.isBuiltin) return m.source_builtin === field.id.replace('__', '');
    return m.source_field_id === field.id;
  }
  if (field.isBuiltin) return m.target_builtin === field.id.replace('__', '');
  return m.target_field_id === field.id;
}

export function TemplateFieldMapper({ sourceFields, targetFields, mappings, onChange }: Props) {
  const [pendingSourceKey, setPendingSourceKey] = useState<string | null>(null);

  const allSources = [...SOURCE_BUILTINS, ...sourceFields];
  const allTargets = [...TARGET_BUILTINS, ...targetFields];

  function handleSourceClick(field: MappableField) {
    const key = fieldKey(field);
    setPendingSourceKey(prev => (prev === key ? null : key));
  }

  function handleTargetClick(targetField: MappableField) {
    if (!pendingSourceKey) return;

    const sourceField = allSources.find(f => fieldKey(f) === pendingSourceKey);
    if (!sourceField) return;

    const newMapping: RawFieldMapping = {
      source_field_id: sourceField.isBuiltin ? null : sourceField.id,
      source_builtin: sourceField.isBuiltin ? sourceField.id.replace('__', '') : null,
      target_field_id: targetField.isBuiltin ? null : targetField.id,
      target_builtin: targetField.isBuiltin ? targetField.id.replace('__', '') : null,
    };

    // Prevent duplicate target mappings (each target can only be mapped once)
    const filtered = mappings.filter(m => !isMapped(m, targetField, 'target'));
    onChange([...filtered, newMapping]);
    setPendingSourceKey(null);
  }

  function removeMapping(idx: number) {
    onChange(mappings.filter((_, i) => i !== idx));
  }

  function fieldLabel(m: RawFieldMapping, side: 'source' | 'target'): string {
    if (side === 'source') {
      if (m.source_builtin) {
        return SOURCE_BUILTINS.find(f => f.id === `__${m.source_builtin}`)?.label ?? m.source_builtin;
      }
      return sourceFields.find(f => f.id === m.source_field_id)?.label ?? (m.source_field_id ?? '');
    }
    if (m.target_builtin) {
      return TARGET_BUILTINS.find(f => f.id === `__${m.target_builtin}`)?.label ?? m.target_builtin;
    }
    return targetFields.find(f => f.id === m.target_field_id)?.label ?? (m.target_field_id ?? '');
  }

  const colStyle: React.CSSProperties = {
    flex: 1, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
  };
  const cellStyle = (active: boolean, mapped: boolean): React.CSSProperties => ({
    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    background: active ? 'var(--blue-bg, #dbeafe)' : mapped ? 'var(--surface2)' : 'transparent',
    color: active ? 'var(--blue, #1e3a8a)' : 'var(--text)',
    userSelect: 'none',
  });

  return (
    <div>
      {pendingSourceKey && (
        <p style={{ fontSize: 12, color: 'var(--blue, #1e3a8a)', marginBottom: 8 }}>
          Select a target field to map to ↓
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {/* Source fields */}
        <div style={colStyle}>
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            Source Fields
          </div>
          {allSources.map(f => {
            const key = fieldKey(f);
            const active = pendingSourceKey === key;
            const mapped = mappings.some(m => isMapped(m, f, 'source'));
            return (
              <div
                key={key}
                onClick={() => handleSourceClick(f)}
                style={cellStyle(active, mapped)}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = active ? 'var(--blue-bg, #dbeafe)' : mapped ? 'var(--surface2)' : 'transparent'; }}
              >
                {f.isBuiltin && <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 4 }}>built-in</span>}
                {f.label}
              </div>
            );
          })}
        </div>

        {/* Target fields */}
        <div style={colStyle}>
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            Target Fields
          </div>
          {allTargets.map(f => {
            const key = fieldKey(f);
            const mapped = mappings.some(m => isMapped(m, f, 'target'));
            return (
              <div
                key={key}
                onClick={() => pendingSourceKey && handleTargetClick(f)}
                style={{
                  ...cellStyle(false, mapped),
                  cursor: pendingSourceKey ? 'pointer' : 'default',
                  opacity: pendingSourceKey && mapped ? 0.5 : 1,
                }}
              >
                {f.isBuiltin && <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 4 }}>built-in</span>}
                {f.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mapping pairs */}
      {mappings.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Mapped pairs
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mappings.map((m, i) => (
              <div key={mappingKey(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}>
                <span style={{ flex: 1 }}>{fieldLabel(m, 'source')}</span>
                <span style={{ color: 'var(--text3)' }}>→</span>
                <span style={{ flex: 1 }}>{fieldLabel(m, 'target')}</span>
                <button
                  onClick={() => removeMapping(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mappings.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
          Click a source field, then a target field to create a mapping.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/pipeline/TemplateFieldMapper.tsx
git commit -m "feat: add TemplateFieldMapper component"
```

---

## Task 6: Settings Conversions page + nav

**Files:**
- Create: `apps/web/app/(dashboard)/settings/conversions/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`

- [ ] **Step 1: Add Conversions tab to settings layout**

In `apps/web/app/(dashboard)/settings/layout.tsx`:

Add `{ href: '/settings/conversions', label: 'Conversions', adminOnly: true }` to `ALL_TABS` after the `record-types` entry:

```typescript
const ALL_TABS: Tab[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/mail', label: 'Mail' },
  { href: '/settings/pipelines', label: 'Pipelines', adminOnly: true },
  { href: '/settings/record-types', label: 'Record Types', adminOnly: true },
  { href: '/settings/conversions', label: 'Conversions', adminOnly: true },
  { href: '/settings/ssh', label: 'SSH Keys', adminOnly: true },
  { href: '/settings/api-keys', label: 'API Keys', adminOnly: true },
];
```

Also extend the redirect guard in the `useEffect` to include `/settings/conversions`:

```typescript
  useEffect(() => {
    if (!isLoading && !isAdmin && (
      pathname.startsWith('/settings/pipelines') ||
      pathname.startsWith('/settings/record-types') ||
      pathname.startsWith('/settings/conversions') ||
      pathname.startsWith('/settings/ssh') ||
      pathname.startsWith('/settings/api-keys')
    )) {
      router.push('/settings/profile');
    }
  }, [isAdmin, isLoading, pathname, router]);
```

- [ ] **Step 2: Create the conversions settings page**

Create `apps/web/app/(dashboard)/settings/conversions/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type ConversionTemplate,
  type ConversionTemplateWithMappings,
  type RawFieldMapping,
} from '@/lib/conversions';
import { TemplateFieldMapper, type MappableField } from '@/components/pipeline/TemplateFieldMapper';

interface RecordType {
  id: string;
  name: string;
  icon: string;
}

interface RecordTypeField {
  id: string;
  label: string;
  field_type: string;
}

interface PipelineStage { id: string; name: string; }
interface Pipeline { id: string; name: string; record_type_id: string | null; stages?: PipelineStage[]; }

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json() as { data: T };
  return json.data;
}

type Step = 'list' | 'step1' | 'step2' | 'step3';

interface DraftTemplate {
  id?: string; // present when editing
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  field_mappings: RawFieldMapping[];
}

const EMPTY_DRAFT: DraftTemplate = {
  name: '',
  source_type_id: '',
  target_type_id: '',
  target_pipeline_id: '',
  target_stage_id: '',
  field_mappings: [],
};

export default function ConversionsSettingsPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('list');
  const [draft, setDraft] = useState<DraftTemplate>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<ConversionTemplate[]>({
    queryKey: ['conversion-templates'],
    queryFn: () => listTemplates(),
  });

  const { data: recordTypes = [] } = useQuery<RecordType[]>({
    queryKey: ['record-types'],
    queryFn: () => fetchJson('/record-types'),
  });

  // Use a distinct queryKey to avoid cache-shape collision with the pipeline page
  // (which stores { data: Pipeline[] } via listPipelines, not Pipeline[]).
  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['conversions-pipelines'],
    queryFn: () => fetchJson<Pipeline[]>('/pipelines'),
  });

  // Fetch fields for source and target types when on step 3
  const { data: sourceFields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', draft.source_type_id],
    queryFn: () => fetchJson(`/record-types/${draft.source_type_id}/fields`),
    enabled: !!draft.source_type_id && step === 'step3',
  });

  const { data: targetFields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', draft.target_type_id],
    queryFn: () => fetchJson(`/record-types/${draft.target_type_id}/fields`),
    enabled: !!draft.target_type_id && step === 'step3',
  });

  const targetPipelines = pipelines.filter(p => p.record_type_id === draft.target_type_id);

  const selectedPipeline = pipelines.find(p => p.id === draft.target_pipeline_id);

  // For stage list, fetch pipeline with stages when pipeline is selected
  const { data: pipelineWithStages } = useQuery<{ stages: PipelineStage[] }>({
    queryKey: ['pipeline', draft.target_pipeline_id],
    queryFn: () => fetchJson(`/pipelines/${draft.target_pipeline_id}`),
    enabled: !!draft.target_pipeline_id,
  });
  const targetStages = pipelineWithStages?.stages ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: draft.name,
        source_type_id: draft.source_type_id,
        target_type_id: draft.target_type_id,
        target_pipeline_id: draft.target_pipeline_id,
        target_stage_id: draft.target_stage_id,
        field_mappings: draft.field_mappings,
      };
      if (draft.id) {
        return updateTemplate(draft.id, body);
      }
      return createTemplate(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversion-templates'] });
      setStep('list');
      setDraft(EMPTY_DRAFT);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversion-templates'] }),
  });

  async function startEdit(tpl: ConversionTemplate) {
    const full = await getTemplate(tpl.id).catch(() => null);
    setDraft({
      id: tpl.id,
      name: tpl.name,
      source_type_id: tpl.source_type_id,
      target_type_id: tpl.target_type_id,
      target_pipeline_id: tpl.target_pipeline_id,
      target_stage_id: tpl.target_stage_id,
      field_mappings: (full?.field_mappings ?? []).map(m => ({
        source_field_id: m.source_field_id,
        source_builtin: m.source_builtin,
        target_field_id: m.target_field_id,
        target_builtin: m.target_builtin,
      })),
    });
    setStep('step1');
  }

  function typeName(id: string) {
    return recordTypes.find(rt => rt.id === id)?.name ?? id;
  }
  function pipelineName(id: string) {
    return pipelines.find(p => p.id === id)?.name ?? id;
  }
  function stageName(id: string) {
    return targetStages.find(s => s.id === id)?.name ?? id;
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 6,
    padding: '8px 10px', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box', background: '#fff',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text3)',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const btnPrimary: React.CSSProperties = {
    background: 'var(--text, #1a1814)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };
  const btnSecondary: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };

  if (step === 'list') {
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, fontWeight: 400, margin: 0 }}>Conversion Templates</h2>
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
              Define how records convert between types (e.g. Enquiry → Quote).
            </p>
          </div>
          <button onClick={() => { setDraft(EMPTY_DRAFT); setStep('step1'); }} style={btnPrimary}>
            + New Template
          </button>
        </div>

        {templates.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            No templates yet. Create one to enable record conversion.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(tpl => (
            <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{tpl.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                  {typeName(tpl.source_type_id)} → {typeName(tpl.target_type_id)}
                  {' · '}{pipelineName(tpl.target_pipeline_id)}
                </p>
              </div>
              <button onClick={() => void startEdit(tpl)} style={btnSecondary}>Edit</button>
              <button
                onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(tpl.id); }}
                style={{ ...btnSecondary, color: 'var(--red, #991b1b)', borderColor: 'var(--red, #991b1b)' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'step1') {
    // Step 1: Name + source/target type selection
    return (
      <div style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, fontWeight: 400, margin: '0 0 4px' }}>
          {draft.id ? 'Edit Template' : 'New Template'} — Step 1 of 3
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>Choose source and target record types.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Template Name</label>
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Enquiry → Quote"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Source Record Type</label>
          <select value={draft.source_type_id} onChange={e => setDraft(d => ({ ...d, source_type_id: e.target.value }))} style={inputStyle}>
            <option value="">— select —</option>
            {recordTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Target Record Type</label>
          <select value={draft.target_type_id} onChange={e => setDraft(d => ({ ...d, target_type_id: e.target.value, target_pipeline_id: '', target_stage_id: '' }))} style={inputStyle}>
            <option value="">— select —</option>
            {recordTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setStep('list'); setDraft(EMPTY_DRAFT); }} style={btnSecondary}>Cancel</button>
          <button
            onClick={() => {
              if (!draft.name.trim() || !draft.source_type_id || !draft.target_type_id) {
                setError('Please fill in all fields');
                return;
              }
              setError(null);
              setStep('step2');
            }}
            style={btnPrimary}
          >
            Next →
          </button>
        </div>
        {error && <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  if (step === 'step2') {
    // Step 2: Target pipeline + stage
    return (
      <div style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, fontWeight: 400, margin: '0 0 4px' }}>
          {draft.name} — Step 2 of 3
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
          Choose where converted records land.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Target Pipeline</label>
          <select
            value={draft.target_pipeline_id}
            onChange={e => setDraft(d => ({ ...d, target_pipeline_id: e.target.value, target_stage_id: '' }))}
            style={inputStyle}
          >
            <option value="">— select —</option>
            {targetPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {targetPipelines.length === 0 && draft.target_type_id && (
            <p style={{ fontSize: 12, color: 'var(--amber, #92400e)', marginTop: 4 }}>
              No pipelines linked to this record type. Link one in Settings → Pipelines.
            </p>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Target Stage</label>
          <select
            value={draft.target_stage_id}
            onChange={e => setDraft(d => ({ ...d, target_stage_id: e.target.value }))}
            style={inputStyle}
            disabled={!draft.target_pipeline_id}
          >
            <option value="">— select —</option>
            {targetStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setStep('step1')} style={btnSecondary}>← Back</button>
          <button
            onClick={() => {
              if (!draft.target_pipeline_id || !draft.target_stage_id) {
                setError('Select a pipeline and stage');
                return;
              }
              setError(null);
              setStep('step3');
            }}
            style={btnPrimary}
          >
            Next →
          </button>
        </div>
        {error && <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  // Step 3: Field mapping
  const sourceMappable: MappableField[] = sourceFields.map(f => ({ id: f.id, label: f.label }));
  const targetMappable: MappableField[] = targetFields.map(f => ({ id: f.id, label: f.label }));

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, fontWeight: 400, margin: '0 0 4px' }}>
        {draft.name} — Step 3 of 3
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
        Map fields from source to target (optional). Built-in fields include name, contact, company, owner.
      </p>

      <TemplateFieldMapper
        sourceFields={sourceMappable}
        targetFields={targetMappable}
        mappings={draft.field_mappings}
        onChange={mappings => setDraft(d => ({ ...d, field_mappings: mappings }))}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button onClick={() => setStep('step2')} style={btnSecondary}>← Back</button>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={btnPrimary}>
          {saveMutation.isPending ? 'Saving…' : draft.id ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm type-check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/conversions/page.tsx" "apps/web/app/(dashboard)/settings/layout.tsx"
git commit -m "feat: Settings Conversions page — template management with field mapper"
```

---

## Final verification

- [ ] Run API tests

```bash
cd apps/api && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] Full type-check

```bash
cd apps/web && pnpm type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] Manual smoke test
  1. Navigate to Settings → Conversions
  2. Create a template: source = Enquiry, target = Quote, pick pipeline + stage, add a field mapping
  3. Navigate to a pipeline with Enquiry records
  4. Click a record row → drawer opens
  5. Click "Convert…" → template list appears
  6. Select the template → prefill form appears with mapped values
  7. Submit → new record created
  8. Drawer shows "→ [Quote name]" in conversion history
