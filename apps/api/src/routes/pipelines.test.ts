import { describe, it, expect, vi } from 'vitest';
import { createPipelinesRouter } from './pipelines';

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
  return { workspace: { id: 'ws-1' }, user: { id: 'u-1' }, body: {}, params: {}, query: {}, ...o } as any;
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
  it('returns pipelines', async () => {
    const db = buildDb([{ id: 'p-1', name: 'Sales', record_type_id: 'rt-1' }]);
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'get', '/')(req(), r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('GET /:id', () => {
  it('returns 404 when not found', async () => {
    const db = buildDb([], undefined);
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'get', '/:id')(
      req({ params: { id: 'missing' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(404);
  });
  it('returns pipeline with stages and record_type', async () => {
    const p = { id: 'p-1', name: 'Sales', record_type_id: 'rt-1' };
    const db = buildDb([], p);
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'get', '/:id')(
      req({ params: { id: 'p-1' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
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

describe('DELETE /:id', () => {
  it('returns 409 when pipeline has active records', async () => {
    const db = buildDb([], { n: 3 });
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'delete', '/:id')(
      req({ params: { id: 'p-1' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(409);
  });
  it('deletes when no active records', async () => {
    const db = buildDb([], { n: 0 });
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'delete', '/:id')(
      req({ params: { id: 'p-1' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('POST /:id/stages', () => {
  it('creates stage', async () => {
    const stage = { id: 's-1', name: 'Lead', pipeline_id: 'p-1' };
    const db = buildDb([], stage);
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'post', '/:id/stages')(
      req({ params: { id: 'p-1' }, body: { name: 'Lead', color: '#6366f1' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
  it('requires name', async () => {
    const db = buildDb();
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'post', '/:id/stages')(
      req({ params: { id: 'p-1' }, body: {} }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe('DELETE /:id/stages/:sid', () => {
  it('returns 409 when stage has active records', async () => {
    const db = buildDb([], { n: 2 });
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'delete', '/:id/stages/:sid')(
      req({ params: { id: 'p-1', sid: 's-1' } }), r, vi.fn()
    );
    expect(r.status).toHaveBeenCalledWith(409);
  });
  it('deletes stage when empty', async () => {
    const db = buildDb([], { n: 0 });
    const r = res();
    await handler(createPipelinesRouter(db as any, noop), 'delete', '/:id/stages/:sid')(
      req({ params: { id: 'p-1', sid: 's-1' } }), r, vi.fn()
    );
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});
