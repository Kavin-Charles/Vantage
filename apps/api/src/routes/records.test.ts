import { describe, it, expect, vi } from 'vitest';
import { createRecordsRouter } from './records';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

function buildMockDb(rows: unknown[] = [], single?: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['selectFrom','insertInto','updateTable','values','set','where','select',
    'selectAll','orderBy','limit','offset','returning','returningAll',
    'execute','executeTakeFirst','executeTakeFirstOrThrow'];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(single ?? rows[0]);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(single ?? rows[0] ?? { id: 'new-id' });
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

function mockReq(overrides = {}) {
  return {
    workspace: { id: 'ws-1' },
    user: { id: 'user-1', role: 'admin' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as import('express').Request;
}

function mockRes() {
  const res = { json: vi.fn(), status: vi.fn() } as unknown as import('express').Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function getHandler(router: ReturnType<typeof createRecordsRouter>, method: string, path: string) {
  const stack = (router as unknown as { stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack;
  const layer = stack.find(s => s.route?.path === path && s.route?.methods[method]);
  return layer!.route.stack[layer!.route.stack.length - 1]!.handle;
}

describe('GET /', () => {
  it('returns records for workspace', async () => {
    const records = [{ id: 'rec-1', name: 'Test Record' }];
    const db = buildMockDb(records);
    const router = createRecordsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'get', '/');
    const req = mockReq({ query: { record_type_id: '00000000-0000-0000-0000-000000000001' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('GET /:id', () => {
  it('returns 404 when not found', async () => {
    const db = buildMockDb([], undefined);
    const router = createRecordsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'get', '/:id');
    const req = mockReq({ params: { id: 'missing' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /', () => {
  it('creates record and returns it', async () => {
    const created = { id: 'rec-new', name: 'New Record', record_number: null };
    const db = buildMockDb([], created);
    const router = createRecordsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'post', '/');
    const req = mockReq({
      body: {
        record_type_id: '00000000-0000-0000-0000-000000000001',
        pipeline_id: '00000000-0000-0000-0000-000000000002',
        stage_id: '00000000-0000-0000-0000-000000000003',
        name: 'New Record',
        owner_id: '00000000-0000-0000-0000-000000000004',
      },
    });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });

  it('rejects missing required fields', async () => {
    const db = buildMockDb();
    const router = createRecordsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'post', '/');
    const req = mockReq({ body: { name: 'Missing type' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
