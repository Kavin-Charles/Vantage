import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { bridgeRegistry } from '@vencore/plugin-runtime';

const WORKSPACE_ID = 'ws-test-1';
const USER_ID = 'user-test-1';

function recordingDb(overrides: Record<string, unknown> = {}) {
  const whereCalls: unknown[][] = [];
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    'selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'values', 'set',
    'where', 'selectAll', 'select', 'returningAll', 'returning',
    'innerJoin', 'leftJoin', 'orderBy', 'limit', 'offset',
  ];
  for (const m of methods) {
    chain[m] = vi.fn((...args: unknown[]) => {
      if (m === 'where') whereCalls.push(args);
      return chain;
    });
  }
  chain['execute'] = vi.fn().mockResolvedValue([]);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue({ id: 'row-1' });
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ id: 'row-1' });
  Object.assign(chain, overrides);
  return { db: chain as unknown as Kysely<Database>, whereCalls, chain };
}

function countWhere(whereCalls: unknown[][], args: unknown[]): number {
  return whereCalls.filter(c => JSON.stringify(c) === JSON.stringify(args)).length;
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID, role: 'admin', workspace_id: WORKSPACE_ID };
    (req as any).workspace = { id: WORKSPACE_ID };
    next();
  });
}

describe('pm-search excludes deleted projects', () => {
  it('filters status != DELETED on tasks, projects and docs queries', async () => {
    const { db, whereCalls } = recordingDb();
    const { createPmSearchRouter } = await import('../routes/pm-search');
    const app = express();
    injectUser(app);
    app.use('/api/pm/search', createPmSearchRouter(db));

    const res = await request(app).get('/api/pm/search?q=alpha');

    expect(res.status).toBe(200);
    expect(countWhere(whereCalls, ['p.status', '!=', 'DELETED'])).toBe(3);
  });
});

describe('plugin bridge reads exclude soft-deleted rows', () => {
  it('companies.list and companies.get filter deleted_at', async () => {
    const { registerCompaniesBridgeMethods } = await import('../routes/companies');
    registerCompaniesBridgeMethods();
    const ctx = { workspaceId: WORKSPACE_ID } as any;

    const list = recordingDb();
    await bridgeRegistry.lookup('companies.list')!.handle(ctx, {}, list.db as any);
    expect(countWhere(list.whereCalls, ['deleted_at', 'is', null])).toBe(1);

    const get = recordingDb();
    await bridgeRegistry.lookup('companies.get')!.handle(ctx, { id: 'c-1' }, get.db as any);
    expect(countWhere(get.whereCalls, ['deleted_at', 'is', null])).toBe(1);
  });

  it('deals.list and deals.get filter deleted_at', async () => {
    const { registerDealsBridgeMethods } = await import('../routes/pipelines');
    registerDealsBridgeMethods();
    const ctx = { workspaceId: WORKSPACE_ID } as any;

    const list = recordingDb();
    await bridgeRegistry.lookup('deals.list')!.handle(ctx, {}, list.db as any);
    expect(countWhere(list.whereCalls, ['deleted_at', 'is', null])).toBe(1);

    const get = recordingDb();
    await bridgeRegistry.lookup('deals.get')!.handle(ctx, { id: 'd-1' }, get.db as any);
    expect(countWhere(get.whereCalls, ['deleted_at', 'is', null])).toBe(1);
  });

  it('deals.delete soft-deletes instead of hard deleting', async () => {
    const { registerDealsBridgeMethods } = await import('../routes/pipelines');
    registerDealsBridgeMethods();
    const ctx = { workspaceId: WORKSPACE_ID } as any;

    const del = recordingDb();
    await bridgeRegistry.lookup('deals.delete')!.handle(ctx, { id: 'd-1' }, del.db as any);

    expect(del.chain['deleteFrom']).not.toHaveBeenCalled();
    expect(del.chain['updateTable']).toHaveBeenCalledWith('deals');
    const setArg = del.chain['set'].mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg?.['deleted_at']).toBeInstanceOf(Date);
  });
});

describe('project sub-resource guards exclude deleted projects', () => {
  it('milestones list guard filters status != DELETED', async () => {
    const { db, whereCalls } = recordingDb();
    const { createMilestonesRouter } = await import('../routes/milestones');
    const app = express();
    injectUser(app);
    app.use('/api/projects/:projectId/milestones', createMilestonesRouter(db));

    const res = await request(app).get('/api/projects/p-1/milestones');

    expect(res.status).toBe(200);
    expect(countWhere(whereCalls, ['status', '!=', 'DELETED'])).toBeGreaterThanOrEqual(1);
  });
});

describe('contact tag detach ignores soft-deleted contacts', () => {
  it('existence check filters deleted_at', async () => {
    const { db, whereCalls } = recordingDb();
    const { createContactsRouter } = await import('../routes/contacts');
    const app = express();
    app.use(express.json());
    injectUser(app);
    const allow = (_p: string) =>
      (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
    app.use('/api/contacts', createContactsRouter(db, allow));

    const res = await request(app).delete('/api/contacts/c-1/tags/t-1');

    expect(res.status).toBe(200);
    expect(countWhere(whereCalls, ['deleted_at', 'is', null])).toBeGreaterThanOrEqual(1);
  });
});
