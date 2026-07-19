import { describe, it, expect, vi } from 'vitest';
import { createSessionRolesRouter } from '../routes/session-roles';

// ---------------------------------------------------------------------------
// Infinite self-referential chain — handles any depth of fluent calls
// ---------------------------------------------------------------------------
function makeChain(leafValues: Record<string, unknown> = {}): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const FLUENT = ['selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'where', 'selectAll', 'select',
                  'orderBy', 'limit', 'offset', 'values', 'set', 'returningAll', 'returning', 'fn', 'countAll', 'as',
                  'innerJoin', 'leftJoin', 'onRef', 'on', 'groupBy', 'onConflict', 'columns', 'doNothing', 'doUpdateSet'];
  for (const m of FLUENT) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(leafValues['execute'] ?? []);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirst'] ?? undefined);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirstOrThrow'] ?? {});
  return chain;
}

function buildDb() {
  const chain = makeChain();
  const db: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue(chain) },
  };
  return { db, chain };
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    workspace: { id: 'ws1' },
    user: { id: 'u1' },
    ...overrides,
  };
}

function buildRes() {
  const res: Record<string, unknown> = {};
  res['json'] = vi.fn();
  res['status'] = vi.fn().mockReturnValue(res);
  return res;
}

/** Collects the full effective middleware chain for `method path`: router.use() layers + route handlers, in order. */
function getFullStack(
  router: unknown,
  path: string,
  method: 'get' | 'put',
): Function[] {
  const stack = (router as {
    stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] }; handle: Function }[];
  }).stack;
  const useHandlers = stack.filter(s => !s.route).map(s => s.handle);
  const routeLayer = stack.find(s => s.route?.path === path && s.route?.methods[method]);
  const routeHandlers = (routeLayer?.route?.stack ?? []).map(s => s.handle);
  return [...useHandlers, ...routeHandlers];
}

/** Runs a middleware chain the way Express would: each fn gets `next` to advance. */
async function runStack(handlers: Function[], req: unknown, res: unknown): Promise<void> {
  let i = 0;
  const next = async (err?: unknown): Promise<void> => {
    if (err) throw err;
    const h = handlers[i++];
    if (h) await h(req, res, next);
  };
  await next();
}

const roleR1 = '11111111-1111-1111-1111-111111111111';
const roleR2 = '22222222-2222-2222-2222-222222222222';
const foreignRole = '99999999-9999-9999-9999-999999999999';

// ---------------------------------------------------------------------------
// GET /api/me/active-roles
// ---------------------------------------------------------------------------
describe('GET /api/me/active-roles', () => {
  it("lists the caller's assigned roles with active flags", async () => {
    const rows = [
      { id: roleR1, name: 'Member', active: true },
      { id: roleR2, name: 'Auditor', active: null },
    ];
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn().mockResolvedValueOnce(rows);

    const router = createSessionRolesRouter(db as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'get'), buildReq(), res);

    expect(res['json']).toHaveBeenCalledWith({
      data: {
        assigned: [
          { id: roleR1, name: 'Member', active: true },
          { id: roleR2, name: 'Auditor', active: false },
        ],
      },
      error: null,
    });
    // The query must key on the caller's own user id, never a value from params/body.
    expect(chain['where']).toHaveBeenCalledWith('ur.user_id', '=', 'u1');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/me/active-roles
// ---------------------------------------------------------------------------
describe('PUT /api/me/active-roles', () => {
  it('returns 400 for a malformed body', async () => {
    const { db } = buildDb();
    const router = createSessionRolesRouter(db as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'put'), buildReq({ body: { roleIds: 'nope' } }), res);
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('deactivates all roles when roleIds is empty', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ role_id: roleR1 }, { role_id: roleR2 }]) // assigned roles
      .mockResolvedValueOnce([])                                          // loadInheritanceEdges
      .mockResolvedValueOnce([]);                                         // loadDsdSets — no sets
    const trx = { ...chain, insertInto: vi.fn().mockReturnValue(chain) };
    const txExecute = vi.fn().mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn(trx));
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createSessionRolesRouter(db as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'put'), buildReq({ body: { roleIds: [] } }), res);

    expect(txExecute).toHaveBeenCalled();
    expect(trx.insertInto).toHaveBeenCalledWith('user_session_roles');
    const valuesArgs = (chain['values'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(valuesArgs).toContainEqual({ user_id: 'u1', role_id: roleR1, active: false });
    expect(valuesArgs).toContainEqual({ user_id: 'u1', role_id: roleR2, active: false });
    expect(res['json']).toHaveBeenCalledWith({ data: { active: [] }, error: null });
  });

  it('activates a requested, assigned role', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ role_id: roleR1 }]) // assigned roles
      .mockResolvedValueOnce([])                     // loadInheritanceEdges
      .mockResolvedValueOnce([]);                    // loadDsdSets — no sets
    const trx = { ...chain, insertInto: vi.fn().mockReturnValue(chain) };
    const txExecute = vi.fn().mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn(trx));
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createSessionRolesRouter(db as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'put'), buildReq({ body: { roleIds: [roleR1] } }), res);

    expect(res['json']).toHaveBeenCalledWith({ data: { active: [roleR1] }, error: null });
    const valuesArgs = (chain['values'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(valuesArgs).toContainEqual({ user_id: 'u1', role_id: roleR1, active: true });
  });

  it("ignores a role the caller isn't assigned (foreign/cross-tenant id has no effect)", async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ role_id: roleR1 }]) // assigned roles — foreignRole not among them
      .mockResolvedValueOnce([])                     // loadInheritanceEdges
      .mockResolvedValueOnce([]);                    // loadDsdSets — no sets
    const trx = { ...chain, insertInto: vi.fn().mockReturnValue(chain) };
    const txExecute = vi.fn().mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn(trx));
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createSessionRolesRouter(db as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'put'), buildReq({ body: { roleIds: [foreignRole] } }), res);

    // Foreign role was filtered out before the DSD check / write — nothing gets activated.
    expect(res['json']).toHaveBeenCalledWith({ data: { active: [] }, error: null });
    const valuesArgs = (chain['values'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(valuesArgs).toContainEqual({ user_id: 'u1', role_id: roleR1, active: false });
    expect(valuesArgs.some(v => (v as { role_id: string }).role_id === foreignRole)).toBe(false);
  });

  it('returns 409 DSD_CONFLICT and performs no write when the requested active set violates a DSD set', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ role_id: roleR1 }, { role_id: roleR2 }]) // assigned roles
      .mockResolvedValueOnce([])                                          // loadInheritanceEdges
      .mockResolvedValueOnce([{ id: 'set1', name: 'Segregated', cardinality: 2 }]) // dsd_sets
      .mockResolvedValueOnce([{ role_id: roleR1 }, { role_id: roleR2 }]);          // dsd_set_roles for set1
    const txExecute = vi.fn();
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createSessionRolesRouter(db as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'put'), buildReq({ body: { roleIds: [roleR1, roleR2] } }), res);

    expect(res['status']).toHaveBeenCalledWith(409);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('DSD_CONFLICT');
    expect(arg.error.conflicts).toEqual([{ setId: 'set1', name: 'Segregated' }]);
    expect(txExecute).not.toHaveBeenCalled();
  });
});
