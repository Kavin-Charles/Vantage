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
    insertResult   = { id: 'c1', name: 'Alice', email: 'alice@example.com', status: 'prospect', workspace_id: 'ws1', owner_id: 'u1' },
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
    .mockResolvedValueOnce(insertResult)         // first call (create/import row)
    .mockResolvedValue({ count: countResult });  // subsequent (countAll)

  // transaction().execute(fn) → pass a trx that looks like the same chain
  const trxChain = makeChain({
    executeTakeFirst:        updateResult,
    executeTakeFirstOrThrow: insertResult,
    execute:                 [],
  });
  const transaction = {
    execute: vi.fn().mockImplementation((fn: Function) => fn(trxChain)),
  };

  const db: Record<string, unknown> = {
    selectFrom:  vi.fn().mockReturnValue(chain),
    insertInto:  vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom:  vi.fn().mockReturnValue(chain),
    transaction: vi.fn().mockReturnValue(transaction),
    fn:          { countAll: vi.fn().mockReturnValue(chain) },
  };

  return { db, chain, trxChain, transaction };
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
describe('GET /api/contacts', () => {
  it('returns paginated contact list with total', async () => {
    const fakeContacts = [{ id: 'c1', name: 'Alice', email: 'alice@example.com', status: 'prospect' }];
    const { db, chain } = buildDb({ selectListResult: fakeContacts, countResult: 1 });
    // main list query, then tagsByContactId, then lastActivityByContactId — each a separate execute() call
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce(fakeContacts)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 1 });

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    expect(handler).toBeDefined();

    const res = buildRes();
    await handler(buildReq({ query: {} }), res, vi.fn());
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({
      data: fakeContacts.map(c => ({ ...c, tags: [], last_activity: null })), page: 1, per_page: 25, error: null,
    }));
  });

  it('passes status filter to db query', async () => {
    const { db, chain } = buildDb({ countResult: 0 });
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 0 });

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    await handler(buildReq({ query: { status: 'customer' } }), buildRes(), vi.fn());
    expect(chain['where']).toHaveBeenCalledWith('status', '=', 'customer');
  });

  it('returns 400 for per_page > 100', async () => {
    const { db } = buildDb();
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');

    const res = buildRes();
    await handler(buildReq({ query: { per_page: '999' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('filters status=prospect when view=leads', async () => {
    const { db, chain } = buildDb({ countResult: 0 });
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 0 });

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    await handler(buildReq({ query: { view: 'leads' } }), buildRes(), vi.fn());
    expect(chain['where']).toHaveBeenCalledWith('contacts.status', '=', 'prospect');
  });

  it('view=active_deals builds its exists() subquery against pipeline_items, not the dropped deals table', async () => {
    const { db, chain } = buildDb({ countResult: 0 });
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 0 });

    // The real query builder invokes `.where(eb => ...)` callbacks with a
    // Kysely ExpressionBuilder; this shared-chain mock normally just returns
    // itself without calling the callback, so this test wires in a minimal
    // fake `eb` that records which table `.selectFrom()` is called on inside
    // that callback — the only way to see what the exists() subquery targets.
    const subqueryTables: string[] = [];
    const fakeSubBuilder = {
      select: () => fakeSubBuilder,
      whereRef: () => fakeSubBuilder,
      where: () => fakeSubBuilder,
    };
    const fakeEb = {
      exists: (x: unknown) => x,
      selectFrom: (table: string) => {
        subqueryTables.push(table);
        return fakeSubBuilder;
      },
      or: (arr: unknown) => arr,
    };
    chain['where'] = vi.fn((arg: unknown) => {
      if (typeof arg === 'function') (arg as (eb: unknown) => unknown)(fakeEb);
      return chain;
    });

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');
    await handler(buildReq({ query: { view: 'active_deals' } }), buildRes(), vi.fn());

    expect(subqueryTables).toContain('pipeline_items');
    expect(subqueryTables).not.toContain('deals');
  });

  it('attaches last_activity to each list row from the most recent activity', async () => {
    const fakeContacts = [{ id: 'c1', name: 'Alice', email: 'alice@example.com', status: 'prospect' }];
    const activityRows = [
      { contact_id: 'c1', type: 'call', body: 'Left a voicemail', created_at: new Date('2026-07-20T10:00:00.000Z') },
      { contact_id: 'c1', type: 'email', body: null, created_at: new Date('2026-07-18T10:00:00.000Z') },
    ];
    const { db, chain } = buildDb({ selectListResult: fakeContacts, countResult: 1 });
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce(fakeContacts)   // main list query
      .mockResolvedValueOnce([])             // tagsByContactId
      .mockResolvedValueOnce(activityRows);  // lastActivityByContactId
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 1 });

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/');

    const res = buildRes();
    await handler(buildReq({ query: {} }), res, vi.fn());
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({
      data: [{
        ...fakeContacts[0],
        tags: [],
        last_activity: { label: 'Left a voicemail', at: '2026-07-20T10:00:00.000Z' },
      }],
    }));
  });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------
describe('GET /api/contacts/:id', () => {
  it('returns 404 when not found', async () => {
    const { db } = buildDb({ selectResult: null });
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/:id');

    const res = buildRes();
    await handler(buildReq({ params: { id: 'nope' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it('returns contact data when found', async () => {
    const fakeContact = { id: 'c1', name: 'Alice', email: 'alice@example.com', workspace_id: 'ws1' };
    const { db } = buildDb({ selectResult: fakeContact });
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/:id');

    const res = buildRes();
    await handler(buildReq({ params: { id: 'c1' } }), res, vi.fn());
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({ data: { ...fakeContact, tags: [] }, error: null }));
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------
describe('POST /api/contacts', () => {
  it('returns 400 for invalid email', async () => {
    const { db } = buildDb();
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    await handler(buildReq({ body: { name: 'Alice', email: 'not-an-email' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('returns 400 for missing name', async () => {
    const { db } = buildDb();
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    await handler(buildReq({ body: { email: 'alice@example.com' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('returns 409 when duplicate email exists', async () => {
    const { db, chain } = buildDb({ selectResult: { id: 'existing' } });
    // dupe-check executeTakeFirst → returns existing record
    chain['executeTakeFirst'] = vi.fn().mockResolvedValue({ id: 'existing' });

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    await handler(buildReq({ body: { name: 'Alice', email: 'alice@example.com' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(409);
  });

  it('creates contact via transaction when no duplicate', async () => {
    const newContact = { id: 'c1', name: 'Alice', email: 'new@example.com', status: 'prospect', workspace_id: 'ws1', owner_id: 'u1' };
    const { db, chain, trxChain } = buildDb({ selectResult: null, insertResult: newContact });
    // dupe-check → null
    chain['executeTakeFirst'] = vi.fn().mockResolvedValue(null);
    // transaction insert → newContact
    trxChain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(newContact);

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    await handler(buildReq({ body: { name: 'Alice', email: 'new@example.com', status: 'prospect' } }), res, vi.fn());
    expect(db['transaction']).toHaveBeenCalled();
    expect(res['status']).toHaveBeenCalledWith(201);
  });

  it('accepts title and social_links and returns them in the created contact', async () => {
    const socialLinks = { linkedin: 'https://linkedin.com/in/alice', twitter: 'https://twitter.com/alice' };
    const newContact = {
      id: 'c1', name: 'Alice', email: 'new@example.com', status: 'prospect',
      title: 'VP of Sales', social_links: socialLinks,
      workspace_id: 'ws1', owner_id: 'u1',
    };
    const { db, chain, trxChain } = buildDb({ selectResult: null, insertResult: newContact });
    chain['executeTakeFirst'] = vi.fn().mockResolvedValue(null); // dupe-check → none
    trxChain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(newContact);

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/', 'post');

    const res = buildRes();
    await handler(buildReq({
      body: { name: 'Alice', email: 'new@example.com', status: 'prospect', title: 'VP of Sales', social_links: socialLinks },
    }), res, vi.fn());

    expect(res['status']).toHaveBeenCalledWith(201);
    // the insert values passed to the trx must include title/social_links
    expect(trxChain['values']).toHaveBeenCalledWith(expect.objectContaining({
      title: 'VP of Sales',
      social_links: socialLinks,
    }));
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: 'VP of Sales', social_links: socialLinks }),
      error: null,
    }));
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id — soft delete
// ---------------------------------------------------------------------------
describe('DELETE /api/contacts/:id', () => {
  it('returns 404 when contact does not exist', async () => {
    const { db } = buildDb({ updateResult: null });
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/:id', 'delete');
    expect(handler).toBeDefined();

    const res = buildRes();
    await handler(buildReq({ params: { id: 'nonexistent' } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it('wraps soft-delete in a transaction (never hard-deletes)', async () => {
    const fakeContact = { id: 'c1', name: 'Alice' };
    const { db, trxChain } = buildDb({ updateResult: fakeContact });
    trxChain['executeTakeFirst'] = vi.fn().mockResolvedValue(fakeContact);

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getHandler(router, '/:id', 'delete');

    const res = buildRes();
    await handler(buildReq({ params: { id: 'c1' } }), res, vi.fn());

    // must use transaction
    expect(db['transaction']).toHaveBeenCalled();
    // must NOT hard-delete
    expect(db['deleteFrom']).not.toHaveBeenCalled();
    expect(res['json']).toHaveBeenCalledWith(expect.objectContaining({ data: { success: true } }));
  });
});

// ---------------------------------------------------------------------------
// POST /import
// ---------------------------------------------------------------------------
describe('POST /api/contacts/import', () => {
  function getImportHandler(router: unknown) {
    return getHandler(router, '/import', 'post');
  }

  it('returns 400 when rows exceeds 1000', async () => {
    const { db } = buildDb();
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getImportHandler(router);

    const rows = Array.from({ length: 1001 }, (_, i) => ({
      name: `User ${i}`, email: `user${i}@example.com`, status: 'prospect',
    }));
    const res = buildRes();
    await handler(buildReq({ body: { rows } }), res, vi.fn());
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('reports validation errors without hitting DB', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn().mockResolvedValue([]); // no existing emails

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getImportHandler(router);

    const res = buildRes();
    await handler(buildReq({ body: { rows: [{ name: 'Bad', email: 'not-an-email', status: 'prospect' }] } }), res, vi.fn());

    expect(db['transaction']).not.toHaveBeenCalled();
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.data.errors).toContainEqual(expect.stringContaining('not-an-email'));
    expect(arg.data.created).toBe(0);
  });

  it('dedupes existing emails and reports them as errors', async () => {
    const { db, chain } = buildDb();
    // Simulate one existing email in the workspace
    chain['execute'] = vi.fn().mockResolvedValue([{ email: 'existing@example.com' }]);

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getImportHandler(router);

    const res = buildRes();
    await handler(buildReq({
      body: {
        rows: [
          { name: 'New',  email: 'new@example.com',      status: 'prospect' },
          { name: 'Dupe', email: 'existing@example.com', status: 'prospect' },
        ],
      },
    }), res, vi.fn());

    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg.data.errors).toHaveLength(1);
    expect(arg.data.errors[0]).toMatch(/existing@example\.com/);
  });

  it('inserts valid rows in a single transaction', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn().mockResolvedValue([]); // no existing emails

    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const handler = getImportHandler(router);

    const res = buildRes();
    await handler(buildReq({
      body: {
        rows: [
          { name: 'Alice', email: 'alice@example.com', status: 'prospect' },
          { name: 'Bob',   email: 'bob@example.com',   status: 'customer' },
        ],
      },
    }), res, vi.fn());

    expect(db['transaction']).toHaveBeenCalledTimes(1);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bridge: contacts.delete must soft-delete
// ---------------------------------------------------------------------------
describe('contacts bridge — contacts.delete', () => {
  it('uses updateTable (soft-delete), not deleteFrom (hard-delete)', async () => {
    const methods: Record<string, Function> = {};
    let regCalls = 0;

    vi.doMock('@vencore/plugin-runtime', () => ({
      bridgeRegistry: {
        register: vi.fn((name: string, _perm: string, fn: Function) => {
          methods[name] = fn;
          regCalls++;
          return { register: vi.fn((n2: string, _p: string, f2: Function) => {
            methods[n2] = f2;
            return { register: vi.fn((n3: string, _p: string, f3: Function) => {
              methods[n3] = f3;
              return { register: vi.fn((n4: string, _p: string, f4: Function) => {
                methods[n4] = f4;
                return { register: vi.fn((n5: string, _p: string, f5: Function) => {
                  methods[n5] = f5;
                }) };
              }) };
            }) };
          }) };
        }),
      },
    }));

    const mod = await import('../routes/contacts?bridge-test');
    mod.registerContactsBridgeMethods();

    const deleteFn = methods['contacts.delete'];
    expect(deleteFn).toBeDefined();

    const { db, trxChain } = buildDb({ updateResult: { id: 'c1' } });
    trxChain['executeTakeFirst'] = vi.fn().mockResolvedValue({ id: 'c1' });

    await deleteFn({ workspaceId: 'ws1' }, { id: 'c1' }, db);

    expect(db['transaction']).toHaveBeenCalled();
    expect(db['deleteFrom']).not.toHaveBeenCalled();
  });
});
