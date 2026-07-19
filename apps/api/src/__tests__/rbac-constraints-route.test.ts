import { describe, it, expect, vi } from 'vitest';
import { createRbacConstraintsRouter } from '../routes/rbac-constraints';

// ---------------------------------------------------------------------------
// Infinite self-referential chain — handles any depth of fluent calls
// (mirrors apps/api/src/__tests__/roles-route.test.ts).
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

function buildDb(opts: {
  selectResult?: unknown;
  execute?: unknown[];
  insertResult?: unknown;
} = {}) {
  const { selectResult = undefined, execute = [], insertResult = { id: 's1', name: 'Set', cardinality: 2 } } = opts;

  const chain = makeChain({
    executeTakeFirst: selectResult,
    executeTakeFirstOrThrow: insertResult,
    execute,
  });
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

const allowPermission = () => vi.fn((_permission: string) =>
  (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next());

function getFullStack(
  router: unknown,
  path: string,
  method: 'get' | 'post' | 'patch' | 'delete',
): Function[] {
  const stack = (router as {
    stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] }; handle: Function }[];
  }).stack;
  const useHandlers = stack.filter(s => !s.route).map(s => s.handle);
  const routeLayer = stack.find(s => s.route?.path === path && s.route?.methods[method]);
  const routeHandlers = (routeLayer?.route?.stack ?? []).map(s => s.handle);
  return [...useHandlers, ...routeHandlers];
}

async function runStack(handlers: Function[], req: unknown, res: unknown): Promise<void> {
  let i = 0;
  const next = async (err?: unknown): Promise<void> => {
    if (err) throw err;
    const h = handlers[i++];
    if (h) await h(req, res, next);
  };
  await next();
}

const roleA = '11111111-1111-1111-1111-111111111111';
const roleB = '22222222-2222-2222-2222-222222222222';
const memberId = '33333333-3333-3333-3333-333333333333';

// ---------------------------------------------------------------------------
// SSD
// ---------------------------------------------------------------------------
describe('POST /api/rbac/ssd-sets', () => {
  it('creates an SSD set (happy path)', async () => {
    const { db, chain } = buildDb({ insertResult: { id: 's1', name: 'S', cardinality: 2 } });
    // owned roles -> loadInheritanceEdges -> computeAuthorizedClosures (no members) -> insert role rows
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: roleA }, { id: roleB }]) // verifyRolesOwned
      .mockResolvedValueOnce([])                              // loadInheritanceEdges
      .mockResolvedValueOnce([])                              // computeAuthorizedClosures — no user_roles rows
      .mockResolvedValueOnce([]);                             // insert ssd_set_roles

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/ssd-sets', 'post'),
      buildReq({ body: { name: 'S', cardinality: 2, roleIds: [roleA, roleB] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(201);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error).toBeNull();
    expect(arg.data).toEqual({ id: 's1', name: 'S', cardinality: 2, roleIds: [roleA, roleB] });
    expect(db['insertInto']).toHaveBeenCalledWith('ssd_sets');
    expect(db['insertInto']).toHaveBeenCalledWith('ssd_set_roles');
  });

  it('returns 400 for invalid input', async () => {
    const { db } = buildDb();
    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/ssd-sets', 'post'),
      buildReq({ body: { name: '', cardinality: 2, roleIds: [roleA, roleB] } }),
      res,
    );
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('rejects a cross-tenant roleId with 400 INVALID_ROLE and does not write', async () => {
    const { db, chain } = buildDb();
    // verifyRolesOwned — only one of the two roles belongs to this workspace
    chain['execute'] = vi.fn().mockResolvedValueOnce([{ id: roleA }]);

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/ssd-sets', 'post'),
      buildReq({ body: { name: 'S', cardinality: 2, roleIds: [roleA, roleB] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('INVALID_ROLE');
    expect(db['insertInto']).not.toHaveBeenCalled();
  });

  it('rejects a set that an existing assignment already violates (409, no write)', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: roleA }, { id: roleB }])                       // verifyRolesOwned
      .mockResolvedValueOnce([])                                                    // loadInheritanceEdges
      .mockResolvedValueOnce([{ user_id: memberId, role_id: roleA }, { user_id: memberId, role_id: roleB }]); // computeAuthorizedClosures

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/ssd-sets', 'post'),
      buildReq({ body: { name: 'S', cardinality: 2, roleIds: [roleA, roleB] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(409);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('SSD_CONFLICT');
    expect(arg.error.conflicts.length).toBeGreaterThan(0);
    expect(arg.error.conflicts[0].userId).toBe(memberId);
    expect(db['insertInto']).not.toHaveBeenCalled();
  });
});

describe('GET /api/rbac/ssd-sets', () => {
  it('lists sets with their roleIds', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: 's1', workspace_id: 'ws1', name: 'S', cardinality: 2 }])
      .mockResolvedValueOnce([{ set_id: 's1', role_id: roleA }, { set_id: 's1', role_id: roleB }]);

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/ssd-sets', 'get'), buildReq(), res);

    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.data).toEqual([{ id: 's1', workspace_id: 'ws1', name: 'S', cardinality: 2, roleIds: [roleA, roleB] }]);
  });
});

describe('DELETE /api/rbac/ssd-sets/:id', () => {
  it('returns 404 when the set does not belong to the workspace', async () => {
    const { db } = buildDb({ selectResult: undefined });
    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/ssd-sets/:id', 'delete'), buildReq({ params: { id: 'nope' } }), res);
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it('deletes the set and its role rows', async () => {
    const { db, chain } = buildDb({ selectResult: { id: 's1' } });
    chain['execute'] = vi.fn().mockResolvedValue([]);
    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/ssd-sets/:id', 'delete'), buildReq({ params: { id: 's1' } }), res);

    expect(db['deleteFrom']).toHaveBeenCalledWith('ssd_set_roles');
    expect(db['deleteFrom']).toHaveBeenCalledWith('ssd_sets');
    expect(res['json']).toHaveBeenCalledWith({ data: null, error: null });
  });
});

describe('PATCH /api/rbac/ssd-sets/:id', () => {
  it('returns 404 when the set does not belong to the workspace', async () => {
    const { db } = buildDb({ selectResult: undefined });
    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/ssd-sets/:id', 'patch'),
      buildReq({ params: { id: 'nope' }, body: { name: 'New' } }),
      res,
    );
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it('rejects a cross-tenant roleId on update', async () => {
    const { db, chain } = buildDb({ selectResult: { id: 's1', workspace_id: 'ws1', name: 'S', cardinality: 2 } });
    chain['execute'] = vi.fn().mockResolvedValueOnce([{ id: roleA }]); // verifyRolesOwned — only one owned
    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/ssd-sets/:id', 'patch'),
      buildReq({ params: { id: 's1' }, body: { roleIds: [roleA, roleB] } }),
      res,
    );
    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('INVALID_ROLE');
    expect(db['updateTable']).not.toHaveBeenCalled();
  });

  it('updates name/cardinality with no conflicts', async () => {
    const { db, chain } = buildDb({ selectResult: { id: 's1', workspace_id: 'ws1', name: 'S', cardinality: 2 } });
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ role_id: roleA }, { role_id: roleB }]) // existing ssd_set_roles (roleIds not in body)
      .mockResolvedValueOnce([])                                      // loadInheritanceEdges
      .mockResolvedValueOnce([])                                      // computeAuthorizedClosures — no members
      .mockResolvedValueOnce([]);                                     // updateTable execute

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/ssd-sets/:id', 'patch'),
      buildReq({ params: { id: 's1' }, body: { name: 'Renamed' } }),
      res,
    );

    expect(res['json']).toHaveBeenCalledWith({ data: { id: 's1', name: 'Renamed', cardinality: 2, roleIds: [roleA, roleB] }, error: null });
    expect(db['updateTable']).toHaveBeenCalledWith('ssd_sets');
  });
});

// ---------------------------------------------------------------------------
// DSD
// ---------------------------------------------------------------------------
describe('POST /api/rbac/dsd-sets', () => {
  it('creates a DSD set (happy path)', async () => {
    const { db, chain } = buildDb({ insertResult: { id: 'd1', name: 'D', cardinality: 2 } });
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: roleA }, { id: roleB }]) // verifyRolesOwned
      .mockResolvedValueOnce([])                              // loadInheritanceEdges
      .mockResolvedValueOnce([])                              // computeActiveClosures — no active session roles
      .mockResolvedValueOnce([]);                             // insert dsd_set_roles

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/dsd-sets', 'post'),
      buildReq({ body: { name: 'D', cardinality: 2, roleIds: [roleA, roleB] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(201);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.data).toEqual({ id: 'd1', name: 'D', cardinality: 2, roleIds: [roleA, roleB] });
    expect(db['insertInto']).toHaveBeenCalledWith('dsd_sets');
    expect(db['insertInto']).toHaveBeenCalledWith('dsd_set_roles');
  });

  it('rejects a set that an existing ACTIVE assignment already violates (409, no write)', async () => {
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: roleA }, { id: roleB }])                       // verifyRolesOwned
      .mockResolvedValueOnce([])                                                    // loadInheritanceEdges
      .mockResolvedValueOnce([{ user_id: memberId, role_id: roleA }, { user_id: memberId, role_id: roleB }]); // computeActiveClosures

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/dsd-sets', 'post'),
      buildReq({ body: { name: 'D', cardinality: 2, roleIds: [roleA, roleB] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(409);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('DSD_CONFLICT');
    expect(arg.error.conflicts.length).toBeGreaterThan(0);
    expect(db['insertInto']).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// discarded-grants
// ---------------------------------------------------------------------------
describe('GET /api/rbac/discarded-grants', () => {
  it('returns the migration_discarded_grants rows for the workspace', async () => {
    const rows = [{ id: 'g1', workspace_id: 'ws1', user_id: memberId, permission: 'contacts:delete', discarded_at: new Date() }];
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn().mockResolvedValueOnce(rows);

    const router = createRbacConstraintsRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/discarded-grants', 'get'), buildReq(), res);

    expect(db['selectFrom']).toHaveBeenCalledWith('migration_discarded_grants');
    expect(res['json']).toHaveBeenCalledWith({ data: rows, error: null });
  });
});
