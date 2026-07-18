import { describe, it, expect, vi } from 'vitest';
import { createInvitesRouter } from '../routes/invites';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue(undefined) })),
  },
}));

// ---------------------------------------------------------------------------
// Infinite self-referential chain — handles any depth of fluent calls
// (mirrors the mock-db harness in roles-route.test.ts)
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

function buildDb() {
  const chain = makeChain();
  const db: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom: vi.fn().mockReturnValue(chain),
  };
  return { db, chain };
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    workspace: { id: 'ws1', name: 'Acme' },
    user: { id: 'inviter1', name: 'Inviter' },
    ...overrides,
  };
}

function buildRes() {
  const res: Record<string, unknown> = {};
  res['json'] = vi.fn();
  res['status'] = vi.fn().mockReturnValue(res);
  return res;
}

const passThrough = () => vi.fn((_req: unknown, _res: unknown, next: (err?: unknown) => void) => next());

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

const smtp = { host: 'smtp.test', port: 587, secure: false, user: 'u', password: 'p', from: 'noreply@test' };

// zod validates roleIds as z.string().uuid() — need real UUID-shaped ids in these tests.
const ROLE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROLE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_ROLE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const DEFAULT_ROLE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeRouter(db: unknown, smtpConfig: unknown = smtp) {
  return createInvitesRouter(
    db as never,
    smtpConfig as never,
    passThrough() as never,
    passThrough() as never,
    'https://app.test',
  );
}

// ---------------------------------------------------------------------------
// POST /api/invites (email flow — smtp configured)
// ---------------------------------------------------------------------------
describe('POST /api/invites (email invite flow)', () => {
  it('persists invite_roles for provided roleIds owned by the workspace', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn().mockResolvedValueOnce(undefined); // email-taken check → none
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ id: ROLE_A }, { id: ROLE_B }]) // owned-roles check
      .mockResolvedValue([]);                                        // invite_roles inserts
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValueOnce({ id: 'invite1', email: 'new@x.com', token: 'tok' });

    const router = makeRouter(db);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'post'),
      buildReq({ body: { email: 'new@x.com', roleIds: [ROLE_A, ROLE_B] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(201);
    expect(db['insertInto']).toHaveBeenCalledWith('invite_roles');
    const valuesCalls = (chain['values'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(valuesCalls).toContainEqual({ invite_id: 'invite1', role_id: ROLE_A });
    expect(valuesCalls).toContainEqual({ invite_id: 'invite1', role_id: ROLE_B });
  });

  it('rejects a roleId that does not belong to the caller workspace with 400, and does not create the invite', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn().mockResolvedValueOnce(undefined); // email-taken check → none
    chain['execute'] = vi.fn().mockResolvedValueOnce([]); // owned-roles check → none owned (foreign id)

    const router = makeRouter(db);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'post'),
      buildReq({ body: { email: 'new@x.com', roleIds: [FOREIGN_ROLE] } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(400);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('INVALID_ROLE_IDS');
    expect(db['insertInto']).not.toHaveBeenCalledWith('invites');
    expect(db['insertInto']).not.toHaveBeenCalledWith('invite_roles');
  });

  it('defaults to the workspace is_default role when roleIds is omitted', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce(undefined)          // email-taken check → none
      .mockResolvedValueOnce({ id: 'default-role' }); // getDefaultRoleId
    chain['execute'] = vi.fn().mockResolvedValue([]); // invite_roles insert
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValueOnce({ id: 'invite2', email: 'new2@x.com', token: 'tok2' });

    const router = makeRouter(db);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'post'),
      buildReq({ body: { email: 'new2@x.com' } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(201);
    const valuesCalls = (chain['values'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(valuesCalls).toContainEqual({ invite_id: 'invite2', role_id: 'default-role' });
  });

  it('returns 500 NO_DEFAULT_ROLE when roleIds is omitted and the workspace has no default role', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce(undefined)   // email-taken check → none
      .mockResolvedValueOnce(undefined);  // getDefaultRoleId → none configured

    const router = makeRouter(db);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/', 'post'),
      buildReq({ body: { email: 'new3@x.com' } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(500);
    const arg = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.error.code).toBe('NO_DEFAULT_ROLE');
    expect(db['insertInto']).not.toHaveBeenCalledWith('invites');
  });
});

// ---------------------------------------------------------------------------
// POST /api/invites/accept/:token
// ---------------------------------------------------------------------------
describe('POST /api/invites/accept/:token', () => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);

  it("assigns all of the invite's roles to the new user via user_roles + user_session_roles", async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn().mockResolvedValueOnce({
      id: 'invite1', workspace_id: 'ws1', email: 'new@x.com', token: 'tok',
      accepted_at: null, expires_at: futureExpiry,
    });
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([{ role_id: 'role-a' }, { role_id: 'role-b' }]) // invite_roles lookup
      .mockResolvedValue([]); // user_roles / user_session_roles inserts + accepted_at update
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValueOnce({ id: 'user1' });

    const router = makeRouter(db);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/accept/:token', 'post'),
      buildReq({ params: { token: 'tok' }, body: { name: 'New', password: 'pw12345!' } }),
      res,
    );

    expect(res['json']).toHaveBeenCalledWith({ data: { email: 'new@x.com' }, error: null });
    expect(db['insertInto']).toHaveBeenCalledWith('user_roles');
    expect(db['insertInto']).toHaveBeenCalledWith('user_session_roles');
    const valuesCalls = (chain['values'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(valuesCalls).toContainEqual({ workspace_id: 'ws1', role_id: 'role-a', user_id: 'user1' });
    expect(valuesCalls).toContainEqual({ workspace_id: 'ws1', role_id: 'role-b', user_id: 'user1' });
    expect(valuesCalls).toContainEqual({ user_id: 'user1', role_id: 'role-a', active: true });
    expect(valuesCalls).toContainEqual({ user_id: 'user1', role_id: 'role-b', active: true });
  });

  it('falls back to the workspace default role for a legacy invite with no invite_roles rows', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn()
      .mockResolvedValueOnce({
        id: 'invite2', workspace_id: 'ws1', email: 'legacy@x.com', token: 'tok2',
        accepted_at: null, expires_at: futureExpiry,
      })
      .mockResolvedValueOnce({ id: 'default-role' }); // getDefaultRoleId fallback
    chain['execute'] = vi.fn()
      .mockResolvedValueOnce([]) // invite_roles lookup → empty (legacy invite)
      .mockResolvedValue([]);    // inserts + update
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValueOnce({ id: 'user2' });

    const router = makeRouter(db);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/accept/:token', 'post'),
      buildReq({ params: { token: 'tok2' }, body: { name: 'Legacy', password: 'pw12345!' } }),
      res,
    );

    expect(res['json']).toHaveBeenCalledWith({ data: { email: 'legacy@x.com' }, error: null });
    const valuesCalls = (chain['values'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(valuesCalls).toContainEqual({ workspace_id: 'ws1', role_id: 'default-role', user_id: 'user2' });
  });

  it('returns 404 for an unknown token', async () => {
    const { db, chain } = buildDb();
    chain['executeTakeFirst'] = vi.fn().mockResolvedValueOnce(undefined);

    const router = makeRouter(db);
    const res = buildRes();
    await runStack(
      getFullStack(router, '/accept/:token', 'post'),
      buildReq({ params: { token: 'nope' }, body: { name: 'New', password: 'pw12345!' } }),
      res,
    );

    expect(res['status']).toHaveBeenCalledWith(404);
  });
});
