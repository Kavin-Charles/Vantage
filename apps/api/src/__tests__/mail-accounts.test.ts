import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../workers/mail-sync', () => ({
  runFullSync: vi.fn(),
  runIncrementalSync: vi.fn(),
}));

vi.mock('imapflow', () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  })),
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

describe('POST /api/mail/accounts/imap/test', () => {
  it('returns 400 when workspace config is missing', async () => {
    const db = buildMockDb([]);
    (db as Record<string, unknown>)['executeTakeFirst'] = vi.fn().mockResolvedValue(null);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const testRoute = routes.find((r: unknown) => {
      const route = (r as { route?: { path?: string } }).route;
      return route?.path === '/imap/test';
    });
    const handler = (testRoute as { route: { stack: { handle: Function }[] } }).route.stack[0]?.handle;
    const req = buildReq({ body: { email: 'user@co.com', imap_pass: 'pass' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns ok when IMAP connection succeeds', async () => {
    const config = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993, smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const db = buildMockDb([config]);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const testRoute = routes.find((r: unknown) => {
      const route = (r as { route?: { path?: string } }).route;
      return route?.path === '/imap/test';
    });
    const handler = (testRoute as { route: { stack: { handle: Function }[] } }).route.stack[0]?.handle;
    const req = buildReq({ body: { email: 'user@co.com', imap_pass: 'pass' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: { ok: true }, error: null });
  });

  it('returns 400 when IMAP connection fails', async () => {
    const { ImapFlow } = await import('imapflow');
    (ImapFlow as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      connect: vi.fn().mockRejectedValue(new Error('Authentication failed')),
      logout: vi.fn(),
      close: vi.fn(),
    }));
    const config = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993, smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const db = buildMockDb([config]);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const testRoute = routes.find((r: unknown) => {
      const route = (r as { route?: { path?: string } }).route;
      return route?.path === '/imap/test';
    });
    const handler = (testRoute as { route: { stack: { handle: Function }[] } }).route.stack[0]?.handle;
    const req = buildReq({ body: { email: 'user@co.com', imap_pass: 'wrongpass' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/mail/accounts/imap (with workspace config fallback)', () => {
  it('fetches workspace config when imap_host not provided', async () => {
    const config = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993,
                     smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const inserted = { id: 'acc1', email: 'user@co.com', provider: 'imap', imap_pass: 'enc', smtp_pass: 'enc',
                       access_token: null, refresh_token: null };
    const db = buildMockDb([config]);
    (db as Record<string, unknown>)['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(inserted);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const imapRoute = routes.find((r: unknown) => {
      const route = (r as { route?: { path?: string; methods?: Record<string, boolean> } }).route;
      return route?.path === '/imap' && route?.methods?.['post'];
    });
    const handler = (imapRoute as { route: { stack: { handle: Function }[] } }).route.stack[0]?.handle;
    const req = buildReq({ body: { email: 'user@co.com', imap_pass: 'pass', smtp_pass: 'pass' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
