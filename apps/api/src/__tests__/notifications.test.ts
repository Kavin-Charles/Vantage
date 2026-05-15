import { describe, it, expect, vi } from 'vitest';

function buildMockDb(notifications: object[] = [], count = 0) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom','updateTable','where','set','selectAll','orderBy','limit','offset','select','execute','executeTakeFirstOrThrow','returningAll','executeTakeFirst']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(notifications);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count });
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(notifications[0] ?? undefined);
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

describe('GET /api/notifications', () => {
  it('returns paginated notifications for current user', async () => {
    const fakeNotifs = [{ id: 'n1', title: 'Alert fired', read: false }];
    const db = buildMockDb(fakeNotifs, 1);
    const { createNotificationsRouter } = await import('../routes/notifications');
    const router = createNotificationsRouter(db as never);

    const getRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/');
    expect(getRoute).toBeDefined();
    const handler = getRoute!.route.stack[0]!.handle;

    const req = { query: {}, workspace: { id: 'ws1' }, user: { id: 'u1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: fakeNotifs, total: 1, error: null }),
    );
  });
});

describe('PATCH /api/notifications/read-all', () => {
  it('marks all user notifications as read', async () => {
    const db = buildMockDb();
    const { createNotificationsRouter } = await import('../routes/notifications');
    const router = createNotificationsRouter(db as never);

    const readAllRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/read-all');
    expect(readAllRoute).toBeDefined();
    const handler = readAllRoute!.route.stack[0]!.handle;

    const req = { workspace: { id: 'ws1' }, user: { id: 'u1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db.updateTable).toHaveBeenCalledWith('notifications');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});
