import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errors';

// Covers CRM activity logging on POST /api/activity: note/call/meeting/email
// types must be accepted and persisted scoped to workspace + user, with an
// invalid type rejected as 400.

const WORKSPACE_ID = 'ws1';
const USER_ID = 'u1';
const DEAL_ID = '11111111-1111-1111-1111-111111111111';

function makeChain(leafValues: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {};
  const FLUENT = ['where', 'selectAll', 'select', 'orderBy', 'limit', 'offset', 'returningAll', 'values', 'set'];
  for (const m of FLUENT) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(leafValues['execute'] ?? []);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirst'] ?? undefined);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirstOrThrow'] ?? {});
  return chain;
}

function buildDb(opts: { createdActivity?: unknown } = {}) {
  const insertActivitiesChain = makeChain({
    executeTakeFirstOrThrow: opts.createdActivity ?? {
      id: 'act1',
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      type: 'note',
      body: 'hi',
      record_id: DEAL_ID,
    },
  });
  const updateContactsChain = makeChain({});

  const insertInto = vi.fn((table: string) => {
    if (table === 'activities') return insertActivitiesChain;
    throw new Error(`buildDb: unexpected insertInto table "${table}"`);
  });
  const updateTable = vi.fn((table: string) => {
    if (table === 'contacts') return updateContactsChain;
    throw new Error(`buildDb: unexpected updateTable table "${table}"`);
  });

  const db = { insertInto, updateTable } as unknown;
  return { db, insertActivitiesChain };
}

const noopPermission = () => (_req: unknown, _res: unknown, next: () => void) => next();

function buildApp(db: unknown, createActivityRouter: (db: never, requirePermission: never) => express.Router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { workspace: unknown }).workspace = { id: WORKSPACE_ID };
    (req as unknown as { user: unknown }).user = { id: USER_ID, role: 'admin' };
    next();
  });
  app.use('/api/activity', createActivityRouter(db as never, noopPermission as never));
  app.use(errorHandler);
  return app;
}

describe('POST /api/activity — CRM logging', () => {
  it('persists a note activity with workspace_id, user_id, and the linked deal', async () => {
    const { db, insertActivitiesChain } = buildDb();
    const { createActivityRouter } = await import('../routes/activity');
    const app = buildApp(db, createActivityRouter);

    const res = await request(app)
      .post('/api/activity')
      .send({ type: 'note', body: 'hi', deal_id: DEAL_ID });

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toBeDefined();
    expect(insertActivitiesChain['values']).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        user_id: USER_ID,
        type: 'note',
        body: 'hi',
        record_id: DEAL_ID,
      }),
    );
  });

  it.each(['call', 'meeting', 'email'] as const)('accepts %s as a valid activity type', async (type) => {
    const { db } = buildDb({ createdActivity: { id: 'act2', workspace_id: WORKSPACE_ID, user_id: USER_ID, type } });
    const { createActivityRouter } = await import('../routes/activity');
    const app = buildApp(db, createActivityRouter);

    const res = await request(app)
      .post('/api/activity')
      .send({ type });

    expect(res.status).toBe(201);
  });

  it('rejects an invalid type with 400', async () => {
    const { db } = buildDb();
    const { createActivityRouter } = await import('../routes/activity');
    const app = buildApp(db, createActivityRouter);

    const res = await request(app)
      .post('/api/activity')
      .send({ type: 'bogus', body: 'hi' });

    expect(res.status).toBe(400);
  });
});
