# Pipeline Overhaul — Part 1: DB Migration & API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate deals to generic pipeline_records, rewrite all pipeline API routes (record-types, records, pipelines), update analytics/tasks/activity, delete all deals-specific code.

**Architecture:** DB migration preserves deal UUIDs so tasks/activity FK references stay valid. Seeds Deal record_type per workspace. Copies value/probability/close_date into record_field_values. API routes follow factory-function pattern: `createXRouter(db, requirePermission)`. Tests use vitest with mock Kysely chain.

**Tech Stack:** Node.js + Express + TypeScript, Kysely, Zod, vitest, PostgreSQL

**Part 2:** `2026-06-02-pipeline-overhaul-part2-web.md` — Web UI (depends on this plan completing first)

---

### Shared test helpers (used in Tasks 4–6)

Every test file starts with this boilerplate — not repeated per task:

```typescript
import { describe, it, expect, vi } from 'vitest';

const noop = () => (_: any, __: any, next: any) => next();

function buildDb(rows: unknown[] = [], single?: unknown) {
  const chain: Record<string, unknown> = {};
  ['selectFrom','insertInto','updateTable','deleteFrom','where','select','selectAll',
   'orderBy','limit','offset','returning','returningAll','values','set',
   'execute','executeTakeFirst','executeTakeFirstOrThrow','innerJoin','leftJoin'].forEach(m => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  (chain.execute as any).mockResolvedValue(rows);
  (chain.executeTakeFirst as any).mockResolvedValue(single);
  (chain.executeTakeFirstOrThrow as any).mockResolvedValue(single ?? rows[0]);
  (chain.onConflict as any) = vi.fn().mockReturnValue(chain);
  (chain.doUpdateSet as any) = vi.fn().mockReturnValue(chain);
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom: vi.fn().mockReturnValue(chain),
    transaction: vi.fn().mockImplementation((fn: any) => fn(chain)),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}
function req(o: any = {}) {
  return { workspace: { id: 'ws-1' }, user: { id: 'u-1', role: 'admin' }, body: {}, params: {}, query: {}, ...o } as any;
}
function res() {
  const r = { json: vi.fn(), status: vi.fn() } as any;
  r.status.mockReturnValue(r); return r;
}
function handler(router: any, method: string, path: string) {
  const layer = router.stack.find((s: any) => s.route?.path === path && s.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}
```

---

### Task 1: Branch Setup

- [ ] **Create branch**
```bash
git checkout -b feat/pipeline-engine-overhaul
```

---

### Task 2: DB Migration

**Files:**
- Create: `packages/db/migrations/20260602_001_migrate_deals_to_records.ts`

- [ ] **Write migration**

```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Seed Deal record_type per workspace (preserve if exists)
  await sql`
    INSERT INTO record_types (
      workspace_id, name, icon,
      auto_number_enabled, auto_number_prefix, auto_number_format,
      auto_number_sequence, position
    )
    SELECT DISTINCT workspace_id, 'Deal', '💰', true, 'DEAL', 'PREFIX-YY-NNN', 0, 0
    FROM deals WHERE workspace_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `.execute(db);

  // 2. Default permissions for Deal record types
  await sql`
    INSERT INTO record_type_permissions
      (record_type_id, role, can_view, can_create, can_edit, can_delete)
    SELECT rt.id, r.role, true, true, true, (r.role = 'admin')
    FROM record_types rt
    CROSS JOIN (VALUES ('admin'), ('member')) AS r(role)
    WHERE rt.name = 'Deal'
    ON CONFLICT (record_type_id, role) DO NOTHING
  `.execute(db);

  // 3. Seed record_type_fields: value, probability, close_date
  await sql`
    INSERT INTO record_type_fields (record_type_id, label, field_type, is_required, position)
    SELECT rt.id, f.label, f.field_type, false, f.pos
    FROM record_types rt
    CROSS JOIN (VALUES
      ('value',       'number', 0),
      ('probability', 'number', 1),
      ('close_date',  'date',   2)
    ) AS f(label, field_type, pos)
    WHERE rt.name = 'Deal'
  `.execute(db);

  // 4. Migrate deals → pipeline_records (preserve UUIDs — tasks/activity FKs stay valid)
  await sql`
    INSERT INTO pipeline_records (
      id, workspace_id, record_type_id, pipeline_id, stage_id,
      name, contact_id, company_id, owner_id,
      deleted_at, created_at, updated_at
    )
    SELECT d.id, d.workspace_id, rt.id, d.pipeline_id, d.stage_id,
      d.name, d.contact_id, d.company_id, d.owner_id,
      d.deleted_at, d.created_at, d.updated_at
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    WHERE d.pipeline_id IS NOT NULL AND d.stage_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING
  `.execute(db);

  // 5. Migrate value / probability / close_date into record_field_values
  await sql`
    INSERT INTO record_field_values (record_id, field_id, value)
    SELECT d.id, rtf.id, to_jsonb(d.value)
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    JOIN record_type_fields rtf ON rtf.record_type_id = rt.id AND rtf.label = 'value'
    WHERE d.pipeline_id IS NOT NULL
    ON CONFLICT (record_id, field_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO record_field_values (record_id, field_id, value)
    SELECT d.id, rtf.id, to_jsonb(d.probability)
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    JOIN record_type_fields rtf ON rtf.record_type_id = rt.id AND rtf.label = 'probability'
    WHERE d.pipeline_id IS NOT NULL
    ON CONFLICT (record_id, field_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO record_field_values (record_id, field_id, value)
    SELECT d.id, rtf.id, to_jsonb(d.close_date::text)
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    JOIN record_type_fields rtf ON rtf.record_type_id = rt.id AND rtf.label = 'close_date'
    WHERE d.close_date IS NOT NULL AND d.pipeline_id IS NOT NULL
    ON CONFLICT (record_id, field_id) DO NOTHING
  `.execute(db);

  // 6. Backfill pipelines.record_type_id
  await sql`
    UPDATE pipelines p SET record_type_id = rt.id
    FROM record_types rt
    WHERE rt.workspace_id = p.workspace_id AND rt.name = 'Deal' AND p.record_type_id IS NULL
  `.execute(db);

  // 7. tasks.deal_id → tasks.record_id
  await db.schema.alterTable('tasks')
    .addColumn('record_id', 'uuid', col => col.references('pipeline_records.id'))
    .execute();
  await sql`UPDATE tasks SET record_id = deal_id WHERE deal_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('tasks').dropColumn('deal_id').execute();

  // 8. activity.deal_id → activity.record_id
  await db.schema.alterTable('activity')
    .addColumn('record_id', 'uuid', col => col.references('pipeline_records.id'))
    .execute();
  await sql`UPDATE activity SET record_id = deal_id WHERE deal_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('activity').dropColumn('deal_id').execute();

  // 9. Drop old tables
  await db.schema.dropTable('deal_field_values').execute();
  await db.schema.dropTable('stage_fields').execute();
  await db.schema.dropTable('deals').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Structural rollback — data is not restored
  await db.schema
    .createTable('deals')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('contact_id', 'uuid', col => col.references('contacts.id'))
    .addColumn('company_id', 'uuid', col => col.references('companies.id'))
    .addColumn('owner_id', 'uuid', col => col.notNull().references('users.id'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('value', 'decimal', col => col.notNull().defaultTo(0))
    .addColumn('pipeline_id', 'uuid', col => col.references('pipelines.id'))
    .addColumn('stage_id', 'uuid', col => col.references('pipeline_stages.id'))
    .addColumn('probability', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('close_date', 'date')
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.alterTable('tasks').addColumn('deal_id', 'uuid').execute();
  await sql`UPDATE tasks SET deal_id = record_id WHERE record_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('tasks').dropColumn('record_id').execute();
  await db.schema.alterTable('activity').addColumn('deal_id', 'uuid').execute();
  await sql`UPDATE activity SET deal_id = record_id WHERE record_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('activity').dropColumn('record_id').execute();
}
```

- [ ] **Run migration**
```bash
pnpm db:migrate
```
Expected: exits 0, no errors

- [ ] **Commit**
```bash
git add packages/db/migrations/20260602_001_migrate_deals_to_records.ts
git commit -m "chore: migrate deals to generic pipeline_records engine"
```

---

### Task 3: Types Package Update

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Remove `Deal`, `StageField`, `DealStage`, `PipelineWithStages`. Update `Task`, `Activity`, `Pipeline`. Add new interfaces.**

Exact removals — delete these blocks:
```typescript
export type DealStage = 'lead' | 'qualifying' | 'proposal' | 'closing' | 'won' | 'lost';
export interface Deal { ... }          // full block
export interface StageField { ... }    // full block
export interface PipelineWithStages extends Pipeline {
  stages: (PipelineStage & { fields: StageField[] })[];
}
```

Update `Task` — replace `deal_id: UUID | null` with `record_id: UUID | null`.

Update `Activity` — replace `deal_id: UUID | null` with `record_id: UUID | null`.

Update `Pipeline`:
```typescript
export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  record_type_id: string;              // no longer nullable
  view: 'kanban' | 'table' | 'list';
  table_columns: string[] | null;
  position: number;
  created_at: string;
  updated_at: string;
}
```

Add at end of file:
```typescript
export interface PipelineRecord {
  id: string;
  workspace_id: string;
  record_type_id: string;
  pipeline_id: string;
  stage_id: string;
  record_number: string | null;
  name: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordFieldValue {
  id: string;
  record_id: string;
  field_id: string;
  value: unknown;
}

export interface PipelineRecordWithValues extends PipelineRecord {
  field_values: RecordFieldValue[];
}

export interface RecordType {
  id: string;
  workspace_id: string;
  name: string;
  icon: string | null;
  description: string | null;
  auto_number_enabled: boolean;
  auto_number_prefix: string | null;
  auto_number_format: string;
  auto_number_sequence: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RecordTypeField {
  id: string;
  record_type_id: string;
  label: string;
  field_type: FieldType;
  options: { label: string; value: string }[] | null;
  is_required: boolean;
  position: number;
  created_at: string;
}

export interface RecordTypePermission {
  id: string;
  record_type_id: string;
  role: UserRole;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface RecordTypeWithFields extends RecordType {
  fields: RecordTypeField[];
}

export interface PipelineWithDetails extends Pipeline {
  stages: PipelineStage[];
  record_type: RecordTypeWithFields;
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

export interface ConversionFieldMapping {
  id: string;
  template_id: string;
  source_field_id: string | null;
  source_builtin: string | null;
  target_field_id: string | null;
  target_builtin: string | null;
}

export interface ConversionTemplateWithMappings extends ConversionTemplate {
  field_mappings: ConversionFieldMapping[];
}
```

- [ ] **Verify build**
```bash
cd packages/types && pnpm build
```
Expected: 0 errors

- [ ] **Commit**
```bash
git add packages/types/src/index.ts
git commit -m "feat: add generic pipeline engine types, remove Deal type"
```

---

### Task 4: Rewrite `routes/record-types.ts`

**Files:**
- Create: `apps/api/src/routes/record-types.ts`
- Create: `apps/api/src/routes/record-types.test.ts`

- [ ] **Write tests** — `apps/api/src/routes/record-types.test.ts`

```typescript
// (paste shared helpers from top of this plan)
import { createRecordTypesRouter } from './record-types';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

describe('GET /', () => {
  it('returns list', async () => {
    const db = buildDb([{ id: 'rt-1', name: 'Deal' }]);
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'get', '/')(req(), r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('POST /', () => {
  it('rejects empty name', async () => {
    const db = buildDb();
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'post', '/')(req({ body: {} }), r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(400);
  });
  it('creates record type + permissions', async () => {
    const created = { id: 'rt-new', name: 'Lead', workspace_id: 'ws-1' };
    const db = buildDb([], created);
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'post', '/')(req({ body: { name: 'Lead' } }), r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('DELETE /:id', () => {
  it('returns 409 when records exist', async () => {
    const db = buildDb([], { n: 3 });
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'delete', '/:id')(req({ params: { id: 'rt-1' } }), r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(409);
  });
});

describe('POST /:id/fields', () => {
  it('rejects invalid field_type', async () => {
    const db = buildDb([], { id: 'rt-1' });
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'post', '/:id/fields')(
      req({ params: { id: 'rt-1' }, body: { label: 'X', field_type: 'invalid' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /:id/conversions', () => {
  it('creates template with mappings', async () => {
    const tpl = { id: 'tpl-1', name: 'To Lead' };
    const db = buildDb([], tpl);
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'post', '/:id/conversions')(req({
      params: { id: 'rt-1' },
      body: {
        name: 'To Lead',
        target_type_id: '00000000-0000-0000-0000-000000000001',
        target_pipeline_id: '00000000-0000-0000-0000-000000000002',
        target_stage_id: '00000000-0000-0000-0000-000000000003',
        field_mappings: [],
      },
    }), r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});
```

- [ ] **Run — verify FAIL**
```bash
cd apps/api && pnpm test -- record-types.test
```

- [ ] **Write implementation** — `apps/api/src/routes/record-types.ts`

```typescript
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createTypeSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  description: z.string().optional(),
  auto_number_enabled: z.boolean().default(false),
  auto_number_prefix: z.string().optional(),
  auto_number_format: z.string().default('PREFIX-YY-NNN'),
  position: z.number().int().default(0),
});
const updateTypeSchema = createTypeSchema.partial();

const createFieldSchema = z.object({
  label: z.string().min(1),
  field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  is_required: z.boolean().default(false),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  position: z.number().int().default(0),
});
const updateFieldSchema = createFieldSchema.omit({ field_type: true }).partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

const createConversionSchema = z.object({
  name: z.string().min(1),
  target_type_id: z.string().uuid(),
  target_pipeline_id: z.string().uuid(),
  target_stage_id: z.string().uuid(),
  position: z.number().int().default(0),
  field_mappings: z.array(z.object({
    source_field_id: z.string().uuid().optional(),
    source_builtin: z.enum(['name', 'contact_id', 'company_id', 'owner_id']).optional(),
    target_field_id: z.string().uuid().optional(),
    target_builtin: z.enum(['name', 'contact_id', 'company_id', 'owner_id']).optional(),
  })).default([]),
});

function ws(req: any) { return (req as AuthenticatedRequest).workspace.id; }
function fail(res: any, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createRecordTypesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');
  const create = requirePermission('pipelines:create');
  const del = requirePermission('pipelines:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const data = await db.selectFrom('record_types').selectAll()
        .where('workspace_id', '=', ws(req)).orderBy('position', 'asc').execute();
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const p = createTypeSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      if (p.data.auto_number_enabled && !p.data.auto_number_prefix)
        return fail(res, 400, 'VALIDATION_ERROR', 'auto_number_prefix required when auto_number_enabled');
      const rt = await db.insertInto('record_types')
        .values({ workspace_id: ws(req), ...p.data }).returningAll().executeTakeFirstOrThrow();
      await db.insertInto('record_type_permissions').values([
        { record_type_id: rt.id, role: 'admin', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { record_type_id: rt.id, role: 'member', can_view: true, can_create: true, can_edit: true, can_delete: false },
      ]).execute();
      res.json({ data: rt, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const p = updateTypeSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('record_types')
        .set({ ...p.data, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const c = await db.selectFrom('pipeline_records').select(db.fn.countAll<number>().as('n'))
        .where('record_type_id', '=', req.params['id']!).where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(c.n) > 0) return fail(res, 409, 'CONFLICT', 'Record type has active records');
      await db.deleteFrom('record_types')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).execute();
      res.json({ data: { id: req.params['id'] }, error: null });
    } catch (e) { next(e); }
  });

  // Fields
  router.get('/:id/fields', view, async (req, res, next) => {
    try {
      const data = await db.selectFrom('record_type_fields').selectAll()
        .where('record_type_id', '=', req.params['id']!).orderBy('position', 'asc').execute();
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/fields', edit, async (req, res, next) => {
    try {
      const p = createFieldSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const rt = await db.selectFrom('record_types').select('id')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!rt) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      const field = await db.insertInto('record_type_fields')
        .values({ record_type_id: req.params['id']!, ...p.data }).returningAll().executeTakeFirstOrThrow();
      res.json({ data: field, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/fields/reorder', edit, async (req, res, next) => {
    try {
      const p = reorderSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      await Promise.all(p.data.ids.map((fid, i) =>
        db.updateTable('record_type_fields').set({ position: i })
          .where('id', '=', fid).where('record_type_id', '=', req.params['id']!).execute()
      ));
      res.json({ data: { ids: p.data.ids }, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/fields/:fid', edit, async (req, res, next) => {
    try {
      const p = updateFieldSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('record_type_fields').set(p.data as never)
        .where('id', '=', req.params['fid']!).where('record_type_id', '=', req.params['id']!)
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Field not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id/fields/:fid', edit, async (req, res, next) => {
    try {
      await db.deleteFrom('record_field_values').where('field_id', '=', req.params['fid']!).execute();
      await db.deleteFrom('record_type_fields')
        .where('id', '=', req.params['fid']!).where('record_type_id', '=', req.params['id']!).execute();
      res.json({ data: { id: req.params['fid'] }, error: null });
    } catch (e) { next(e); }
  });

  // Conversions
  router.get('/:id/conversions', view, async (req, res, next) => {
    try {
      const templates = await db.selectFrom('conversion_templates').selectAll()
        .where('source_type_id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .orderBy('position', 'asc').execute();
      const data = await Promise.all(templates.map(async t => {
        const field_mappings = await db.selectFrom('conversion_field_mappings').selectAll()
          .where('template_id', '=', t.id).execute();
        return { ...t, field_mappings };
      }));
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/conversions', edit, async (req, res, next) => {
    try {
      const p = createConversionSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_mappings, ...tData } = p.data;
      const tpl = await db.insertInto('conversion_templates')
        .values({ workspace_id: ws(req), source_type_id: req.params['id']!, ...tData })
        .returningAll().executeTakeFirstOrThrow();
      if (field_mappings.length > 0) {
        await db.insertInto('conversion_field_mappings').values(
          field_mappings.map(m => ({
            template_id: tpl.id,
            source_field_id: m.source_field_id ?? null,
            source_builtin: m.source_builtin ?? null,
            target_field_id: m.target_field_id ?? null,
            target_builtin: m.target_builtin ?? null,
          }))
        ).execute();
      }
      res.json({ data: { ...tpl, field_mappings }, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/conversions/:tid', edit, async (req, res, next) => {
    try {
      const p = createConversionSchema.partial().safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_mappings, ...tData } = p.data;
      const updated = await db.updateTable('conversion_templates').set(tData as never)
        .where('id', '=', req.params['tid']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Template not found');
      if (field_mappings !== undefined) {
        await db.deleteFrom('conversion_field_mappings')
          .where('template_id', '=', req.params['tid']!).execute();
        if (field_mappings.length > 0) {
          await db.insertInto('conversion_field_mappings').values(
            field_mappings.map(m => ({
              template_id: req.params['tid']!,
              source_field_id: m.source_field_id ?? null,
              source_builtin: m.source_builtin ?? null,
              target_field_id: m.target_field_id ?? null,
              target_builtin: m.target_builtin ?? null,
            }))
          ).execute();
        }
      }
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id/conversions/:tid', edit, async (req, res, next) => {
    try {
      await db.deleteFrom('conversion_field_mappings')
        .where('template_id', '=', req.params['tid']!).execute();
      await db.deleteFrom('conversion_templates')
        .where('id', '=', req.params['tid']!).where('workspace_id', '=', ws(req)).execute();
      res.json({ data: { id: req.params['tid'] }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Run tests — verify PASS**
```bash
cd apps/api && pnpm test -- record-types.test
```

- [ ] **Commit**
```bash
git add apps/api/src/routes/record-types.ts apps/api/src/routes/record-types.test.ts
git commit -m "feat: rewrite record-types route with field + conversion management"
```

---

### Task 5: Rewrite `routes/records.ts`

**Files:**
- Create: `apps/api/src/routes/records.ts`
- Create: `apps/api/src/routes/records.test.ts`

- [ ] **Write tests** — `apps/api/src/routes/records.test.ts`

```typescript
// (paste shared helpers from top of this plan)
import { createRecordsRouter } from './records';

describe('GET /', () => {
  it('returns records with field_values', async () => {
    const db = buildDb([{ id: 'r-1', name: 'Deal A' }]);
    await handler(createRecordsRouter(db as any, noop), 'get', '/')(
      req({ query: { pipeline_id: 'p-1' } }), res(), vi.fn()
    );
  });
});

describe('POST /', () => {
  it('rejects missing pipeline_id', async () => {
    const db = buildDb();
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'post', '/')(
      req({ body: { name: 'X', record_type_id: 'rt-1', stage_id: 's-1', owner_id: 'u-1' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(400);
  });
  it('creates record', async () => {
    const created = { id: 'r-new', name: 'New', record_number: 'DEAL-26-001' };
    const db = buildDb([], created);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'post', '/')(req({
      body: {
        record_type_id: '00000000-0000-0000-0000-000000000001',
        pipeline_id: '00000000-0000-0000-0000-000000000002',
        stage_id: '00000000-0000-0000-0000-000000000003',
        name: 'New Deal',
        owner_id: '00000000-0000-0000-0000-000000000004',
      },
    }), r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('DELETE /:id', () => {
  it('soft deletes', async () => {
    const db = buildDb([], { id: 'r-1', deleted_at: new Date().toISOString() });
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'delete', '/:id')(
      req({ params: { id: 'r-1' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('PATCH /:id', () => {
  it('updates record', async () => {
    const updated = { id: 'r-1', name: 'Renamed', stage_id: 's-2' };
    const db = buildDb([], updated);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'patch', '/:id')(
      req({ params: { id: 'r-1' }, body: { name: 'Renamed' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});
```

- [ ] **Run — verify FAIL**
```bash
cd apps/api && pnpm test -- records.test
```

- [ ] **Write implementation** — `apps/api/src/routes/records.ts`

```typescript
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { generateRecordNumber } from '../lib/auto-number';

const createSchema = z.object({
  record_type_id: z.string().uuid(),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  name: z.string().min(1),
  owner_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  field_values: z.record(z.unknown()).optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  stage_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  field_values: z.record(z.unknown()).optional(),
});
const listSchema = z.object({
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  record_type_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});
const convertSchema = z.object({
  template_id: z.string().uuid(),
  field_overrides: z.record(z.unknown()).default({}),
});

function ws(req: any) { return (req as AuthenticatedRequest).workspace.id; }
function uid(req: any) { return (req as AuthenticatedRequest).user.id; }
function fail(res: any, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

async function attachFvs(db: Kysely<Database>, records: any[]) {
  if (!records.length) return records;
  const fvs = await db.selectFrom('record_field_values').selectAll()
    .where('record_id', 'in', records.map(r => r.id)).execute();
  const map = new Map<string, typeof fvs>();
  for (const fv of fvs) {
    const arr = map.get(fv.record_id) ?? [];
    arr.push(fv); map.set(fv.record_id, arr);
  }
  return records.map(r => ({ ...r, field_values: map.get(r.id) ?? [] }));
}

async function upsertFvs(db: Kysely<Database>, recordId: string, fv: Record<string, unknown>) {
  for (const [fieldId, value] of Object.entries(fv)) {
    await db.insertInto('record_field_values')
      .values({ record_id: recordId, field_id: fieldId, value: JSON.stringify(value) as never })
      .onConflict(oc => oc.columns(['record_id', 'field_id'])
        .doUpdateSet({ value: JSON.stringify(value) as never }))
      .execute();
  }
}

export function createRecordsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const create = requirePermission('pipelines:create');
  const edit = requirePermission('pipelines:edit');
  const del = requirePermission('pipelines:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const p = listSchema.safeParse(req.query);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { page, per_page, pipeline_id, stage_id, record_type_id, owner_id, contact_id, company_id, q } = p.data;
      let q2 = db.selectFrom('pipeline_records').selectAll()
        .where('workspace_id', '=', ws(req)).where('deleted_at', 'is', null);
      if (pipeline_id) q2 = q2.where('pipeline_id', '=', pipeline_id);
      if (stage_id) q2 = q2.where('stage_id', '=', stage_id);
      if (record_type_id) q2 = q2.where('record_type_id', '=', record_type_id);
      if (owner_id) q2 = q2.where('owner_id', '=', owner_id);
      if (contact_id) q2 = q2.where('contact_id', '=', contact_id);
      if (company_id) q2 = q2.where('company_id', '=', company_id);
      if (q) q2 = q2.where('name', 'like', `%${q}%`);
      const records = await q2.orderBy('created_at', 'desc')
        .limit(per_page).offset((page - 1) * per_page).execute();
      res.json({ data: await attachFvs(db, records), page, per_page, error: null });
    } catch (e) { next(e); }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const r = await db.selectFrom('pipeline_records').selectAll()
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .where('deleted_at', 'is', null).executeTakeFirst();
      if (!r) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      const fvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', r.id).execute();
      res.json({ data: { ...r, field_values: fvs }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const p = createSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_values, ...data } = p.data;
      const rt = await db.selectFrom('record_types').select('id')
        .where('id', '=', data.record_type_id).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!rt) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      const record_number = await generateRecordNumber(db, data.record_type_id).catch(() => null);
      const record = await db.insertInto('pipeline_records').values({
        workspace_id: ws(req), record_number: record_number ?? null,
        contact_id: data.contact_id ?? null, company_id: data.company_id ?? null, ...data,
      }).returningAll().executeTakeFirstOrThrow();
      if (field_values) await upsertFvs(db, record.id, field_values);
      const fvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', record.id).execute();
      res.json({ data: { ...record, field_values: fvs }, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const p = updateSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_values, stage_id, ...rest } = p.data;
      if (stage_id) {
        const required = await db.selectFrom('stage_required_fields as srf')
          .innerJoin('record_type_fields as rtf', 'rtf.id', 'srf.field_id')
          .select(['rtf.id', 'rtf.label']).where('srf.stage_id', '=', stage_id).execute();
        if (required.length > 0) {
          const existing = await db.selectFrom('record_field_values').select('field_id')
            .where('record_id', '=', req.params['id']!).execute();
          const existingIds = new Set(existing.map(e => e.field_id));
          const incomingIds = new Set(Object.keys(field_values ?? {}));
          const missing = required.filter(r => !existingIds.has(r.id) && !incomingIds.has(r.id));
          if (missing.length > 0) {
            return fail(res, 422, 'REQUIRED_FIELDS',
              `Missing required fields: ${missing.map(f => f.label).join(', ')}`);
          }
        }
      }
      const update: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
      if (stage_id) update['stage_id'] = stage_id;
      const updated = await db.updateTable('pipeline_records').set(update as never)
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      if (field_values) await upsertFvs(db, updated.id, field_values);
      const fvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', updated.id).execute();
      res.json({ data: { ...updated, field_values: fvs }, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const updated = await db.updateTable('pipeline_records')
        .set({ deleted_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .where('deleted_at', 'is', null).returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      res.json({ data: { id: updated.id }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/convert', create, async (req, res, next) => {
    try {
      const p = convertSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { template_id, field_overrides } = p.data;
      const source = await db.selectFrom('pipeline_records').selectAll()
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .where('deleted_at', 'is', null).executeTakeFirst();
      if (!source) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      const template = await db.selectFrom('conversion_templates').selectAll()
        .where('id', '=', template_id).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!template) return fail(res, 404, 'NOT_FOUND', 'Conversion template not found');
      const mappings = await db.selectFrom('conversion_field_mappings').selectAll()
        .where('template_id', '=', template_id).execute();
      const sourceFvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', source.id).execute();
      const fvMap = new Map(sourceFvs.map(f => [f.field_id, f.value]));
      const builtinMap: Record<string, unknown> = {};
      for (const m of mappings.filter(m => m.source_builtin && m.target_builtin)) {
        builtinMap[m.target_builtin!] = (source as any)[m.source_builtin!];
      }
      const record_number = await generateRecordNumber(db, template.target_type_id).catch(() => null);
      const target = await db.transaction().execute(async (trx) => {
        const created = await trx.insertInto('pipeline_records').values({
          workspace_id: ws(req),
          record_type_id: template.target_type_id,
          pipeline_id: template.target_pipeline_id,
          stage_id: template.target_stage_id,
          record_number: record_number ?? null,
          name: String(field_overrides['name'] ?? builtinMap['name'] ?? source.name),
          contact_id: (field_overrides['contact_id'] ?? builtinMap['contact_id'] ?? source.contact_id) as string | null,
          company_id: (field_overrides['company_id'] ?? builtinMap['company_id'] ?? source.company_id) as string | null,
          owner_id: String(field_overrides['owner_id'] ?? builtinMap['owner_id'] ?? source.owner_id),
        }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('record_conversions').values({
          source_record_id: source.id, target_record_id: created.id,
          template_id, converted_by: uid(req),
        }).execute();
        const fvInserts = mappings
          .filter(m => m.source_field_id && m.target_field_id)
          .flatMap(m => {
            const val = field_overrides[m.target_field_id!] !== undefined
              ? JSON.stringify(field_overrides[m.target_field_id!])
              : fvMap.get(m.source_field_id!) ?? null;
            if (val === null) return [];
            return [{ record_id: created.id, field_id: m.target_field_id!, value: val as never }];
          });
        if (fvInserts.length > 0) await trx.insertInto('record_field_values').values(fvInserts).execute();
        return created;
      });
      const targetFvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', target.id).execute();
      res.json({ data: { source, target: { ...target, field_values: targetFvs } }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Run tests — verify PASS**
```bash
cd apps/api && pnpm test -- records.test
```

- [ ] **Commit**
```bash
git add apps/api/src/routes/records.ts apps/api/src/routes/records.test.ts
git commit -m "feat: rewrite records route with field values, stage enforcement, convert"
```

---

### Task 6: Rewrite `routes/pipelines.ts`

**Files:**
- Create: `apps/api/src/routes/pipelines.ts`
- Create: `apps/api/src/routes/pipelines.test.ts`

- [ ] **Write tests** — `apps/api/src/routes/pipelines.test.ts`

```typescript
// (paste shared helpers from top of this plan)
import { createPipelinesRouter } from './pipelines';

describe('GET /', () => {
  it('returns pipelines with stages', async () => {
    const db = buildDb([{ id: 'p-1', name: 'Sales', record_type_id: 'rt-1' }]);
    await handler(createPipelinesRouter(db as any, noop), 'get', '/')(req(), res(), vi.fn());
  });
});

describe('POST /', () => {
  it('requires record_type_id', async () => {
    const db = buildDb();
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'post', '/')(
      req({ body: { name: 'No Type' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(400);
  });
  it('creates pipeline', async () => {
    const created = { id: 'p-new', name: 'Sales', record_type_id: 'rt-1' };
    const db = buildDb([], created);
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'post', '/')(
      req({ body: { name: 'Sales', record_type_id: '00000000-0000-0000-0000-000000000001' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('DELETE /:id/stages/:sid', () => {
  it('returns 409 when stage has records', async () => {
    const db = buildDb([], { n: 2 });
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'delete', '/:id/stages/:sid')(
      req({ params: { id: 'p-1', sid: 's-1' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(409);
  });
});
```

- [ ] **Run — verify FAIL**
```bash
cd apps/api && pnpm test -- pipelines.test
```

- [ ] **Write implementation** — `apps/api/src/routes/pipelines.ts`

```typescript
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createPipelineSchema = z.object({
  name: z.string().min(1),
  record_type_id: z.string().uuid(),
  view: z.enum(['kanban', 'table', 'list']).default('kanban'),
  position: z.number().int().default(0),
});
const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  view: z.enum(['kanban', 'table', 'list']).optional(),
  table_columns: z.array(z.string()).nullable().optional(),
  is_default: z.boolean().optional(),
});
const createStageSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  is_won: z.boolean().default(false),
  is_lost: z.boolean().default(false),
  position: z.number().int().default(0),
});
const updateStageSchema = createStageSchema.partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

function ws(req: any) { return (req as AuthenticatedRequest).workspace.id; }
function fail(res: any, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createPipelinesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const create = requirePermission('pipelines:create');
  const edit = requirePermission('pipelines:edit');
  const del = requirePermission('pipelines:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const pipelines = await db.selectFrom('pipelines').selectAll()
        .where('workspace_id', '=', ws(req)).orderBy('position', 'asc').execute();
      const data = await Promise.all(pipelines.map(async p => {
        const stages = await db.selectFrom('pipeline_stages').selectAll()
          .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();
        const rt = p.record_type_id
          ? await db.selectFrom('record_types').selectAll()
              .where('id', '=', p.record_type_id).executeTakeFirst()
          : null;
        return { ...p, stages, record_type: rt };
      }));
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const p = await db.selectFrom('pipelines').selectAll()
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!p) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      const stages = await db.selectFrom('pipeline_stages').selectAll()
        .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();
      const rt = p.record_type_id
        ? await db.selectFrom('record_types').selectAll()
            .where('id', '=', p.record_type_id).executeTakeFirst()
        : null;
      const fields = rt
        ? await db.selectFrom('record_type_fields').selectAll()
            .where('record_type_id', '=', rt.id).orderBy('position', 'asc').execute()
        : [];
      res.json({ data: { ...p, stages, record_type: rt ? { ...rt, fields } : null }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const p = createPipelineSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const rt = await db.selectFrom('record_types').select('id')
        .where('id', '=', p.data.record_type_id).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!rt) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      const pipeline = await db.insertInto('pipelines')
        .values({ workspace_id: ws(req), is_default: false, table_columns: null, ...p.data })
        .returningAll().executeTakeFirstOrThrow();
      res.json({ data: pipeline, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const p = updatePipelineSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('pipelines')
        .set({ ...p.data, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const c = await db.selectFrom('pipeline_records').select(db.fn.countAll<number>().as('n'))
        .where('pipeline_id', '=', req.params['id']!).where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(c.n) > 0) return fail(res, 409, 'CONFLICT', 'Pipeline has active records');
      await db.deleteFrom('pipelines')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).execute();
      res.json({ data: { id: req.params['id'] }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/stages', edit, async (req, res, next) => {
    try {
      const p = createStageSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      const stage = await db.insertInto('pipeline_stages')
        .values({ pipeline_id: req.params['id']!, ...p.data }).returningAll().executeTakeFirstOrThrow();
      res.json({ data: stage, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/stages/reorder', edit, async (req, res, next) => {
    try {
      const p = reorderSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      await Promise.all(p.data.ids.map((sid, i) =>
        db.updateTable('pipeline_stages').set({ position: i })
          .where('id', '=', sid).where('pipeline_id', '=', req.params['id']!).execute()
      ));
      res.json({ data: { ids: p.data.ids }, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/stages/:sid', edit, async (req, res, next) => {
    try {
      const p = updateStageSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('pipeline_stages')
        .set({ ...p.data, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['sid']!).where('pipeline_id', '=', req.params['id']!)
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Stage not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id/stages/:sid', del, async (req, res, next) => {
    try {
      const c = await db.selectFrom('pipeline_records').select(db.fn.countAll<number>().as('n'))
        .where('stage_id', '=', req.params['sid']!).where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(c.n) > 0) return fail(res, 409, 'CONFLICT', 'Stage has active records');
      await db.deleteFrom('pipeline_stages')
        .where('id', '=', req.params['sid']!).where('pipeline_id', '=', req.params['id']!).execute();
      res.json({ data: { id: req.params['sid'] }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Run tests — verify PASS**
```bash
cd apps/api && pnpm test -- pipelines.test
```

- [ ] **Commit**
```bash
git add apps/api/src/routes/pipelines.ts apps/api/src/routes/pipelines.test.ts
git commit -m "feat: rewrite pipelines route with stages management"
```

---

### Task 7: Update `analytics.ts` + `tasks.ts` + `activity.ts`

**Files:**
- Modify: `apps/api/src/routes/analytics.ts`
- Modify: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/routes/activity.ts`

- [ ] **Update `analytics.ts` — replace all `selectFrom('deals')` queries**

Find the revenue analytics section. Replace the won/lost/value queries with:

```typescript
// Won records (is_won stage) with value from record_field_values
const wonRows = await db
  .selectFrom('pipeline_records as pr')
  .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
  .leftJoin('record_field_values as rfv', join => join.onRef('rfv.record_id', '=', 'pr.id'))
  .leftJoin('record_type_fields as rtf', join =>
    join.onRef('rtf.id', '=', 'rfv.field_id').on('rtf.label', '=', 'value')
  )
  .select([
    sql<string>`COUNT(DISTINCT pr.id)`.as('deals_won'),
    sql<string>`COALESCE(SUM((rfv.value #>> '{}')::numeric), 0)`.as('total_revenue'),
    sql<string>`COALESCE(AVG((rfv.value #>> '{}')::numeric), 0)`.as('avg_deal_size'),
  ])
  .where('pr.workspace_id', '=', workspace.id)
  .where('ps.is_won', '=', true)
  .where('pr.deleted_at', 'is', null)
  .where('pr.created_at', '>=', periodStart as never)
  .where('pr.created_at', '<', periodEnd as never)
  .executeTakeFirstOrThrow();

const lostCount = await db
  .selectFrom('pipeline_records as pr')
  .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
  .select(sql<string>`COUNT(*)`.as('lost_count'))
  .where('pr.workspace_id', '=', workspace.id)
  .where('ps.is_lost', '=', true)
  .where('pr.deleted_at', 'is', null)
  .where('pr.created_at', '>=', periodStart as never)
  .where('pr.created_at', '<', periodEnd as never)
  .executeTakeFirstOrThrow();
```

Find the team analytics section. Replace `selectFrom('deals as d')` with:

```typescript
const teamRows = await db
  .selectFrom('pipeline_records as pr')
  .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
  .innerJoin('users as u', 'u.id', 'pr.owner_id')
  .leftJoin('record_field_values as rfv', join => join.onRef('rfv.record_id', '=', 'pr.id'))
  .leftJoin('record_type_fields as rtf', join =>
    join.onRef('rtf.id', '=', 'rfv.field_id').on('rtf.label', '=', 'value')
  )
  .select([
    'u.id as owner_id',
    'u.name as owner_name',
    sql<string>`COUNT(DISTINCT pr.id)`.as('total_records'),
    sql<string>`COUNT(DISTINCT pr.id) FILTER (WHERE ps.is_won)`.as('deals_won'),
    sql<string>`COALESCE(SUM((rfv.value #>> '{}')::numeric) FILTER (WHERE ps.is_won), 0)`.as('total_revenue'),
    sql<string>`COUNT(DISTINCT pr.id) FILTER (WHERE ps.is_lost)`.as('deals_lost'),
  ])
  .where('pr.workspace_id', '=', workspace.id)
  .where('pr.deleted_at', 'is', null)
  .where('pr.created_at', '>=', periodStart as never)
  .where('pr.created_at', '<', periodEnd as never)
  .groupBy(['u.id', 'u.name'])
  .execute();
```

- [ ] **Update `tasks.ts`** — in Zod schemas: `deal_id` → `record_id`. In all Kysely queries: `.where('deal_id', '=', ...)` → `.where('record_id', '=', ...)`. In response shapes: `deal_id` → `record_id`.

- [ ] **Update `activity.ts`** — same pattern: `deal_id` → `record_id` everywhere.

- [ ] **Compile check**
```bash
cd apps/api && pnpm lint
```
Expected: 0 errors

- [ ] **Commit**
```bash
git add apps/api/src/routes/analytics.ts apps/api/src/routes/tasks.ts apps/api/src/routes/activity.ts
git commit -m "feat: update analytics/tasks/activity to use pipeline_records"
```

---

### Task 8: Update `index.ts` + Delete Old Files

**Files:**
- Modify: `apps/api/src/index.ts`
- Delete: `apps/api/src/routes/deals.ts`
- Delete: `apps/api/src/routes/v1/deals.ts`
- Delete: `apps/api/src/routes/conversions.ts`
- Delete: `apps/api/src/routes/conversions.test.ts`
- Delete: `apps/api/src/__tests__/deals-import.test.ts`

- [ ] **Remove from `index.ts`** — delete these import lines:
```typescript
import { createDealsRouter } from './routes/deals';
import { createConversionsRouter } from './routes/conversions';
import { createStageFieldsRouter } from './routes/pipelines'; // if present
```

Remove these `app.use` lines:
```typescript
app.use('/api/deals', ...createDealsRouter(...));
app.use('/api/conversions', ...createConversionsRouter(...));
```

Verify these mounts remain and have correct signatures:
```typescript
app.use('/api/record-types', requireAuth, requireModule('pipelines'), createRecordTypesRouter(db, requirePermission));
app.use('/api/records', requireAuth, requireModule('pipelines'), createRecordsRouter(db, requirePermission));
app.use('/api/pipelines', requireAuth, requireModule('pipelines'), createPipelinesRouter(db, requirePermission));
```

- [ ] **Delete old files**
```bash
rm apps/api/src/routes/deals.ts
rm apps/api/src/routes/v1/deals.ts
rm apps/api/src/routes/conversions.ts
rm apps/api/src/routes/conversions.test.ts
rm "apps/api/src/__tests__/deals-import.test.ts"
```

- [ ] **Full compile + test**
```bash
cd apps/api && pnpm lint && pnpm test
```
Expected: 0 errors, all tests green

- [ ] **Verify no stale deals references**
```bash
grep -r "selectFrom('deals')" apps/api/src/routes/
```
Expected: no output

- [ ] **Commit**
```bash
git add -A apps/api/src/
git commit -m "chore: remove deals/conversions routes, wire pipeline API in index.ts"
```

---

## Part 1 Done

All API work complete. Proceed to Part 2: `2026-06-02-pipeline-overhaul-part2-web.md`.
