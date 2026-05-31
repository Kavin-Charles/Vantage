import { describe, it, expect, vi } from 'vitest';

function buildMockDb(rows: object[] = [], single: object | null = null) {
  const chain: Record<string, unknown> = {};
  const methods = ['selectFrom','insertInto','updateTable','deleteFrom','where','selectAll',
    'select','orderBy','limit','offset','values','set','returningAll'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(single);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: rows.length });
  return chain as unknown;
}

describe('GET /api/deployments', () => {
  it('returns deployments scoped to workspace', async () => {
    const deployment = { id: 'd1', workspace_id: 'ws1', status: 'success', source: 'webhook', name: 'api', environment: 'production', created_at: new Date() };
    const db = buildMockDb([deployment]);
    const { createDeploymentsRouter } = await import('../routes/deployments');
    const router = createDeploymentsRouter(db as never);

    const listRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/');
    const handler = listRoute!.route.stack[0]!.handle;

    const req = { query: {}, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [deployment], error: null }),
    );
  });
});

describe('POST /api/deployments', () => {
  it('creates a deployment and returns 201', async () => {
    const created = { id: 'd2', workspace_id: 'ws1', status: 'success', source: 'manual', name: 'web', environment: 'staging', created_at: new Date() };
    const db = buildMockDb([], created);
    const { createDeploymentsRouter } = await import('../routes/deployments');
    const router = createDeploymentsRouter(db as never);

    const handlers = (router as unknown as { stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack
      .filter(s => s.route?.path === '/');
    const postHandler = handlers.find(s => s.route.methods['post'])?.route.stack[0]?.handle;

    const req = { body: { status: 'success', source: 'manual', name: 'web', environment: 'staging' }, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await postHandler!(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: created, error: null }));
  });
});

describe('PATCH /api/deployments/:id — 404 on missing', () => {
  it('returns 404 when deployment not in workspace', async () => {
    const db = buildMockDb([], null);
    const { createDeploymentsRouter } = await import('../routes/deployments');
    const router = createDeploymentsRouter(db as never);

    const patchRoute = (router as unknown as { stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/:id' && s.route.methods['patch']);
    const handler = patchRoute!.route.stack[0]!.handle;

    const req = { params: { id: 'nonexistent' }, body: { status: 'success' }, workspace: { id: 'ws1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
