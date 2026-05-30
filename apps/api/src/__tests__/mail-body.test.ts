import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchBody = vi.fn();
vi.mock('../lib/gmail-provider', () => ({
  createGmailProvider: () => ({ fetchBody: mockFetchBody }),
}));
vi.mock('../lib/imap-provider', () => ({
  createImapProvider: () => ({ fetchBody: mockFetchBody }),
}));
vi.mock('../lib/mail-crypto', () => ({
  decryptSecret: (s: string) => s,
}));
vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

const mockEmail = {
  id: 'email-1',
  account_id: 'acc-1',
  message_id: 'msg-1',
  user_id: 'user-1',
};
const mockAccount = {
  id: 'acc-1',
  provider: 'gmail',
  access_token: 'tok',
  refresh_token: 'rtok',
  imap_host: null,
  imap_port: null,
  imap_user: null,
  imap_pass: null,
  smtp_host: null,
  smtp_port: null,
  smtp_user: null,
  smtp_pass: null,
  use_ssl: true,
};

function buildMockDb(emailRow: typeof mockEmail | null, accountRow: typeof mockAccount | null) {
  const chain: Record<string, unknown> = {};
  const fns = [
    'selectFrom', 'where', 'selectAll', 'select', 'orderBy', 'limit', 'offset',
    'execute', 'executeTakeFirst', 'executeTakeFirstOrThrow',
    'updateTable', 'set', 'returningAll', 'insertInto', 'values', 'deleteFrom',
  ];
  let callCount = 0;
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  // executeTakeFirst returns email on first call (emails table), account on second (email_accounts)
  chain['executeTakeFirst'] = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) return Promise.resolve(emailRow);
    return Promise.resolve(accountRow);
  });
  return { selectFrom: vi.fn().mockReturnValue(chain), updateTable: vi.fn().mockReturnValue(chain) } as any;
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', workspace_id: 'ws-1' },
    workspace: { id: 'ws-1' },
    params: { id: 'email-1' },
    body: {},
    query: {},
    ...overrides,
  };
}

function buildRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { json, status };
}

function getBodyHandler(router: ReturnType<typeof import('../routes/mail-body')['createMailBodyRouter']>) {
  // The router stack: first route is GET /:id/body
  const stack = (router as any).stack as Array<{ route?: { stack: Array<{ handle: Function }> } }>;
  const route = stack.find(s => s.route)?.route;
  return route?.stack[0]?.handle;
}

beforeEach(() => {
  vi.resetModules();
  mockFetchBody.mockReset();
  process.env['MAIL_ENCRYPTION_KEY'] = 'a'.repeat(64);
});

describe('GET /api/mail/emails/:id/body', () => {
  it('returns body for gmail account', async () => {
    mockFetchBody.mockResolvedValue({ body_html: '<p>Hello</p>', body_text: 'Hello' });
    const db = buildMockDb(mockEmail, mockAccount);
    const { createMailBodyRouter } = await import('../routes/mail-body');
    const router = createMailBodyRouter(db);
    const handler = getBodyHandler(router);
    const req = buildReq();
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({
      data: { body_html: '<p>Hello</p>', body_text: 'Hello' },
      error: null,
    });
  });

  it('returns 404 when email not found', async () => {
    const db = buildMockDb(null, mockAccount);
    const { createMailBodyRouter } = await import('../routes/mail-body');
    const router = createMailBodyRouter(db);
    const handler = getBodyHandler(router);
    const req = buildReq();
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when account not found', async () => {
    const db = buildMockDb(mockEmail, null);
    const { createMailBodyRouter } = await import('../routes/mail-body');
    const router = createMailBodyRouter(db);
    const handler = getBodyHandler(router);
    const req = buildReq();
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
