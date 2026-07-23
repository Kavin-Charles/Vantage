import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Infinite self-referential chain — handles any depth of fluent calls
// ---------------------------------------------------------------------------
function makeChain(leafValues: Record<string, unknown> = {}): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const FLUENT = ['selectFrom','insertInto','updateTable','deleteFrom','where','selectAll','select',
                  'orderBy','limit','offset','values','set','returningAll','fn','countAll','as','innerJoin'];
  for (const m of FLUENT) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(leafValues['execute'] ?? []);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirst'] ?? undefined);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirstOrThrow'] ?? {});
  return chain;
}

function buildDb(opts: {
  selectResult?: unknown;          // executeTakeFirst result
  selectListResult?: unknown[];    // execute result for list queries
  countResult?: number;
  insertResult?: unknown;
  updateResult?: unknown;
} = {}) {
  const {
    selectResult   = undefined,
    selectListResult = [],
    countResult    = 0,
    insertResult   = { id: 'co1', name: 'Acme', workspace_id: 'ws1', status: 'active' },
    updateResult   = undefined,
  } = opts;

  // One chain shared across the whole db mock — any fluent method just returns self
  const chain = makeChain({
    executeTakeFirst:        selectResult,
    executeTakeFirstOrThrow: insertResult,
    execute:                 selectListResult,
  });
  // Override count query result
  chain['executeTakeFirstOrThrow'] = vi.fn()
    .mockResolvedValueOnce(insertResult)         // first call (create row)
    .mockResolvedValue({ count: countResult });  // subsequent (countAll)

  const db: Record<string, unknown> = {
    selectFrom:  vi.fn().mockReturnValue(chain),
    insertInto:  vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom:  vi.fn().mockReturnValue(chain),
    fn:          { countAll: vi.fn().mockReturnValue(chain) },
  };

  // updateResult is used by PATCH handler's executeTakeFirst
  if (updateResult !== undefined) {
    chain['executeTakeFirst'] = vi.fn().mockResolvedValue(updateResult);
  }

  return { db, chain };
}

const noopPermission = () => (_req: unknown, _res: unknown, next: Function) => next();

function buildReq(overrides: Record<string, unknown> = {}) {
  return {
    body:      {},
    params:    {},
    query:     {},
    workspace: { id: 'ws1' },
    user:      { id: 'u1', role: 'admin' },
    ...overrides,
  };
}

function buildRes() {
  const res: Record<string, unknown> = {};
  res['json']      = vi.fn();
  res['status']    = vi.fn().mockReturnValue(res);
  res['setHeader'] = vi.fn();
  res['send']      = vi.fn();
  return res;
}

function getHandler(
  router: unknown,
  path: string,
  method: 'get' | 'post' | 'patch' | 'delete' = 'get',
) {
  const stack = (router as {
    stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[];
  }).stack;
  const layer = stack.find(s => s.route?.path === path && s.route?.methods[method]);
  const handlers = layer?.route?.stack ?? [];
  return handlers[handlers.length - 1]?.handle;
}

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------
describe('GET /api/companies', () => {
  it('returns paginated company list with total and size_band on each row', async () => {
    const fakeCompanies = [
      { id: 'co1', name: 'Acme', employee_count: 5, status: 'active' },
      { id: 'co2', name: 'Globex', employee_count: 2000, status: 'active' },
    ];
    const { db, chain } = buildDb({ selectListResult: fakeCompanies, countResult: 2 });
    chain['execute'] = vi.fn().mockResolvedValueOnce(fakeCompanies);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 2 });

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    expect(handler).toBeDefined();

    const res = buildRes();
    await handler(buildReq({ query: {} }), res, vi.fn());

    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        { ...fakeCompanies[0], size_band: 'startup' },
        { ...fakeCompanies[1], size_band: 'enterprise' },
      ],
      total: 2,
      page: 1,
      per_page: 25,
      error: null,
    }));
  });

  it('bands a null employee_count as smb', async () => {
    const fakeCompanies = [{ id: 'co1', name: 'Acme', employee_count: null, status: 'active' }];
    const { db, chain } = buildDb({ selectListResult: fakeCompanies, countResult: 1 });
    chain['execute'] = vi.fn().mockResolvedValueOnce(fakeCompanies);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 1 });

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');

    const res = buildRes();
    await handler(buildReq({ query: {} }), res, vi.fn());
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({
      data: [{ ...fakeCompanies[0], size_band: 'smb' }],
    }));
  });

  it('returns 400 for per_page > 100', async () => {
    const { db } = buildDb();
    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');

    const res = buildRes();
    await handler(buildReq({ query: { per_page: '999' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('filters employee_count >= 1000 when view=enterprise', async () => {
    const { db, chain } = buildDb({ countResult: 0 });
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 0 });

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    await handler(buildReq({ query: { view: 'enterprise' } }), buildRes(), vi.fn());
    expect(chain['where']).toHaveBeenCalledWith('employee_count', '>=', 1000);
  });

  it('filters employee_count < 20 when view=startup', async () => {
    const { db, chain } = buildDb({ countResult: 0 });
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 0 });

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    await handler(buildReq({ query: { view: 'startup' } }), buildRes(), vi.fn());
    expect(chain['where']).toHaveBeenCalledWith('employee_count', '<', 20);
  });

  it('filters status=active when view=active', async () => {
    const { db, chain } = buildDb({ countResult: 0 });
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 0 });

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    await handler(buildReq({ query: { view: 'active' } }), buildRes(), vi.fn());
    expect(chain['where']).toHaveBeenCalledWith('status', '=', 'active');
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------
describe('POST /api/companies', () => {
  it('creates a company with status and annual_revenue', async () => {
    const newCompany = {
      id: 'co1', name: 'Acme', workspace_id: 'ws1',
      status: 'prospect', annual_revenue: 500000,
    };
    const { db, chain } = buildDb({ insertResult: newCompany });
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(newCompany);

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    await handler(buildReq({
      body: { name: 'Acme', status: 'prospect', annual_revenue: 500000 },
    }), res, vi.fn());

    expect(res['status']).toHaveBeenCalledWith(201);
    expect(chain['values']).toHaveBeenCalledWith(expect.objectContaining({
      status: 'prospect',
      annual_revenue: 500000,
    }));
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'prospect', annual_revenue: 500000 }),
      error: null,
    }));
  });

  it('defaults status to active when omitted', async () => {
    const newCompany = { id: 'co1', name: 'Acme', workspace_id: 'ws1', status: 'active' };
    const { db, chain } = buildDb({ insertResult: newCompany });
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(newCompany);

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    await handler(buildReq({ body: { name: 'Acme' } }), res, vi.fn());

    expect(chain['values']).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('forwards a validation error to next() for missing name', async () => {
    // companies.ts uses Zod's throwing .parse() (unlike contacts.ts's safeParse), so
    // invalid input is routed to next(err) for the error-handling middleware, not a
    // direct res.status(400) call.
    const { db } = buildDb();
    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    const next = vi.fn();
    await handler(buildReq({ body: { status: 'active' } }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id
// ---------------------------------------------------------------------------
describe('PATCH /api/companies/:id', () => {
  it('updates status and annual_revenue', async () => {
    const updated = { id: 'co1', name: 'Acme', status: 'churned', annual_revenue: 0 };
    const { db, chain } = buildDb({ updateResult: updated });

    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/:id', 'patch');

    const res = buildRes();
    await handler(buildReq({
      params: { id: 'co1' },
      body: { status: 'churned', annual_revenue: 0 },
    }), res, vi.fn());

    expect(chain['set']).toHaveBeenCalledWith(expect.objectContaining({
      status: 'churned',
      annual_revenue: 0,
    }));
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({ data: updated, error: null }));
  });

  it('returns 404 when company does not exist', async () => {
    const { db } = buildDb({ updateResult: null });
    const { createCompaniesRouter } = await import('../routes/companies');
    const router = createCompaniesRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/:id', 'patch');

    const res = buildRes();
    await handler(buildReq({ params: { id: 'nope' }, body: { status: 'active' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(404);
  });
});
