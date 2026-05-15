import { describe, it, expect, vi } from 'vitest';

function buildMockDb() {
  const insertChain: Record<string, unknown> = {};
  for (const f of ['insertInto','values','execute','returningAll','executeTakeFirstOrThrow']) {
    insertChain[f] = vi.fn().mockReturnValue(insertChain);
  }
  insertChain['execute'] = vi.fn().mockResolvedValue({ numInsertedOrUpdatedRows: BigInt(2) });

  const selectChain: Record<string, unknown> = {};
  for (const f of ['selectFrom','where','select','orderBy','execute','executeTakeFirstOrThrow','selectAll','limit','offset']) {
    selectChain[f] = vi.fn().mockReturnValue(selectChain);
  }
  // Pipeline found
  selectChain['executeTakeFirst'] = vi.fn().mockResolvedValue({ id: 'pl1' });
  selectChain['execute'] = vi.fn().mockResolvedValue([]);

  const updateChain: Record<string, unknown> = {};
  for (const f of ['updateTable','set','where','execute']) {
    updateChain[f] = vi.fn().mockReturnValue(updateChain);
  }
  updateChain['execute'] = vi.fn().mockResolvedValue(undefined);

  return {
    insertInto: vi.fn().mockReturnValue(insertChain),
    selectFrom: vi.fn().mockReturnValue(selectChain),
    updateTable: vi.fn().mockReturnValue(updateChain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

describe('POST /api/deals/import — bulk insert', () => {
  it('calls insertInto once for multiple valid rows', async () => {
    const db = buildMockDb();
    const { createDealsRouter } = await import('../routes/deals');
    const router = createDealsRouter(db as never);

    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/import');
    expect(importRoute).toBeDefined();

    const handler = importRoute!.route.stack[0]!.handle;
    const req = {
      body: {
        pipeline_id: 'pl1',
        stage_id: 'st1',
        rows: [
          { name: 'Deal A', value: 1000, probability: 50 },
          { name: 'Deal B', value: 2000, probability: 75 },
        ],
      },
      workspace: { id: 'ws1' },
      user: { id: 'u1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db.insertInto).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errors: [] }) }),
    );
  });

  it('reports validation errors without DB call when all rows invalid', async () => {
    const db = buildMockDb();
    const { createDealsRouter } = await import('../routes/deals');
    const router = createDealsRouter(db as never);
    const importRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/import');
    const handler = importRoute!.route.stack[0]!.handle;
    const req = {
      body: {
        pipeline_id: 'pl1',
        stage_id: 'st1',
        rows: [{ name: '', value: -1 }], // invalid
      },
      workspace: { id: 'ws1' },
      user: { id: 'u1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    // selectFrom is called for pipeline check, but insertInto is NOT called
    expect(db.insertInto).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ created: 0, errors: expect.arrayContaining([expect.any(String)]) }),
      }),
    );
  });
});
