import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildMockDb(rows: object[] = []) {
  const chain: Record<string, unknown> = {};
  const fns = ['selectFrom','where','selectAll','select','orderBy','execute',
                'executeTakeFirst','executeTakeFirstOrThrow','insertInto','values',
                'returning','returningAll','deleteFrom','updateTable','set','onConflict',
                'doUpdateSet','column'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(rows[0] ?? null);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(rows[0] ?? { workspace_id: 'ws1' });
  return chain;
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return {
    workspace: { id: 'ws1' },
    user: { id: 'u1', role: 'admin' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function buildRes() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }), redirect: vi.fn() };
}

beforeEach(() => vi.resetModules());

describe('GET /api/mail/workspace-config', () => {
  it('returns config when it exists', async () => {
    const fakeConfig = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993,
                         smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const db = buildMockDb([fakeConfig]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const getHandler = routes[0]?.route?.stack[0]?.handle;
    const req = buildReq();
    const res = buildRes();
    await getHandler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: fakeConfig, error: null });
  });

  it('returns null when no config exists', async () => {
    const db = buildMockDb([]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const getHandler = routes[0]?.route?.stack[0]?.handle;
    const req = buildReq();
    const res = buildRes();
    await getHandler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: null, error: null });
  });
});

describe('PUT /api/mail/workspace-config', () => {
  it('rejects non-admin with 403', async () => {
    const db = buildMockDb([]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    // PUT route has requireAdmin as first middleware in its stack
    const requireAdminHandler = routes[1]?.route?.stack[0]?.handle;
    const req = buildReq({ user: { id: 'u1', role: 'member' } });
    const res = buildRes();
    const next = vi.fn();
    requireAdminHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('upserts config and returns saved data for admin', async () => {
    const saved = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993,
                    smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const db = buildMockDb([saved]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    // PUT route: stack[0] = requireAdmin, stack[1] = actual handler
    const putHandler = routes[1]?.route?.stack[1]?.handle;
    const req = buildReq({
      body: { imap_host: 'imap.co.com', imap_port: 993, smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true },
    });
    const res = buildRes();
    await putHandler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: saved, error: null });
  });
});
