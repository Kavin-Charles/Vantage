import { describe, it, expect, vi } from 'vitest';
import { createRecordsRouter } from './records';

const noop = () => (_: any, __: any, next: any) => next();

function buildDb(rows: unknown[] = [], single?: unknown) {
  const chain: Record<string, unknown> = {};
  ['selectFrom','insertInto','updateTable','deleteFrom','where','select','selectAll',
   'orderBy','limit','offset','returning','returningAll','values','set',
   'execute','executeTakeFirst','executeTakeFirstOrThrow','innerJoin','leftJoin',
   'onConflict','doUpdateSet'].forEach(m => {
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

describe('GET /', () => {
  it('returns records', async () => {
    const db = buildDb([{ id: 'r-1', name: 'Deal A' }]);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'get', '/')(
      req({ query: { pipeline_id: '00000000-0000-0000-0000-000000000001' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('GET /:id', () => {
  it('returns 404 when not found', async () => {
    const db = buildDb([], undefined);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'get', '/:id')(
      req({ params: { id: 'missing' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(404);
  });
  it('returns record with field_values', async () => {
    const record = { id: 'r-1', name: 'Deal A' };
    const db = buildDb([], record);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'get', '/:id')(
      req({ params: { id: 'r-1' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('POST /', () => {
  it('rejects missing pipeline_id', async () => {
    const db = buildDb();
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'post', '/')(
      req({ body: { record_type_id: '00000000-0000-0000-0000-000000000001', stage_id: '00000000-0000-0000-0000-000000000002', name: 'X', owner_id: '00000000-0000-0000-0000-000000000003' } }), r, vi.fn()
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

describe('PATCH /:id', () => {
  it('updates record', async () => {
    const updated = { id: 'r-1', name: 'Renamed' };
    const db = buildDb([], updated);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'patch', '/:id')(
      req({ params: { id: 'r-1' }, body: { name: 'Renamed' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
  it('returns 404 when not found', async () => {
    const db = buildDb([], undefined);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'patch', '/:id')(
      req({ params: { id: 'missing' }, body: { name: 'X' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(404);
  });
});

describe('DELETE /:id', () => {
  it('soft deletes', async () => {
    const updated = { id: 'r-1', deleted_at: new Date().toISOString() };
    const db = buildDb([], updated);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'delete', '/:id')(
      req({ params: { id: 'r-1' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
  it('returns 404 when not found', async () => {
    const db = buildDb([], undefined);
    const r = res();
    await handler(createRecordsRouter(db as any, noop), 'delete', '/:id')(
      req({ params: { id: 'missing' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(404);
  });
});
