import { describe, it, expect, vi } from 'vitest';
import { createRecordTypesRouter } from './record-types';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

const noop = () => (_: any, __: any, next: any) => next();

function buildDb(rows: unknown[] = [], single?: unknown) {
  const chain: Record<string, unknown> = {};
  ['selectFrom','insertInto','updateTable','deleteFrom','where','select','selectAll',
   'orderBy','limit','offset','returning','returningAll','values','set',
   'execute','executeTakeFirst','executeTakeFirstOrThrow'].forEach(m => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  (chain.execute as any).mockResolvedValue(rows);
  (chain.executeTakeFirst as any).mockResolvedValue(single);
  (chain.executeTakeFirstOrThrow as any).mockResolvedValue(single ?? rows[0]);
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom: vi.fn().mockReturnValue(chain),
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

describe('GET /', () => {
  it('returns list ordered by position', async () => {
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
  it('rejects auto_number_enabled without prefix', async () => {
    const db = buildDb();
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'post', '/')(req({ body: { name: 'X', auto_number_enabled: true } }), r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(400);
  });
  it('creates record type', async () => {
    const created = { id: 'rt-new', name: 'Lead', workspace_id: 'ws-1' };
    const db = buildDb([], created);
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'post', '/')(req({ body: { name: 'Lead' } }), r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('PATCH /:id', () => {
  it('returns 404 when not found', async () => {
    const db = buildDb([], undefined);
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'patch', '/:id')(req({ params: { id: 'rt-missing' }, body: { name: 'X' } }), r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(404);
  });
});

describe('DELETE /:id', () => {
  it('returns 409 when active records exist', async () => {
    const db = buildDb([], { n: 3 });
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'delete', '/:id')(req({ params: { id: 'rt-1' } }), r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(409);
  });
  it('deletes when no active records', async () => {
    const db = buildDb([], { n: 0 });
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'delete', '/:id')(req({ params: { id: 'rt-1' } }), r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
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
  it('creates field', async () => {
    const created = { id: 'f-1', label: 'Value', field_type: 'number' };
    const chain: any = {};
    ['selectFrom','insertInto','where','select','selectAll','orderBy','values',
     'returning','returningAll','execute','executeTakeFirst','executeTakeFirstOrThrow'].forEach(m => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    (chain.execute as any).mockResolvedValue([]);
    (chain.executeTakeFirst as any).mockResolvedValue({ id: 'rt-1' });
    (chain.executeTakeFirstOrThrow as any).mockResolvedValue(created);
    const db2 = {
      selectFrom: vi.fn().mockReturnValue(chain),
      insertInto: vi.fn().mockReturnValue(chain),
      fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
    };
    const router = createRecordTypesRouter(db2 as any, noop);
    const r = res();
    await handler(router, 'post', '/:id/fields')(
      req({ params: { id: 'rt-1' }, body: { label: 'Value', field_type: 'number' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('POST /:id/conversions', () => {
  it('creates conversion template', async () => {
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
  it('rejects missing name', async () => {
    const db = buildDb();
    const router = createRecordTypesRouter(db as any, noop);
    const r = res();
    await handler(router, 'post', '/:id/conversions')(req({
      params: { id: 'rt-1' },
      body: {
        target_type_id: '00000000-0000-0000-0000-000000000001',
        target_pipeline_id: '00000000-0000-0000-0000-000000000002',
        target_stage_id: '00000000-0000-0000-0000-000000000003',
      },
    }), r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(400);
  });
});
