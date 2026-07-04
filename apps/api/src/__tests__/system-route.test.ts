import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestHandler } from 'express';

const passthrough: RequestHandler = (_req, _res, next) => next();

function buildMockDb(meta: Record<string, unknown> | undefined) {
  const chain: Record<string, unknown> = {};
  for (const f of ['select', 'selectAll', 'where', 'executeTakeFirst']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(meta);
  return { selectFrom: vi.fn().mockReturnValue(chain) };
}

function getHandler(router: unknown, method: string, path: string) {
  const stack = (router as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack;
  const layer = stack.find(s => s.route?.path === path && s.route.methods[method]);
  expect(layer, `${method.toUpperCase()} ${path} not found`).toBeDefined();
  return layer!.route!.stack.at(-1)!.handle;
}

const ENV = { CRON_SECRET: 'cron-s', UPDATER_URL: 'http://updater:9500', UPDATER_SECRET: 'upd-s' };

beforeEach(() => {
  vi.resetModules();
  process.env['VENCORE_VERSION'] = '1.2.0';
});

describe('GET /api/system/version', () => {
  it('returns the running version without auth', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const router = createSystemRouter(buildMockDb(undefined) as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'get', '/version');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: { version: '1.2.0' }, error: null });
  });
});

describe('POST /api/system/internal-check', () => {
  it('rejects a bad cron secret', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const router = createSystemRouter(buildMockDb(undefined) as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/internal-check');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ headers: { 'x-cron-secret': 'wrong' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('GET /api/system/update-info', () => {
  it('reports updateAvailable from instance_meta vs running version', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const db = buildMockDb({ latest_version: '1.3.0', release_url: 'https://x', last_checked_at: new Date() });
    const router = createSystemRouter(db as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'get', '/update-info');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({}, res, vi.fn());
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.data.updateAvailable).toBe(true);
    expect(payload.data.currentVersion).toBe('1.2.0');
    expect(payload.data.latestVersion).toBe('1.3.0');
  });
});

describe('POST /api/system/update', () => {
  it('returns 503 when the updater secret is not configured', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const env = { ...ENV, UPDATER_SECRET: undefined };
    const router = createSystemRouter(buildMockDb(undefined) as never, env, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/update');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ body: { version: '1.3.0' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejects a version that is not the detected latest', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const db = buildMockDb({ latest_version: '1.3.0' });
    const router = createSystemRouter(db as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/update');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ body: { version: '9.9.9' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.error.code).toBe('VERSION_MISMATCH');
  });

  it('rejects malformed version strings', async () => {
    const { createSystemRouter } = await import('../routes/system');
    const router = createSystemRouter(buildMockDb(undefined) as never, ENV, passthrough, passthrough);
    const handler = getHandler(router, 'post', '/update');
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler({ body: { version: 'latest; rm -rf /' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
