import { describe, it, expect, vi } from 'vitest';

function buildMockDb(tasks: object[], count: number) {
  const chain: Record<string, unknown> = {};
  const fns = ['selectFrom','where','selectAll','orderBy','limit','offset','select','execute','executeTakeFirstOrThrow'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(tasks);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count });
  return { selectFrom: vi.fn().mockReturnValue(chain), fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) } };
}

function buildReq(query: Record<string, string> = {}, userId = 'u1') {
  return { query, workspace: { id: 'ws1' }, user: { id: userId } };
}

function buildRes() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }) };
}

describe('GET /api/tasks — pagination', () => {
  it('returns pagination envelope with total/page/per_page', async () => {
    const fakeTasks = [{ id: 't1', title: 'Task 1' }];
    const db = buildMockDb(fakeTasks, 1);
    const { createTasksRouter } = await import('../routes/tasks');
    const router = createTasksRouter(db as never, () => (_req: unknown, _res: unknown, next: Function) => next());
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack[0]?.route?.stack[0]?.handle;
    expect(handler).toBeDefined();
    const req = buildReq();
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: fakeTasks, page: 1, per_page: 25, error: null,
    }));
  });

  it('returns 400 for invalid status value', async () => {
    const db = buildMockDb([], 0);
    const { createTasksRouter } = await import('../routes/tasks');
    const router = createTasksRouter(db as never, () => (_req: unknown, _res: unknown, next: Function) => next());
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack[0]?.route?.stack[0]?.handle;
    const req = buildReq({ status: 'invalid_status' });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for non-numeric page', async () => {
    const db = buildMockDb([], 0);
    const { createTasksRouter } = await import('../routes/tasks');
    const router = createTasksRouter(db as never, () => (_req: unknown, _res: unknown, next: Function) => next());
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack[0]?.route?.stack[0]?.handle;
    const req = buildReq({ page: 'abc' });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
