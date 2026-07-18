import { describe, it, expect, vi } from 'vitest';
import { createUserRolesRouter } from '../routes/user-roles';

// ---------------------------------------------------------------------------
// Infinite self-referential chain — handles any depth of fluent calls
// (mirrors apps/api/src/__tests__/roles-route.test.ts)
// ---------------------------------------------------------------------------
function makeChain(leafValues: Record<string, unknown> = {}): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const FLUENT = ['selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'where', 'selectAll', 'select',
                  'orderBy', 'limit', 'offset', 'values', 'set', 'returningAll', 'returning', 'fn', 'countAll', 'as',
                  'innerJoin', 'leftJoin', 'groupBy', 'onConflict', 'columns', 'doNothing', 'doUpdateSet'];
  for (const m of FLUENT) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(leafValues['execute'] ?? []);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirst'] ?? undefined);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirstOrThrow'] ?? {});
  return chain;
}

function buildDb(opts: { selectResult?: unknown; execute?: unknown[] } = {}) {
  const { selectResult = undefined, execute = [] } = opts;
  const chain = makeChain({ executeTakeFirst: selectResult, execute });
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
    user: { id: 'caller1' },
    ...overrides,
  };
}

function buildRes() {
  const res: Record<string, unknown> = {};
  res['json'] = vi.fn();
  res['status'] = vi.fn().mockReturnValue(res);
  return res;
}

const allowPermission = () => vi.fn((_permission: string) =>
  (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next());

/** Collects the full effective middleware chain for `method path`: router.use() layers + route handlers, in order. */
function getFullStack(
  router: unknown,
  path: string,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
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

const userId = '11111111-1111-1111-1111-111111111111';
const memberRoleId = '22222222-2222-2222-2222-222222222222';
const payRoleId = '33333333-3333-3333-3333-333333333333';
const approveRoleId = '44444444-4444-4444-4444-444444444444';
const foreignRoleId = '55555555-5555-5555-5555-555555555555';

// ---------------------------------------------------------------------------
// GET /api/users/:id/roles
// ---------------------------------------------------------------------------
describe('GET /api/users/:id/roles', () => {
  it('returns 404 when the target user is not in the caller workspace', async () => {
    const { db } = buildDb({ selectResult: undefined });
    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'get'), buildReq({ params: { id: userId } }), res);
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it('returns roleIds, isAdmin, and grouped effective permissions', async () => {
    const { db, chain } = buildDb({ selectResult: { id: userId } });
    // Query order: assigned user_roles -> loadInheritanceEdges -> grantsAll roles -> role_permissions for closure
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ role_id: memberRoleId }])   // assigned
      .mockResolvedValueOnce([])                             // loadInheritanceEdges
      .mockResolvedValueOnce([])                             // grants_all roles (none => not admin)
      .mockResolvedValueOnce([{ permission: 'contacts:view' }]); // role_permissions for closure

    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'get'), buildReq({ params: { id: userId } }), res);

    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error).toBeNull();
    expect(arg.data.roleIds).toEqual([memberRoleId]);
    expect(arg.data.isAdmin).toBe(false);
    const crm = arg.data.modules.find((m: { id: string }) => m.id === 'crm');
    const contactsView = crm.groups.flatMap((g: { permissions: { key: string; granted: boolean }[] }) => g.permissions)
      .find((p: { key: string }) => p.key === 'contacts:view');
    expect(contactsView.granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id/roles
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id/roles', () => {
  it('returns 404 when the target user is not in the caller workspace', async () => {
    const { db } = buildDb({ selectResult: undefined });
    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'put'),
      buildReq({ params: { id: userId }, body: { roleIds: [memberRoleId] } }),
      res,
    );
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it("sets a user's roles (happy path)", async () => {
    const { db, chain } = buildDb({ selectResult: { id: userId } });
    // Query order: ownership check -> loadInheritanceEdges -> ssd_sets -> existing user_roles -> cardinality roleRows
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: memberRoleId }])   // ownership check — role belongs to workspace
      .mockResolvedValueOnce([])                        // loadInheritanceEdges
      .mockResolvedValueOnce([])                        // ssd_sets — none
      .mockResolvedValueOnce([])                        // existing user_roles — none yet
      .mockResolvedValueOnce([{ id: memberRoleId, max_members: null }]); // cardinality roleRows
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce({ id: userId })  // target user lookup
      .mockResolvedValueOnce({ count: 0 });    // cardinality count for memberRoleId

    const trx = { ...chain };
    const txExecute = vi.fn().mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn(trx));
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'put'),
      buildReq({ params: { id: userId }, body: { roleIds: [memberRoleId] } }),
      res,
    );

    expect(txExecute).toHaveBeenCalled();
    expect((trx['deleteFrom'] as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('user_roles');
    expect((trx['insertInto'] as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('user_roles');
    expect((trx['insertInto'] as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('user_session_roles');
    expect(res['json']).toHaveBeenCalledWith({ data: { roleIds: [memberRoleId] }, error: null });
  });

  it('rejects an assignment that violates an SSD set (409 SSD_CONFLICT)', async () => {
    const { db, chain } = buildDb({ selectResult: { id: userId } });
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: payRoleId }, { id: approveRoleId }])            // ownership check — both owned
      .mockResolvedValueOnce([])                                                     // loadInheritanceEdges
      .mockResolvedValueOnce([{ id: 'set1', name: 'Finance', cardinality: 2 }])       // ssd_sets
      .mockResolvedValueOnce([{ role_id: payRoleId }, { role_id: approveRoleId }]);   // ssd_set_roles for set1
    const txExecute = vi.fn();
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'put'),
      buildReq({ params: { id: userId }, body: { roleIds: [payRoleId, approveRoleId] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(409);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('SSD_CONFLICT');
    expect(txExecute).not.toHaveBeenCalled();
  });

  it('rejects an assignment that exceeds a role cardinality cap (409 CARDINALITY)', async () => {
    const { db, chain } = buildDb({ selectResult: { id: userId } });
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: memberRoleId }])   // ownership check
      .mockResolvedValueOnce([])                        // loadInheritanceEdges
      .mockResolvedValueOnce([])                        // ssd_sets — none
      .mockResolvedValueOnce([])                        // existing user_roles — none, so role is "newly added"
      .mockResolvedValueOnce([{ id: memberRoleId, max_members: 1 }]); // cardinality roleRows
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce({ id: userId })  // target user lookup
      .mockResolvedValueOnce({ count: 1 });    // already at cap
    const txExecute = vi.fn();
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'put'),
      buildReq({ params: { id: userId }, body: { roleIds: [memberRoleId] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(409);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('CARDINALITY');
    expect(txExecute).not.toHaveBeenCalled();
  });

  it('rejects a role ID belonging to another workspace, with no write (cross-tenant guard)', async () => {
    const { db, chain } = buildDb({ selectResult: { id: userId } });
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([]); // ownership check — role not found in this workspace
    const txExecute = vi.fn();
    (db as Record<string, unknown>)['transaction'] = vi.fn().mockReturnValue({ execute: txExecute });

    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'put'),
      buildReq({ params: { id: userId }, body: { roleIds: [foreignRoleId] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('INVALID_ROLE');
    expect(txExecute).not.toHaveBeenCalled();
    expect(db['insertInto']).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid roleIds entry', async () => {
    const { db } = buildDb({ selectResult: { id: userId } });
    const router = createUserRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'put'),
      buildReq({ params: { id: userId }, body: { roleIds: ['not-a-uuid'] } }),
      res,
    );
    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('INVALID_INPUT');
  });
});
