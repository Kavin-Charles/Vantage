import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../workers/mail-sync', () => ({
  runFullSync: vi.fn(),
  runIncrementalSync: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockReturnValue({
        generateAuthUrl: vi.fn().mockReturnValue('http://google.com/auth'),
        setCredentials: vi.fn(),
      }),
    },
    gmail: vi.fn().mockReturnValue({}),
  },
}));

function buildMockDb(rows: object[] = []) {
  const chain: Record<string, unknown> = {};
  const fns = ['selectFrom','where','selectAll','select','orderBy','execute',
                'executeTakeFirst','executeTakeFirstOrThrow','insertInto','values',
                'returning','returningAll','deleteFrom','updateTable','set'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(rows[0] ?? null);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(rows[0] ?? { id: 'acc1' });
  return chain;
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return { workspace: { id: 'ws1' }, user: { id: 'u1' }, body: {}, params: {}, query: {}, ...overrides };
}

function buildRes() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }), redirect: vi.fn() };
}

beforeEach(() => {
  vi.resetModules();
  process.env['MAIL_ENCRYPTION_KEY'] = 'a'.repeat(64);
  process.env['JWT_SECRET'] = 'test-jwt-secret';
  process.env['GOOGLE_CLIENT_ID'] = 'client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'client-secret';
  process.env['GOOGLE_REDIRECT_URI'] = 'http://localhost:3001/api/mail/accounts/gmail/callback';
  process.env['APP_URL'] = 'http://localhost:3000';
});

describe('GET /api/mail/accounts', () => {
  it('returns account list for user', async () => {
    const fakeAccounts = [{ id: 'acc1', email: 'a@example.com', provider: 'gmail' }];
    const db = buildMockDb(fakeAccounts);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack[0]?.route?.stack[0]?.handle;
    const req = buildReq();
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: fakeAccounts, error: null }));
  });
});

describe('DELETE /api/mail/accounts/:id', () => {
  it('returns 404 when account not found', async () => {
    const db = buildMockDb([]);
    (db as Record<string, unknown>)['executeTakeFirst'] = vi.fn().mockResolvedValue(null);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    // DELETE is the last route
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const deleteHandler = routes[routes.length - 1]?.route?.stack[0]?.handle;
    const req = buildReq({ params: { id: 'nonexistent' } });
    const res = buildRes();
    await deleteHandler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
