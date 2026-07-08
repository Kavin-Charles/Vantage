// apps/api/src/routes/pipeline-items.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const WORKSPACE_ID = 'ws-test-1';
const USER_ID = 'user-test-1';
const PIPELINE_ID = 'pipeline-test-1';
const STAGE_A = 'stage-a-uuid-0001';
const STAGE_B = 'stage-b-uuid-0002';
const ITEM_ID = 'item-test-uuid-001';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    'selectFrom', 'insertInto', 'updateTable', 'values', 'set',
    'where', 'selectAll', 'select', 'returningAll', 'returning',
    'orderBy', 'limit', 'offset', 'execute', 'executeTakeFirst',
    'executeTakeFirstOrThrow',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnThis();
  }
  Object.assign(chain, overrides);
  return chain as unknown as Kysely<Database>;
}

function mockPermission() {
  return (_perm: string) =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next();
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID, role: 'admin', workspace_id: WORKSPACE_ID };
    (req as any).workspace = { id: WORKSPACE_ID };
    next();
  });
}

describe('POST /api/pipelines/:pipelineId/items', () => {
  it('creates an item and returns 201 with correct stage_id and field_values', async () => {
    const fakeItem = {
      id: ITEM_ID,
      pipeline_id: PIPELINE_ID,
      stage_id: STAGE_A,
      workspace_id: WORKSPACE_ID,
      field_values: { name: 'Deal Alpha' },
      position: 0,
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // logItemCreated will also call db — build a chain that works for both
    const activityChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    };

    const itemChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue(fakeItem),
    };

    // db dispatches based on which table name is passed
    const db = {
      insertInto: vi.fn((table: string) => {
        if (table === 'pipeline_items') return itemChain;
        return activityChain;
      }),
    } as unknown as Kysely<Database>;

    const { createPipelineItemsRouter } = await import('./pipeline-items');
    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/pipelines/:pipelineId/items', createPipelineItemsRouter(db, mockPermission()));

    const res = await request(app)
      .post(`/api/pipelines/${PIPELINE_ID}/items`)
      .send({ stage_id: STAGE_A, field_values: { name: 'Deal Alpha' } });

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data.stage_id).toBe(STAGE_A);
    expect(res.body.data.field_values).toEqual({ name: 'Deal Alpha' });
  });
});

describe('DELETE /api/items/:id (soft delete)', () => {
  it('soft-deletes an item and it no longer appears in the list', async () => {
    const fakeItem = {
      id: ITEM_ID,
      pipeline_id: PIPELINE_ID,
      stage_id: STAGE_A,
      workspace_id: WORKSPACE_ID,
      field_values: {},
      position: 0,
      deleted_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    // For DELETE: updateTable chain
    const deleteChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(fakeItem),
    };

    // For GET (list): selectFrom chain returns empty after deletion
    const listChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    };

    const db = {
      updateTable: vi.fn(() => deleteChain),
      selectFrom: vi.fn(() => listChain),
    } as unknown as Kysely<Database>;

    const { createItemRouter, createPipelineItemsRouter } = await import('./pipeline-items');

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/items', createItemRouter(db, mockPermission()));
    app.use('/api/pipelines/:pipelineId/items', createPipelineItemsRouter(db, mockPermission()));

    const delRes = await request(app).delete(`/api/items/${ITEM_ID}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.id).toBe(ITEM_ID);

    // After deletion the list should be empty (deleted_at filter applied)
    const listRes = await request(app).get(`/api/pipelines/${PIPELINE_ID}/items`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(0);
  });
});

describe('PATCH /api/items/:id/move + GET /api/items/:id/activity', () => {
  it('records a stage_changed activity event with correct to_stage_id after move', async () => {
    const currentItem = {
      id: ITEM_ID,
      pipeline_id: PIPELINE_ID,
      stage_id: STAGE_A,
    };

    const activityRow = {
      id: 'act-1',
      item_id: ITEM_ID,
      pipeline_id: PIPELINE_ID,
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      event_type: 'stage_changed',
      payload: { from_stage_id: STAGE_A, to_stage_id: STAGE_B },
      created_at: new Date(),
    };

    // selectFrom used in move (fetch current) and in activity feed
    let selectCallCount = 0;
    const selectCurrentChain = {
      select: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(currentItem),
      execute: vi.fn().mockResolvedValue([activityRow]),
    };

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    };

    const activityInsertChain = {
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    };

    const db = {
      selectFrom: vi.fn(() => selectCurrentChain),
      updateTable: vi.fn(() => updateChain),
      insertInto: vi.fn(() => activityInsertChain),
    } as unknown as Kysely<Database>;

    const { createItemRouter } = await import('./pipeline-items');

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/items', createItemRouter(db, mockPermission()));

    const moveRes = await request(app)
      .patch(`/api/items/${ITEM_ID}/move`)
      .send({ stage_id: STAGE_B, position: 1 });

    expect(moveRes.status).toBe(200);
    expect(moveRes.body.data.stage_id).toBe(STAGE_B);

    const actRes = await request(app).get(`/api/items/${ITEM_ID}/activity`);
    expect(actRes.status).toBe(200);

    const events: Array<{ event_type: string; payload: Record<string, unknown> }> = actRes.body.data;
    const stageEvent = events.find((e) => e.event_type === 'stage_changed');
    expect(stageEvent).toBeDefined();
    expect(stageEvent?.payload.to_stage_id).toBe(STAGE_B);
  });
});

describe('PATCH /api/items/:id — won-stage hook', () => {
  it('triggers maybeSpawnProjectOnDealWon when the new stage is_won', async () => {
    vi.mock('../lib/deal-close-hooks', () => ({
      maybeSpawnProjectOnDealWon: vi.fn().mockResolvedValue(undefined),
    }));
    const { maybeSpawnProjectOnDealWon } = await import('../lib/deal-close-hooks');

    // updateItemSchema validates stage_id as a UUID — use UUID-shaped local stage ids
    const WON_STAGE_A = '11111111-1111-4111-8111-111111111111';
    const WON_STAGE_B = '22222222-2222-4222-8222-222222222222';

    const currentItem = { id: ITEM_ID, pipeline_id: PIPELINE_ID, stage_id: WON_STAGE_A, field_values: {} };
    const updatedItem = { ...currentItem, stage_id: WON_STAGE_B };

    const itemChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(currentItem),
    };
    const updateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue(updatedItem),
    };
    const activityChain = { insertInto: vi.fn().mockReturnThis(), values: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue([]) };
    const stageChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ is_won: true }),
    };
    // resolveHook() queries workspace_hook_configs — no hook configured in this test
    const hookConfigChain = {
      selectFrom: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    };

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'pipeline_items') return itemChain;
        if (table === 'pipeline_stages') return stageChain;
        if (table === 'workspace_hook_configs') return hookConfigChain;
        return itemChain;
      }),
      updateTable: vi.fn(() => updateChain),
      insertInto: vi.fn(() => activityChain),
    } as unknown as Kysely<Database>;

    const { createItemRouter } = await import('./pipeline-items');
    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/items', createItemRouter(db, mockPermission()));

    const res = await request(app).patch(`/api/items/${ITEM_ID}`).send({ stage_id: WON_STAGE_B });

    expect(res.status).toBe(200);
    expect(maybeSpawnProjectOnDealWon).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: ITEM_ID, workspaceId: WORKSPACE_ID }),
    );
  });
});
