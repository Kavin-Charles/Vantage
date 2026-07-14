import { describe, it, expect, vi } from 'vitest';
import { createRolesRouter } from '../routes/roles';

// ---------------------------------------------------------------------------
// Infinite self-referential chain — handles any depth of fluent calls
// ---------------------------------------------------------------------------
function makeChain(leafValues: Record<string, unknown> = {}): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const FLUENT = ['selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'where', 'selectAll', 'select',
                  'orderBy', 'limit', 'offset', 'values', 'set', 'returningAll', 'returning', 'fn', 'countAll', 'as',
                  'innerJoin', 'leftJoin', 'groupBy'];
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
  const { selectResult = undefined, execute = [], insertResult = { id: 'r1', name: 'Custom' } } = opts;

  const chain = makeChain({
    executeTakeFirst: selectResult,
    executeTakeFirstOrThrow: insertResult,
    execute,
  });
  // db.fn.countAll<number>() is called via `db.fn.countAll<number>().as(...)` — the shared
  // chain's `.as` already returns the chain, so `db.fn.countAll` just needs to return the chain too.
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

// `requirePermission` is `(permission: string) => RequestHandler` — these fakes match that shape.
const allowPermission = () => vi.fn((_permission: string) =>
  (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next());
const denyPermission = () => vi.fn((_permission: string) =>
  (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
  });

/** Collects the full effective middleware chain for `method path`: router.use() layers + route handlers, in order. */
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

// ---------------------------------------------------------------------------
// GET /api/roles
// ---------------------------------------------------------------------------
describe('GET /api/roles', () => {
  it('lists roles with member counts for an authorized caller', async () => {
    const roleRows = [
      { id: 'admin-role', name: 'Administrator', description: null, color: '#1e3a8a', is_system: true, grants_all: true, is_default: false, max_members: null, rank: 100 },
      { id: 'member-role', name: 'Member', description: null, color: '#6b665c', is_system: true, grants_all: false, is_default: true, max_members: null, rank: 0 },
    ];
    const countRows = [{ role_id: 'admin-role', count: 1 }, { role_id: 'member-role', count: 3 }];
    const { db, chain } = buildDb();
    chain['execute'] = vi.fn().mockResolvedValueOnce(roleRows).mockResolvedValueOnce(countRows);

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'get'), buildReq(), res);

    expect(res['json']).toHaveBeenCalledWith({
      data: [
        { ...roleRows[0], member_count: 1 },
        { ...roleRows[1], member_count: 3 },
      ],
      error: null,
    });
    const names = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].data.map((r: { name: string }) => r.name);
    expect(names).toContain('Administrator');
    expect(names).toContain('Member');
  });

  it('rejects a non-privileged caller without roles:manage', async () => {
    const { db } = buildDb();
    const router = createRolesRouter(db as never, denyPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'get'), buildReq(), res);

    expect(res['status']).toHaveBeenCalledWith(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/roles
// ---------------------------------------------------------------------------
describe('POST /api/roles', () => {
  it('returns 400 for invalid input', async () => {
    const { db } = buildDb();
    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'post'), buildReq({ body: { name: '' } }), res);
    expect(res['status']).toHaveBeenCalledWith(400);
  });

  it('creates a role without copying defaults', async () => {
    const newRole = { id: 'r1', name: 'Sales Rep', description: null, color: '#6b665c' };
    const { db, chain } = buildDb({ insertResult: newRole });
    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'post'), buildReq({ body: { name: 'Sales Rep' } }), res);

    expect(res['status']).toHaveBeenCalledWith(201);
    expect(res['json']).toHaveBeenCalledWith({ data: newRole, error: null });
    expect(db['insertInto']).toHaveBeenCalledWith('roles');
    expect(db['insertInto']).not.toHaveBeenCalledWith('role_permissions');
  });

  it('copies member default permissions when copyDefaults is set', async () => {
    const newRole = { id: 'r1', name: 'Sales Rep' };
    const { db } = buildDb({ insertResult: newRole });
    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'post'), buildReq({ body: { name: 'Sales Rep', copyDefaults: true } }), res);

    expect(res['status']).toHaveBeenCalledWith(201);
    expect(db['insertInto']).toHaveBeenCalledWith('role_permissions');
  });

  it('returns 409 when a role with the same name already exists', async () => {
    const { db, chain } = buildDb();
    // duplicate pre-check → an existing role is found
    chain['executeTakeFirst'] = vi.fn().mockResolvedValueOnce({ id: 'existing' });

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/', 'post'), buildReq({ body: { name: 'Member' } }), res);

    expect(res['status']).toHaveBeenCalledWith(409);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('DUPLICATE_NAME');
    expect(db['insertInto']).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/roles/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/roles/:id', () => {
  it('returns 404 when the role does not exist', async () => {
    const { db } = buildDb({ selectResult: undefined });
    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'patch'), buildReq({ params: { id: 'nope' }, body: { name: 'New' } }), res);
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it('blocks renaming a system role', async () => {
    const { db, chain } = buildDb({ selectResult: { id: 'member-role', is_system: true } });
    chain['executeTakeFirst'] = vi.fn().mockResolvedValueOnce({ id: 'member-role', is_system: true });

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'patch'), buildReq({ params: { id: 'member-role' }, body: { name: 'Renamed' } }), res);

    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('SYSTEM_ROLE');
  });

  it('allows updating a custom role', async () => {
    const updated = { id: 'r1', name: 'Renamed', description: null, color: '#6b665c', max_members: null };
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce({ id: 'r1', is_system: false }) // existing lookup
      .mockResolvedValueOnce(undefined)                       // duplicate-name pre-check → none
      .mockResolvedValueOnce(updated);                        // update result

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'patch'), buildReq({ params: { id: 'r1' }, body: { name: 'Renamed' } }), res);

    expect(res['json']).toHaveBeenCalledWith({ data: updated, error: null });
  });

  it('returns 409 when renaming to a name already taken by another role', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce({ id: 'r1', is_system: false }) // existing lookup
      .mockResolvedValueOnce({ id: 'other' });                // duplicate-name pre-check → collision

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'patch'), buildReq({ params: { id: 'r1' }, body: { name: 'Administrator' } }), res);

    expect(res['status']).toHaveBeenCalledWith(409);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('DUPLICATE_NAME');
    expect(db['updateTable']).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty update body', async () => {
    const { db } = buildDb();
    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'patch'), buildReq({ params: { id: 'r1' }, body: {} }), res);
    expect(res['status']).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/roles/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/roles/:id', () => {
  it('returns 404 when the role does not exist', async () => {
    const { db } = buildDb({ selectResult: undefined });
    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'delete'), buildReq({ params: { id: 'nope' } }), res);
    expect(res['status']).toHaveBeenCalledWith(404);
  });

  it('blocks deleting a system role', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn().mockResolvedValueOnce({ id: 'member-role', is_system: true });

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'delete'), buildReq({ params: { id: 'member-role' } }), res);

    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('SYSTEM_ROLE');
  });

  it('blocks deleting a custom role that still has members', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce({ id: 'r1', is_system: false })
      .mockResolvedValueOnce({ count: 2 });

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'delete'), buildReq({ params: { id: 'r1' } }), res);

    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('HAS_MEMBERS');
    expect(db['deleteFrom']).not.toHaveBeenCalled();
  });

  it('deletes a custom role with no members', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce({ id: 'r1', is_system: false })
      .mockResolvedValueOnce({ count: 0 });

    const router = createRolesRouter(db as never, allowPermission() as never);
    const res = buildRes();
    await runStack(getFullStack(router, '/:id', 'delete'), buildReq({ params: { id: 'r1' } }), res);

    expect(db['deleteFrom']).toHaveBeenCalledWith('roles');
    expect(res['json']).toHaveBeenCalledWith({ data: null, error: null });
  });
});
