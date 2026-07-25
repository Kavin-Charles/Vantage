import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errors';

// Deals are pipeline_items records (deals were migrated to a records model).
// The create/update handlers under test live in ../routes/pipeline-items.

const WORKSPACE_ID = 'ws1';
const USER_ID = 'u1';
const PIPELINE_ID = 'p1';
const STAGE_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = 'item-1';

// ---------------------------------------------------------------------------
// Per-table fluent chain mock — mirrors the buildDb harness in
// pipeline-items-links.test.ts, extended with insertInto/updateTable since
// the create + update handlers under test go through those.
// ---------------------------------------------------------------------------
function makeChain(leafValues: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {};
  const FLUENT = ['where', 'selectAll', 'select', 'orderBy', 'limit', 'offset', 'returningAll', 'values', 'set'];
  for (const m of FLUENT) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(leafValues['execute'] ?? []);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirst'] ?? undefined);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirstOrThrow'] ?? {});
  return chain;
}

function buildDb(opts: {
  createdItem?: unknown;
  currentItem?: unknown;
  updatedItem?: unknown;
} = {}) {
  const insertItemsChain = makeChain({ executeTakeFirstOrThrow: opts.createdItem ?? { id: ITEM_ID, pipeline_id: PIPELINE_ID, workspace_id: WORKSPACE_ID } });
  const insertActivityChain = makeChain({});
  const selectItemsChain = makeChain({ executeTakeFirst: opts.currentItem });
  const updateItemsChain = makeChain({ executeTakeFirstOrThrow: opts.updatedItem ?? opts.currentItem });

  const insertInto = vi.fn((table: string) => {
    if (table === 'pipeline_items') return insertItemsChain;
    if (table === 'pipeline_activity') return insertActivityChain;
    throw new Error(`buildDb: unexpected insertInto table "${table}"`);
  });

  const selectFrom = vi.fn((table: string) => {
    if (table === 'pipeline_items') return selectItemsChain;
    throw new Error(`buildDb: unexpected selectFrom table "${table}"`);
  });

  const updateTable = vi.fn((table: string) => {
    if (table === 'pipeline_items') return updateItemsChain;
    throw new Error(`buildDb: unexpected updateTable table "${table}"`);
  });

  const db = { insertInto, selectFrom, updateTable } as unknown;
  return { db, insertItemsChain, selectItemsChain, updateItemsChain };
}

const noopPermission = () => (_req: unknown, _res: unknown, next: () => void) => next();

function buildCreateApp(db: unknown, createPipelineItemsRouter: (db: never, requirePermission: never) => express.Router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { workspace: unknown }).workspace = { id: WORKSPACE_ID };
    (req as unknown as { user: unknown }).user = { id: USER_ID, role: 'admin' };
    next();
  });
  app.use('/api/pipelines/:pipelineId/items', createPipelineItemsRouter(db as never, noopPermission as never));
  app.use(errorHandler);
  return app;
}

function buildItemApp(db: unknown, createItemRouter: (db: never, requirePermission: never) => express.Router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { workspace: unknown }).workspace = { id: WORKSPACE_ID };
    (req as unknown as { user: unknown }).user = { id: USER_ID, role: 'admin' };
    next();
  });
  app.use('/api/items', createItemRouter(db as never, noopPermission as never));
  app.use(errorHandler);
  return app;
}

describe('POST /api/pipelines/:pipelineId/items — deal priority', () => {
  it('persists and returns priority when provided', async () => {
    const { db, insertItemsChain } = buildDb({
      createdItem: { id: ITEM_ID, pipeline_id: PIPELINE_ID, workspace_id: WORKSPACE_ID, priority: 'high' },
    });
    const { createPipelineItemsRouter } = await import('../routes/pipeline-items');
    const app = buildCreateApp(db, createPipelineItemsRouter);

    const res = await request(app)
      .post(`/api/pipelines/${PIPELINE_ID}/items`)
      .send({ stage_id: STAGE_ID, priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.data.priority).toBe('high');
    expect(insertItemsChain['values']).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'high' }),
    );
  });

  it('rejects an invalid priority value with 400', async () => {
    const { db } = buildDb();
    const { createPipelineItemsRouter } = await import('../routes/pipeline-items');
    const app = buildCreateApp(db, createPipelineItemsRouter);

    const res = await request(app)
      .post(`/api/pipelines/${PIPELINE_ID}/items`)
      .send({ stage_id: STAGE_ID, priority: 'bogus' });

    expect(res.status).toBe(400);
  });

  it('defaults priority to null when omitted', async () => {
    const { db, insertItemsChain } = buildDb();
    const { createPipelineItemsRouter } = await import('../routes/pipeline-items');
    const app = buildCreateApp(db, createPipelineItemsRouter);

    const res = await request(app)
      .post(`/api/pipelines/${PIPELINE_ID}/items`)
      .send({ stage_id: STAGE_ID });

    expect(res.status).toBe(201);
    expect(insertItemsChain['values']).toHaveBeenCalledWith(
      expect.objectContaining({ priority: null }),
    );
  });
});

describe('PATCH /api/items/:id — deal priority', () => {
  const currentItem = {
    id: ITEM_ID,
    workspace_id: WORKSPACE_ID,
    pipeline_id: PIPELINE_ID,
    stage_id: STAGE_ID,
    field_values: {},
    priority: null,
    deleted_at: null,
  };

  it('persists and returns priority when provided in the update body', async () => {
    const { db, updateItemsChain } = buildDb({
      currentItem,
      updatedItem: { ...currentItem, priority: 'urgent' },
    });
    const { createItemRouter } = await import('../routes/pipeline-items');
    const app = buildItemApp(db, createItemRouter);

    const res = await request(app)
      .patch(`/api/items/${ITEM_ID}`)
      .send({ priority: 'urgent' });

    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe('urgent');
    expect(updateItemsChain['set']).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'urgent' }),
    );
  });

  it('rejects an invalid priority value with 400', async () => {
    const { db } = buildDb({ currentItem });
    const { createItemRouter } = await import('../routes/pipeline-items');
    const app = buildItemApp(db, createItemRouter);

    const res = await request(app)
      .patch(`/api/items/${ITEM_ID}`)
      .send({ priority: 'bogus' });

    expect(res.status).toBe(400);
  });

  it('leaves priority untouched when omitted from the update body', async () => {
    const { db, updateItemsChain } = buildDb({ currentItem });
    const { createItemRouter } = await import('../routes/pipeline-items');
    const app = buildItemApp(db, createItemRouter);

    const res = await request(app)
      .patch(`/api/items/${ITEM_ID}`)
      .send({ stage_id: STAGE_ID });

    expect(res.status).toBe(200);
    const setCallArg = (updateItemsChain['set'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCallArg).not.toHaveProperty('priority');
  });
});
