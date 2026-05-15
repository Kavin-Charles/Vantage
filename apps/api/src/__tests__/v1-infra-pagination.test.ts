import { describe, it, expect, vi } from 'vitest';

function buildMockDb(rows: object[], count: number) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom','where','selectAll','orderBy','limit','offset','select','execute','executeTakeFirstOrThrow']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count });
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

describe('GET /v1/servers — pagination', () => {
  it('returns pagination envelope', async () => {
    const servers = [{ id: 's1', name: 'prod' }];
    const db = buildMockDb(servers, 1);
    const { createV1InfraRouter } = await import('../routes/v1/infra');
    const router = createV1InfraRouter(db as never);

    const serversRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/servers');
    const handler = serversRoute!.route.stack[0]!.handle;

    const req = { query: {}, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: servers, total: 1, page: 1, per_page: 25, error: null }),
    );
  });

  it('rejects per_page > 100', async () => {
    const db = buildMockDb([], 0);
    const { createV1InfraRouter } = await import('../routes/v1/infra');
    const router = createV1InfraRouter(db as never);
    const serversRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/servers');
    const handler = serversRoute!.route.stack[0]!.handle;
    const req = { query: { per_page: '200' }, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /v1/websites — pagination', () => {
  it('returns pagination envelope', async () => {
    const websites = [{ id: 'w1', url: 'https://example.com' }];
    const db = buildMockDb(websites, 1);
    const { createV1InfraRouter } = await import('../routes/v1/infra');
    const router = createV1InfraRouter(db as never);

    const websitesRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/websites');
    const handler = websitesRoute!.route.stack[0]!.handle;

    const req = { query: {}, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: websites, total: 1, page: 1, per_page: 25, error: null }),
    );
  });
});
