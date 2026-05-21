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
