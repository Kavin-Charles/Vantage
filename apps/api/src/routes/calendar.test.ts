import { describe, it, expect, vi } from 'vitest';
import { createCalendarRouter } from './calendar';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

function buildMockDb(rows: unknown[] = [], single?: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'values', 'set',
    'where', 'select', 'selectAll', 'orderBy', 'limit', 'offset',
    'returning', 'returningAll', 'execute', 'executeTakeFirst', 'executeTakeFirstOrThrow',
  ];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  (chain['execute'] as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
  (chain['executeTakeFirst'] as ReturnType<typeof vi.fn>).mockResolvedValue(single ?? rows[0]);
  (chain['executeTakeFirstOrThrow'] as ReturnType<typeof vi.fn>).mockResolvedValue(single ?? rows[0]);
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom: vi.fn().mockReturnValue(chain),
  } as unknown as Kysely<Database>;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    workspace: { id: 'ws-1' },
    user: { id: 'u-1', role: 'admin' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function getHandler(
  router: ReturnType<typeof createCalendarRouter>,
  method: string,
  path: string,
) {
  const stack = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack;
  const layer = stack.find(l => l.route?.path === path && l.route?.methods[method.toLowerCase()]);
  return layer!.route!.stack[layer!.route!.stack.length - 1]!.handle;
}

describe('GET /api/calendar/events', () => {
  it('returns events for date range', async () => {
    const event = { id: 'e-1', title: 'Xmas', start_date: '2026-12-25' };
    const db = buildMockDb([event]);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'get', '/');
    const req = mockReq({ query: { start: '2026-12-01', end: '2026-12-31' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [event] }));
  });

  it('returns 400 if start or end missing', async () => {
    const db = buildMockDb([]);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'get', '/');
    const req = mockReq({ query: {} });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/calendar/events', () => {
  it('creates event and returns 201', async () => {
    const created = { id: 'e-2', title: 'Team Day', category: 'company_event', start_date: '2026-06-01' };
    const db = buildMockDb([], created);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'post', '/');
    const req = mockReq({ body: { title: 'Team Day', category: 'company_event', start_date: '2026-06-01' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: created }));
  });

  it('returns 403 for non-admin', async () => {
    const db = buildMockDb([]);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'post', '/');
    const req = mockReq({ user: { id: 'u-2', role: 'member' }, body: { title: 'x', category: 'other', start_date: '2026-06-01' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 for invalid body', async () => {
    const db = buildMockDb([]);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'post', '/');
    const req = mockReq({ body: { title: '' } }); // empty title + missing category/start_date
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('PATCH /api/calendar/events/:id', () => {
  it('updates event and returns it', async () => {
    const updated = { id: 'e-1', title: 'Updated', category: 'meeting', start_date: '2026-06-01' };
    const db = buildMockDb([], updated);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'patch', '/:id');
    const req = mockReq({ params: { id: 'e-1' }, body: { title: 'Updated' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: updated }));
  });

  it('returns 403 for non-admin', async () => {
    const db = buildMockDb([]);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'patch', '/:id');
    const req = mockReq({ user: { id: 'u-2', role: 'member' }, params: { id: 'e-1' }, body: { title: 'x' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when event not found', async () => {
    const db = buildMockDb([], undefined);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'patch', '/:id');
    const req = mockReq({ params: { id: 'missing' }, body: { title: 'x' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('DELETE /api/calendar/events/:id', () => {
  it('deletes event and returns 200', async () => {
    const deleted = { id: 'e-1', title: 'Xmas' };
    const db = buildMockDb([], deleted);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'delete', '/:id');
    const req = mockReq({ params: { id: 'e-1' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: null, error: null });
  });

  it('returns 403 for non-admin', async () => {
    const db = buildMockDb([]);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'delete', '/:id');
    const req = mockReq({ user: { id: 'u-2', role: 'member' }, params: { id: 'e-1' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when event not found', async () => {
    const db = buildMockDb([], undefined);
    const router = createCalendarRouter(db);
    const handler = getHandler(router, 'delete', '/:id');
    const req = mockReq({ params: { id: 'missing' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
