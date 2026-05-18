import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createRecordTypesRouter } from './record-types';

function buildMockDb(rows: unknown[] = [], single?: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['selectFrom','insertInto','updateTable','deleteFrom','values','set',
    'where','select','selectAll','orderBy','returning','returningAll',
    'execute','executeTakeFirst','executeTakeFirstOrThrow','limit','offset'];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(single ?? rows[0]);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(single ?? rows[0] ?? { id: 'new-id' });
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    workspace: { id: 'ws-1' },
    user: { id: 'user-1', role: 'admin' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = { json: vi.fn(), status: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function getHandler(router: ReturnType<typeof createRecordTypesRouter>, method: string, path: string) {
  const stack = (router as unknown as { stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack;
  const layer = stack.find(s => s.route?.path === path && s.route?.methods[method]);
  return layer!.route.stack[layer!.route.stack.length - 1]!.handle;
}

describe('GET /', () => {
  it('returns record types for workspace', async () => {
    const db = buildMockDb([{ id: 'rt-1', name: 'Deal' }]);
    const router = createRecordTypesRouter(db as never);
    const handler = getHandler(router, 'get', '/');
    const req = mockReq();
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 'rt-1', name: 'Deal' }], error: null });
  });
});

describe('POST /', () => {
  it('creates record type with default permissions', async () => {
    const db = buildMockDb([], { id: 'rt-new', name: 'Enquiry' });
    const router = createRecordTypesRouter(db as never);
    const handler = getHandler(router, 'post', '/');
    const req = mockReq({ body: { name: 'Enquiry', icon: '📋', color: '#6b665c' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });

  it('rejects missing name', async () => {
    const db = buildMockDb();
    const router = createRecordTypesRouter(db as never);
    const handler = getHandler(router, 'post', '/');
    const req = mockReq({ body: {} });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('DELETE /:id', () => {
  it('returns 409 when records exist', async () => {
    const db = buildMockDb([{ count: '1' }]);
    const router = createRecordTypesRouter(db as never);
    const handler = getHandler(router, 'delete', '/:id');
    const req = mockReq({ params: { id: 'rt-1' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
