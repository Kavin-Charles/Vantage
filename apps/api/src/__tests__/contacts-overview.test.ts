import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const WORKSPACE_ID = 'ws1';
const USER_ID = 'u1';

// ---------------------------------------------------------------------------
// Per-table fluent chain mock — mirrors the buildDb harness in contacts.test.ts
// but keyed by table name since this route reads from contacts, deals and
// activities in a single request.
// ---------------------------------------------------------------------------
function makeChain(leafValues: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {};
  const FLUENT = ['where', 'selectAll', 'select', 'orderBy', 'limit', 'offset'];
  for (const m of FLUENT) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(leafValues['execute'] ?? []);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(leafValues['executeTakeFirst'] ?? undefined);
  return chain;
}

function buildDb(opts: {
  contact?: unknown;
  deals?: unknown[];
  activities?: unknown[];
} = {}) {
  const contactChain = makeChain({ executeTakeFirst: opts.contact });
  const dealsChain = makeChain({ execute: opts.deals ?? [] });
  const activitiesChain = makeChain({ execute: opts.activities ?? [] });

  const selectFrom = vi.fn((table: string) => {
    if (table === 'contacts') return contactChain;
    if (table === 'deals') return dealsChain;
    if (table === 'activities') return activitiesChain;
    throw new Error(`buildDb: unexpected table "${table}"`);
  });

  const db = { selectFrom } as unknown;
  return { db, contactChain, dealsChain, activitiesChain };
}

const noopPermission = () => (_req: unknown, _res: unknown, next: () => void) => next();

function buildApp(db: unknown, createContactsOverviewRouter: (db: never, requirePermission: never) => express.Router) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { workspace: unknown }).workspace = { id: WORKSPACE_ID };
    (req as unknown as { user: unknown }).user = { id: USER_ID, role: 'admin' };
    next();
  });
  app.use('/api/contacts', createContactsOverviewRouter(db as never, noopPermission as never));
  return app;
}

describe('GET /api/contacts/:id/overview', () => {
  it('returns 404 when the contact does not exist (missing)', async () => {
    const { db } = buildDb({ contact: undefined });
    const { createContactsOverviewRouter } = await import('../routes/contacts-overview');
    const app = buildApp(db, createContactsOverviewRouter);

    const res = await request(app).get('/api/contacts/nope/overview');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ data: null, error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('returns 404 when the contact is soft-deleted (query scoped by deleted_at is null returns nothing)', async () => {
    // Soft-deleted rows are excluded at the query layer, so the mock simulates
    // that by resolving no row — the important assertion is that the handler
    // filters on deleted_at is null before deciding "not found".
    const { db, contactChain } = buildDb({ contact: undefined });
    const { createContactsOverviewRouter } = await import('../routes/contacts-overview');
    const app = buildApp(db, createContactsOverviewRouter);

    const res = await request(app).get('/api/contacts/c-deleted/overview');

    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(contactChain['where']).toHaveBeenCalledWith('deleted_at', 'is', null);
  });

  it('returns 404 for a contact belonging to another workspace (query is scoped by workspace_id)', async () => {
    const { db, contactChain } = buildDb({ contact: undefined });
    const { createContactsOverviewRouter } = await import('../routes/contacts-overview');
    const app = buildApp(db, createContactsOverviewRouter);

    const res = await request(app).get('/api/contacts/c-other-ws/overview');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(contactChain['where']).toHaveBeenCalledWith('workspace_id', '=', WORKSPACE_ID);
  });

  it('aggregates deals and activities into overview metrics and stage_funnel', async () => {
    const contact = {
      id: 'c1',
      workspace_id: WORKSPACE_ID,
      name: 'Alice',
      email: 'alice@example.com',
      last_contacted_at: new Date('2026-07-20T10:00:00.000Z'),
      deleted_at: null,
    };
    const deals = [
      { id: 'd1', workspace_id: WORKSPACE_ID, contact_id: 'c1', stage_id: 'lead', value: 1000, deleted_at: null },
      { id: 'd2', workspace_id: WORKSPACE_ID, contact_id: 'c1', stage_id: 'proposal', value: 2000, deleted_at: null },
    ];
    const activities = [
      { id: 'a1', workspace_id: WORKSPACE_ID, contact_id: 'c1', type: 'call', created_at: new Date('2026-07-20T10:00:00.000Z') },
      { id: 'a2', workspace_id: WORKSPACE_ID, contact_id: 'c1', type: 'email', created_at: new Date('2026-07-18T10:00:00.000Z') },
      { id: 'a3', workspace_id: WORKSPACE_ID, contact_id: 'c1', type: 'note', created_at: new Date('2026-07-15T10:00:00.000Z') },
    ];
    const { db } = buildDb({ contact, deals, activities });
    const { createContactsOverviewRouter } = await import('../routes/contacts-overview');
    const app = buildApp(db, createContactsOverviewRouter);

    const res = await request(app).get('/api/contacts/c1/overview');

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const { data } = res.body;
    expect(data.contact.id).toBe('c1');
    expect(data.deals).toHaveLength(2);
    expect(data.activities).toHaveLength(3);
    expect(data.metrics.total_deal_value).toBe(3000);
    expect(data.metrics.interaction_count).toBe(3);

    // stage_funnel must sum deal value per stage
    expect(data.stage_funnel).toEqual(
      expect.arrayContaining([
        { stage: 'lead', total: 1000 },
        { stage: 'proposal', total: 2000 },
      ]),
    );
    const funnelTotal = data.stage_funnel.reduce((s: number, e: { total: number }) => s + e.total, 0);
    expect(funnelTotal).toBe(3000);
  });
});
