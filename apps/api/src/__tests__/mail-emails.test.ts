import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildMockDb(rows: object[] = [], single: object | null = null) {
  const chain: Record<string, unknown> = {};
  const fns = ['selectFrom','where','selectAll','select','orderBy','limit','offset',
                'execute','executeTakeFirst','executeTakeFirstOrThrow',
                'updateTable','set','returningAll','insertInto','values','deleteFrom'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(single);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(single ?? { count: 1 });
  return {
    ...chain,
    selectFrom: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return { workspace: { id: 'ws1' }, user: { id: 'u1' }, body: {}, params: {}, query: {}, ...overrides };
}

function buildRes() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }) };
}

beforeEach(() => { vi.resetModules(); process.env['MAIL_ENCRYPTION_KEY'] = 'a'.repeat(64); });

describe('GET /api/mail/emails', () => {
  it('returns paginated emails', async () => {
    const fakeEmails = [{ id: 'e1', subject: 'Hello' }];
    const db = buildMockDb(fakeEmails, { count: 1 });
    const { createMailEmailsRouter } = await import('../routes/mail-emails');
    const router = createMailEmailsRouter(db as never);
    const handler = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack[0]?.route?.stack[0]?.handle;
    const req = buildReq({ query: { folder: 'inbox' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: fakeEmails, error: null }));
  });
});

describe('PATCH /api/mail/emails/:id', () => {
  it('returns 404 if email not found for user', async () => {
    const db = buildMockDb([], null);
    const { createMailEmailsRouter } = await import('../routes/mail-emails');
    const router = createMailEmailsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    // PATCH /:id is route index 2 (GET /, GET /:id, PATCH /:id, POST /send, DELETE /:id)
    const handler = routes[2]?.route?.stack[0]?.handle;
    const req = buildReq({ params: { id: 'e1' }, body: { is_read: true } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
