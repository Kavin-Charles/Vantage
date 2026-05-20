# Pipeline Views (Table + List) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Table and List view modes to the pipeline engine — each pipeline has a configured view (kanban/table/list) set by an admin in pipeline settings, and the pipeline page renders the correct component.

**Architecture:** Two new columns (`view`, `table_columns`) on the `pipelines` table drive view selection; the `[typeSlug]/page.tsx` route reads `pipeline.view` and renders `RecordKanban`, `RecordTable`, or `RecordList` accordingly. The settings page gains a `ViewSettings` component for admins to pick view and configure table columns.

**Tech Stack:** Kysely migrations, Zod, Express, React/Next.js 14 App Router, TanStack Query, Vitest

---

## File Map

| Action | File |
|---|---|
| **Create** | `packages/db/migrations/20260520_001_pipeline_views.ts` |
| **Modify** | `packages/db/src/schema.ts` line 218–227 — add `view`, `table_columns` to `PipelineTable` |
| **Modify** | `apps/api/src/routes/pipelines.ts` line 13–16 — extend `updatePipelineSchema` |
| **Create** | `apps/api/src/routes/pipelines.views.test.ts` |
| **Modify** | `packages/types/src/index.ts` line 89–96 — add `view`, `table_columns` to `Pipeline` |
| **Modify** | `apps/web/lib/pipelines.ts` line 21–27 — extend `updatePipeline` body type |
| **Create** | `apps/web/components/pipeline/RecordTable.tsx` |
| **Create** | `apps/web/components/pipeline/RecordList.tsx` |
| **Modify** | `apps/web/app/(dashboard)/pipeline/[typeSlug]/page.tsx` — view dispatch |
| **Modify** | `apps/web/app/(dashboard)/settings/pipelines/page.tsx` — `ViewSettings` component |

---

### Task 1: DB Migration + Schema Types

**Files:**
- Create: `packages/db/migrations/20260520_001_pipeline_views.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write the migration file**

```typescript
// packages/db/migrations/20260520_001_pipeline_views.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS view varchar(20) NOT NULL DEFAULT 'kanban'`.execute(db);
  await sql`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS table_columns jsonb`.execute(db);
  await sql`ALTER TABLE pipelines ADD CONSTRAINT pipelines_view_check CHECK (view IN ('kanban','table','list'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE pipelines DROP CONSTRAINT IF EXISTS pipelines_view_check`.execute(db);
  await sql`ALTER TABLE pipelines DROP COLUMN IF EXISTS table_columns`.execute(db);
  await sql`ALTER TABLE pipelines DROP COLUMN IF EXISTS view`.execute(db);
}
```

- [ ] **Step 2: Update `PipelineTable` in `packages/db/src/schema.ts`**

Find the `PipelineTable` interface (line 218) and add two fields:

```typescript
export interface PipelineTable {
  id: Generated<string>;
  workspace_id: string;
  record_type_id: string | null;
  name: string;
  is_default: Generated<boolean>;
  position: Generated<number>;
  view: Generated<string>;          // 'kanban' | 'table' | 'list'
  table_columns: string[] | null;   // jsonb, null = use default columns
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/20260520_001_pipeline_views.ts packages/db/src/schema.ts
git commit -m "feat: add view and table_columns columns to pipelines"
```

---

### Task 2: API — Extend Pipelines Route + Tests

**Files:**
- Modify: `apps/api/src/routes/pipelines.ts`
- Create: `apps/api/src/routes/pipelines.views.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `apps/api/src/routes/pipelines.views.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createPipelinesRouter } from './pipelines';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

function buildMockDb(single?: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['selectFrom','insertInto','updateTable','values','set','where','select','selectAll',
    'returning','returningAll','execute','executeTakeFirst','executeTakeFirstOrThrow','orderBy','limit','offset','groupBy'];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue([]);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(single);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(single ?? { id: 'p-1' });
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    fn: { count: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('stage_count') }) },
  };
}

function mockReq(overrides = {}) {
  return {
    workspace: { id: 'ws-1' }, user: { id: 'user-1', role: 'admin' },
    body: {}, params: {}, query: {},
    ...overrides,
  } as unknown as import('express').Request;
}

function mockRes() {
  const res = { json: vi.fn(), status: vi.fn() } as unknown as import('express').Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function getHandler(router: ReturnType<typeof createPipelinesRouter>, method: string, path: string) {
  const stack = (router as unknown as {
    stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[]
  }).stack;
  const layer = stack.find(s => s.route?.path === path && s.route?.methods[method]);
  return layer!.route.stack[layer!.route.stack.length - 1]!.handle;
}

describe('PATCH /api/pipelines/:id — view + table_columns', () => {
  it('accepts view=table and returns updated pipeline', async () => {
    const pipeline = { id: 'p-1', workspace_id: 'ws-1', name: 'Test', view: 'table', table_columns: ['name', 'stage'] };
    const db = buildMockDb(pipeline);
    const router = createPipelinesRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'patch', '/:id');
    const req = mockReq({ params: { id: 'p-1' }, body: { view: 'table', table_columns: ['name', 'stage'] } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: pipeline, error: null });
  });

  it('rejects invalid view value — calls next with ZodError', async () => {
    const db = buildMockDb({ id: 'p-1' });
    const router = createPipelinesRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'patch', '/:id');
    const req = mockReq({ params: { id: 'p-1' }, body: { view: 'calendar' } });
    const res = mockRes();
    const next = vi.fn();
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('accepts null table_columns to clear column config', async () => {
    const pipeline = { id: 'p-1', workspace_id: 'ws-1', name: 'Test', view: 'kanban', table_columns: null };
    const db = buildMockDb(pipeline);
    const router = createPipelinesRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'patch', '/:id');
    const req = mockReq({ params: { id: 'p-1' }, body: { table_columns: null } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: pipeline, error: null });
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd apps/api && npm test -- pipelines.views
```

Expected: FAIL — "Cannot find module" or type errors (route not updated yet).

- [ ] **Step 3: Extend `updatePipelineSchema` in `apps/api/src/routes/pipelines.ts`**

Find `updatePipelineSchema` (around line 13–16) and replace it:

```typescript
const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
  view: z.enum(['kanban', 'table', 'list']).optional(),
  table_columns: z.array(z.string()).nullable().optional(),
});
```

No other changes needed — the PATCH handler already does `set({ ...parsed, updated_at: new Date() })` which forwards all parsed fields to Kysely.

- [ ] **Step 4: Run test — confirm it passes**

```bash
cd apps/api && npm test -- pipelines.views
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/pipelines.ts apps/api/src/routes/pipelines.views.test.ts
git commit -m "feat: accept view and table_columns in pipeline PATCH"
```

---

### Task 3: Types + Frontend Client

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/web/lib/pipelines.ts`

- [ ] **Step 1: Add `view` and `table_columns` to the `Pipeline` interface**

Open `packages/types/src/index.ts`. Find the `Pipeline` interface (line 89) and replace it:

```typescript
export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  view: string;                    // 'kanban' | 'table' | 'list'
  table_columns: string[] | null;  // null = use default set
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Extend `updatePipeline` body type in `apps/web/lib/pipelines.ts`**

Find `updatePipeline` (line 21) and replace its signature:

```typescript
export async function updatePipeline(
  token: string,
  id: string,
  body: { name?: string; is_default?: boolean; view?: string; table_columns?: string[] | null },
) {
  return apiFetch<{ data: Pipeline }>(`/api/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts apps/web/lib/pipelines.ts
git commit -m "feat: add view and table_columns to Pipeline type and client"
```

---

### Task 4: RecordTable Component

**Files:**
- Create: `apps/web/components/pipeline/RecordTable.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/components/pipeline/RecordTable.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordDetail } from './RecordDetail';

interface PipelineRecord {
  id: string;
  name: string;
  record_number: string | null;
  stage_id: string;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
  created_at: string;
}

interface Stage { id: string; name: string; color: string | null; is_won: boolean; is_lost: boolean; }
interface PipelineWithStages { id: string; stages: Stage[]; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

const DEFAULT_COLUMNS = ['record_number', 'name', 'stage', 'owner_id', 'created_at'];

const COLUMN_LABELS: Record<string, string> = {
  record_number: 'Record #',
  name: 'Name',
  stage: 'Stage',
  owner_id: 'Owner',
  contact_id: 'Contact',
  company_id: 'Company',
  created_at: 'Created',
};

function stageColor(stage: Stage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

export function RecordTable({
  recordTypeId,
  pipelineId,
  columns = DEFAULT_COLUMNS,
}: {
  recordTypeId: string;
  pipelineId: string;
  columns?: string[];
}) {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'created_at', dir: 'desc' });

  const { data: pipelineData } = useQuery<PipelineWithStages>({
    queryKey: ['pipeline', pipelineId],
    queryFn: () => apiFetch(`/pipelines/${pipelineId}`),
  });

  const { data: records = [], isError } = useQuery<PipelineRecord[]>({
    queryKey: ['records', pipelineId, recordTypeId],
    queryFn: () => apiFetch(`/records?pipeline_id=${pipelineId}&record_type_id=${recordTypeId}`),
  });

  const stageMap = new Map((pipelineData?.stages ?? []).map(s => [s.id, s]));

  const sorted = [...records].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.col === 'stage') {
      const sa = stageMap.get(a.stage_id)?.name ?? '';
      const sb = stageMap.get(b.stage_id)?.name ?? '';
      return sa.localeCompare(sb) * dir;
    }
    const va = String((a as Record<string, unknown>)[sort.col] ?? '');
    const vb = String((b as Record<string, unknown>)[sort.col] ?? '');
    return va.localeCompare(vb) * dir;
  });

  function toggleSort(col: string) {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    );
  }

  function renderCell(record: PipelineRecord, col: string): React.ReactNode {
    switch (col) {
      case 'record_number':
        return record.record_number
          ? <code style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{record.record_number}</code>
          : <span style={{ color: 'var(--text3)' }}>—</span>;
      case 'name':
        return <span style={{ fontWeight: 500 }}>{record.name}</span>;
      case 'stage': {
        const stage = stageMap.get(record.stage_id);
        if (!stage) return <span style={{ color: 'var(--text3)' }}>—</span>;
        const color = stageColor(stage);
        return (
          <span style={{ background: `${color}1a`, color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
            {stage.name}
          </span>
        );
      }
      case 'owner_id':
        return (
          <span style={{ background: 'var(--surface2)', borderRadius: '50%', width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>
            {record.owner_id[0]?.toUpperCase()}
          </span>
        );
      case 'contact_id':
        return record.contact_id
          ? <span style={{ fontSize: 12, color: 'var(--text2)' }}>{record.contact_id.slice(0, 8)}…</span>
          : <span style={{ color: 'var(--text3)' }}>—</span>;
      case 'company_id':
        return record.company_id
          ? <span style={{ fontSize: 12, color: 'var(--text2)' }}>{record.company_id.slice(0, 8)}…</span>
          : <span style={{ color: 'var(--text3)' }}>—</span>;
      case 'created_at':
        return <span style={{ fontSize: 12, color: 'var(--text2)' }}>{relDate(record.created_at)}</span>;
      default:
        return <span style={{ color: 'var(--text3)' }}>—</span>;
    }
  }

  if (isError) {
    return (
      <div style={{ padding: '10px 14px', background: 'var(--amber-bg, #fef3c7)', color: 'var(--amber, #92400e)', borderRadius: 8, fontSize: 13 }}>
        Failed to load records.
      </div>
    );
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                  }}
                >
                  {COLUMN_LABELS[col] ?? col}
                  {sort.col === col && <span style={{ marginLeft: 4 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(record => (
              <tr
                key={record.id}
                onClick={() => setSelectedRecordId(record.id)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
              >
                {columns.map(col => (
                  <td key={col} style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {renderCell(record, col)}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text3)' }}>
                  No records
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedRecordId && (
        <RecordDetail recordId={selectedRecordId} onClose={() => setSelectedRecordId(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/pipeline/RecordTable.tsx
git commit -m "feat: add RecordTable component for table view"
```

---

### Task 5: RecordList Component

**Files:**
- Create: `apps/web/components/pipeline/RecordList.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/components/pipeline/RecordList.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordDetail } from './RecordDetail';

interface PipelineRecord {
  id: string;
  name: string;
  record_number: string | null;
  stage_id: string;
  owner_id: string;
  created_at: string;
}

interface Stage { id: string; name: string; color: string | null; is_won: boolean; is_lost: boolean; }
interface PipelineWithStages { id: string; stages: Stage[]; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

function stageColor(stage: Stage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

export function RecordList({
  recordTypeId,
  pipelineId,
}: {
  recordTypeId: string;
  pipelineId: string;
}) {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const { data: pipelineData } = useQuery<PipelineWithStages>({
    queryKey: ['pipeline', pipelineId],
    queryFn: () => apiFetch(`/pipelines/${pipelineId}`),
  });

  const { data: records = [], isError } = useQuery<PipelineRecord[]>({
    queryKey: ['records', pipelineId, recordTypeId],
    queryFn: () => apiFetch(`/records?pipeline_id=${pipelineId}&record_type_id=${recordTypeId}`),
  });

  const stageMap = new Map((pipelineData?.stages ?? []).map(s => [s.id, s]));

  // Sort created_at desc (API already returns desc; sort defensively)
  const sorted = [...records].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (isError) {
    return (
      <div style={{ padding: '10px 14px', background: 'var(--amber-bg, #fef3c7)', color: 'var(--amber, #92400e)', borderRadius: 8, fontSize: 13 }}>
        Failed to load records.
      </div>
    );
  }

  return (
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
        {sorted.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No records
          </div>
        )}
        {sorted.map(record => {
          const stage = stageMap.get(record.stage_id);
          const color = stage ? stageColor(stage) : '#6366f1';
          return (
            <div
              key={record.id}
              onClick={() => setSelectedRecordId(record.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
            >
              {record.record_number && (
                <code style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', minWidth: 60, flexShrink: 0 }}>
                  {record.record_number}
                </code>
              )}
              <span style={{ flex: 1, fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>
                {record.name}
              </span>
              {stage && (
                <span style={{ background: `${color}1a`, color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {stage.name}
                </span>
              )}
              <span style={{
                background: 'var(--surface2)', borderRadius: '50%', width: 24, height: 24,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
              }}>
                {record.owner_id[0]?.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 70, textAlign: 'right', flexShrink: 0 }}>
                {relDate(record.created_at)}
              </span>
            </div>
          );
        })}
      </div>
      {selectedRecordId && (
        <RecordDetail recordId={selectedRecordId} onClose={() => setSelectedRecordId(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/pipeline/RecordList.tsx
git commit -m "feat: add RecordList component for list view"
```

---

### Task 6: Pipeline Page — View Dispatch

**Files:**
- Modify: `apps/web/app/(dashboard)/pipeline/[typeSlug]/page.tsx`

The current file renders only `<RecordKanban>`. Replace it to dispatch based on `pipeline.view`.

- [ ] **Step 1: Rewrite the page**

Full replacement of `apps/web/app/(dashboard)/pipeline/[typeSlug]/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { RecordKanban } from '@/components/pipeline/RecordKanban';
import { RecordTable } from '@/components/pipeline/RecordTable';
import { RecordList } from '@/components/pipeline/RecordList';

interface RecordType { id: string; name: string; icon: string; color: string; }
interface Pipeline {
  id: string;
  name: string;
  record_type_id: string | null;
  view: string | null;
  table_columns: string[] | null;
}

const DEFAULT_TABLE_COLUMNS = ['record_number', 'name', 'stage', 'owner_id', 'created_at'];

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

export default function RecordTypePipelinePage() {
  const { typeSlug } = useParams<{ typeSlug: string }>();
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  const { data: types = [] } = useQuery<RecordType[]>({
    queryKey: ['record-types'],
    queryFn: () => apiFetch('/record-types'),
  });

  const activeType = types.find(t =>
    t.id === typeSlug || t.name.toLowerCase().replace(/\s+/g, '-') === typeSlug
  );

  const { data: allPipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: () => apiFetch('/pipelines'),
    enabled: !!activeType,
  });

  const pipelines = allPipelines.filter(p => p.record_type_id === activeType?.id);
  const pipeline = pipelines.find(p => p.id === (activePipelineId ?? pipelines[0]?.id));

  if (!activeType) {
    return (
      <>
        <Topbar />
        <div style={{ padding: 32, color: 'var(--text3)', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
          Record type not found.
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>{activeType.icon}</span>
            <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--text)' }}>
              {activeType.name}
            </span>
            {pipelines.length > 1 && (
              <select
                value={pipeline?.id ?? ''}
                onChange={e => setActivePipelineId(e.target.value)}
                style={{
                  border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px',
                  fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  background: 'var(--surface)', color: 'var(--text)',
                }}
              >
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
        }
      />
      <div style={{ padding: 24 }}>
        {!pipeline ? (
          <p style={{ color: 'var(--text3)', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
            No pipeline found for this record type.
          </p>
        ) : pipeline.view === 'table' ? (
          <RecordTable
            recordTypeId={activeType.id}
            pipelineId={pipeline.id}
            columns={pipeline.table_columns ?? DEFAULT_TABLE_COLUMNS}
          />
        ) : pipeline.view === 'list' ? (
          <RecordList recordTypeId={activeType.id} pipelineId={pipeline.id} />
        ) : (
          <RecordKanban recordTypeId={activeType.id} pipelineId={pipeline.id} />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(dashboard)/pipeline/[typeSlug]/page.tsx
git commit -m "feat: dispatch table/list/kanban view based on pipeline.view"
```

---

### Task 7: Settings UI — View + Column Controls

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/pipelines/page.tsx`

Add a `ViewSettings` component and render it above `PipelineEditor` in the active pipeline panel.

- [ ] **Step 1: Add imports at the top of the settings page**

Open `apps/web/app/(dashboard)/settings/pipelines/page.tsx`. Find the existing imports block and add:

```typescript
import { updatePipeline } from '@/lib/pipelines';
```

(It already imports from `@/lib/pipelines` for other functions — add `updatePipeline` to that import.)

- [ ] **Step 2: Add constants before `StageFieldRow`**

Insert these constants right after the existing `const FIELD_TYPES = [...]` line:

```typescript
const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: 'record_number', label: 'Record #' },
  { key: 'name', label: 'Name' },
  { key: 'stage', label: 'Stage' },
  { key: 'owner_id', label: 'Owner' },
  { key: 'contact_id', label: 'Contact' },
  { key: 'company_id', label: 'Company' },
  { key: 'created_at', label: 'Created' },
];

const DEFAULT_TABLE_COLUMNS = ['record_number', 'name', 'stage', 'owner_id', 'created_at'];
```

- [ ] **Step 3: Add `ViewSettings` component**

Insert this component definition before `StageFieldRow` (after the constants):

```typescript
function ViewSettings({ pipeline, onChanged }: { pipeline: Pipeline; onChanged: () => void }) {
  const getToken = useApiToken();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentView = pipeline.view ?? 'kanban';
  const currentColumns: string[] = pipeline.table_columns ?? DEFAULT_TABLE_COLUMNS;

  async function handleViewChange(view: string) {
    setSaving(true);
    setError(null);
    try {
      await updatePipeline(await getToken(), pipeline.id, { view });
      onChanged();
    } catch {
      setError('Failed to save view setting');
    } finally {
      setSaving(false);
    }
  }

  async function handleColumnToggle(key: string, checked: boolean) {
    const next = checked
      ? [...currentColumns, key]
      : currentColumns.filter(c => c !== key);
    setSaving(true);
    setError(null);
    try {
      await updatePipeline(await getToken(), pipeline.id, {
        table_columns: next.length > 0 ? next : null,
      });
      onChanged();
    } catch {
      setError('Failed to save column setting');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>View</div>
      {error && (
        <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>{error}</p>
      )}
      <select
        value={currentView}
        onChange={e => void handleViewChange(e.target.value)}
        disabled={saving}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 8px', fontSize: 13, color: 'var(--text)', marginBottom: 12,
          opacity: saving ? 0.6 : 1,
        }}
      >
        <option value="kanban">Kanban</option>
        <option value="table">Table</option>
        <option value="list">List</option>
      </select>

      {currentView === 'table' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Columns</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ALL_COLUMNS.map(col => (
              <label
                key={col.key}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={currentColumns.includes(col.key)}
                  disabled={saving}
                  onChange={e => void handleColumnToggle(col.key, e.target.checked)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render `ViewSettings` in the active pipeline panel**

Find the section in `PipelinesSettingsPage` where `PipelineEditor` is rendered (around line 952). Add `<ViewSettings>` above it:

```tsx
{activePipeline ? (
  <>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{activePipeline.name}</h3>
      {!activePipeline.is_default && (
        deletingId === activePipeline.id ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#ef4444' }}>Delete pipeline?</span>
            <Button onClick={() => deleteMut.mutate(activePipeline.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? '…' : 'Yes, delete'}
            </Button>
            <Button onClick={() => setDeletingId(null)}>Cancel</Button>
          </div>
        ) : (
          <button
            onClick={() => setDeletingId(activePipeline.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}
          >
            Delete pipeline
          </button>
        )
      )}
    </div>
    <ViewSettings
      pipeline={activePipeline}
      onChanged={() => { void refetch(); void qc.invalidateQueries({ queryKey: ['pipelines'] }); }}
    />
    <PipelineEditor key={activePipeline.id} pipeline={activePipeline} />
    <ItemGroupsSection pipelineId={activePipeline.id} />
  </>
) : (
  <div style={{ fontSize: 13, color: 'var(--text3)' }}>No pipelines yet.</div>
)}
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors. If there are errors about `Pipeline.view` not existing, ensure Task 3 (types update) is committed and the workspace symlinks are resolved (`packages/types` is a workspace package).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/settings/pipelines/page.tsx
git commit -m "feat: add view and column picker to pipeline settings"
```

---

## Self-Review Checklist (for implementer to run after all tasks)

After all 7 tasks are committed, verify:

- [ ] `npm test` in `apps/api` — all tests pass including `pipelines.views.test.ts`
- [ ] `npx tsc --noEmit` in `apps/web` — 0 errors
- [ ] Migration file exists at `packages/db/migrations/20260520_001_pipeline_views.ts`
- [ ] Settings page: selecting "Table" shows column checkboxes; selecting "Kanban"/"List" hides them
- [ ] Pipeline page: changing a pipeline's view in settings and refreshing shows the correct component
- [ ] RecordTable column header click sorts rows; second click reverses direction
- [ ] RecordList rows click to open RecordDetail drawer
- [ ] Empty state shows "No records" in both Table and List views
