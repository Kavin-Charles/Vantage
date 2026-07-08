import { describe, it, expect, vi } from 'vitest';

function buildMockDb() {
  const insertChain: Record<string, unknown> = {};
  for (const f of ['insertInto','values','execute']) {
    insertChain[f] = vi.fn().mockReturnValue(insertChain);
  }
  insertChain['execute'] = vi.fn().mockResolvedValue([{ numInsertedOrUpdatedRows: BigInt(2) }]);

  const updateChain: Record<string, unknown> = {};
  for (const f of ['updateTable','set','where','execute']) {
    updateChain[f] = vi.fn().mockReturnValue(updateChain);
  }
  updateChain['execute'] = vi.fn().mockResolvedValue(undefined);

  const trx = {
    insertInto: vi.fn().mockReturnValue(insertChain),
    updateTable: vi.fn().mockReturnValue(updateChain),
  };

  const selectChain: Record<string, unknown> = {};
  for (const f of ['selectFrom','where','select','orderBy','execute','executeTakeFirstOrThrow','selectAll','limit','offset']) {
    selectChain[f] = vi.fn().mockReturnValue(selectChain);
  }
  selectChain['execute'] = vi.fn().mockResolvedValue([]);
  selectChain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count: 0 });

  return {
    insertInto: vi.fn().mockReturnValue(insertChain),
    updateTable: vi.fn().mockReturnValue(updateChain),
    selectFrom: vi.fn().mockReturnValue(selectChain),
    transaction: vi.fn().mockReturnValue({
      execute: vi.fn().mockImplementation(async (fn: Function) => fn(trx)),
    }),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
    _trx: trx,
  };
}

const noopPermission = () => (_req: unknown, _res: unknown, next: Function) => next();

describe('POST /api/contacts/import — bulk insert', () => {
  it('calls insertInto once (not per row) for valid rows', async () => {
    const rows = [
      { name: 'Alice', email: 'alice@example.com', status: 'prospect' },
      { name: 'Bob', email: 'bob@example.com', status: 'customer' },
    ];
    const db = buildMockDb();
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);

    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/import');
    expect(importRoute).toBeDefined();

    const handler = importRoute!.route.stack[1]!.handle;
    const req = { body: { rows }, workspace: { id: 'ws1' }, user: { id: 'u1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db._trx.insertInto).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errors: [] }) }),
    );
  });

  it('reports validation errors without hitting DB', async () => {
    const rows = [{ name: 'Alice', email: 'not-an-email', status: 'prospect' }];
    const db = buildMockDb();
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never, noopPermission as never);
    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/import');
    const handler = importRoute!.route.stack[1]!.handle;
    const req = { body: { rows }, workspace: { id: 'ws1' }, user: { id: 'u1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db._trx.insertInto).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          created: 0,
          errors: expect.arrayContaining([expect.stringContaining('not-an-email')]),
        }),
      }),
    );
  });
});
