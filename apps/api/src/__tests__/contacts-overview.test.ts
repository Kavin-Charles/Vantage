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
  pipelineItems?: unknown[];
  pipelineStages?: unknown[];
  activities?: unknown[];
  tasks?: unknown[];
} = {}) {
  const contactChain = makeChain({ executeTakeFirst: opts.contact });
  const pipelineItemsChain = makeChain({ execute: opts.pipelineItems ?? [] });
  const pipelineStagesChain = makeChain({ execute: opts.pipelineStages ?? [] });
  const activitiesChain = makeChain({ execute: opts.activities ?? [] });
  const tasksChain = makeChain({ execute: opts.tasks ?? [] });

  const selectFrom = vi.fn((table: string) => {
    if (table === 'contacts') return contactChain;
    if (table === 'pipeline_items') return pipelineItemsChain;
    if (table === 'pipeline_stages') return pipelineStagesChain;
    if (table === 'activities') return activitiesChain;
    if (table === 'tasks') return tasksChain;
    throw new Error(`buildDb: unexpected table "${table}"`);
  });

  const db = { selectFrom } as unknown;
  return { db, contactChain, pipelineItemsChain, pipelineStagesChain, activitiesChain, tasksChain };
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

  it('aggregates deals, tasks and activities into overview metrics and stage_funnel', async () => {
    const contact = {
      id: 'c1',
      workspace_id: WORKSPACE_ID,
      name: 'Alice',
      email: 'alice@example.com',
      last_contacted_at: new Date('2026-07-20T10:00:00.000Z'),
      deleted_at: null,
    };
    // pipeline_items rows — deal name/value live in field_values jsonb; stage
    // names must be resolved separately from pipeline_stages by stage_id.
    const pipelineItems = [
      {
        id: 'd1',
        workspace_id: WORKSPACE_ID,
        contact_id: 'c1',
        company_id: null,
        stage_id: 'stage-lead',
        field_values: { name: 'Website Revamp', value: 1000 },
        deleted_at: null,
      },
      {
        id: 'd2',
        workspace_id: WORKSPACE_ID,
        contact_id: 'c1',
        company_id: null,
        stage_id: 'stage-proposal',
        field_values: { name: 'Support Contract', value: 2000 },
        deleted_at: null,
      },
    ];
    const pipelineStages = [
      { id: 'stage-lead', name: 'Lead' },
      { id: 'stage-proposal', name: 'Proposal' },
    ];
    const activities = [
      { id: 'a1', workspace_id: WORKSPACE_ID, contact_id: 'c1', type: 'call', created_at: new Date('2026-07-20T10:00:00.000Z') },
      { id: 'a2', workspace_id: WORKSPACE_ID, contact_id: 'c1', type: 'email', created_at: new Date('2026-07-18T10:00:00.000Z') },
      { id: 'a3', workspace_id: WORKSPACE_ID, contact_id: 'c1', type: 'note', created_at: new Date('2026-07-15T10:00:00.000Z') },
    ];
    const tasks = [
      { id: 't1', workspace_id: WORKSPACE_ID, contact_id: 'c1', assignee_id: 'u1', title: 'Follow up', status: 'todo', created_at: new Date('2026-07-21T10:00:00.000Z') },
    ];
    const { db, pipelineItemsChain, pipelineStagesChain } = buildDb({ contact, pipelineItems, pipelineStages, activities, tasks });
    const { createContactsOverviewRouter } = await import('../routes/contacts-overview');
    const app = buildApp(db, createContactsOverviewRouter);

    const res = await request(app).get('/api/contacts/c1/overview');

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const { data } = res.body;
    expect(data.contact.id).toBe('c1');
    expect(data.deals).toHaveLength(2);
    expect(data.activities).toHaveLength(3);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].id).toBe('t1');
    expect(data.metrics.total_deal_value).toBe(3000);
    expect(data.metrics.interaction_count).toBe(3);
    expect(data.metrics.current_stage).toBe('Lead');

    // deals must be mapped from field_values + resolved stage name
    expect(data.deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'd1', name: 'Website Revamp', value: 1000, stage_id: 'stage-lead', stage: 'Lead', contact_id: 'c1', company_id: null }),
        expect.objectContaining({ id: 'd2', name: 'Support Contract', value: 2000, stage_id: 'stage-proposal', stage: 'Proposal', contact_id: 'c1', company_id: null }),
      ]),
    );

    // stage_funnel must sum deal value per stage, keyed by stage NAME
    expect(data.stage_funnel).toEqual(
      expect.arrayContaining([
        { stage: 'Lead', total: 1000 },
        { stage: 'Proposal', total: 2000 },
      ]),
    );
    const funnelTotal = data.stage_funnel.reduce((s: number, e: { total: number }) => s + e.total, 0);
    expect(funnelTotal).toBe(3000);

    expect(pipelineStagesChain['where']).toHaveBeenCalledWith('id', 'in', ['stage-lead', 'stage-proposal']);

    // current_stage must be deterministic — pipeline_items is ordered by
    // created_at desc so the most recently created deal wins, not whatever
    // order the DB happens to return rows in.
    expect(pipelineItemsChain['orderBy']).toHaveBeenCalledWith('created_at', 'desc');
  });

  it('does not query pipeline_stages when the contact has no deals (guards empty "in" list)', async () => {
    const contact = {
      id: 'c2',
      workspace_id: WORKSPACE_ID,
      name: 'Bob',
      email: 'bob@example.com',
      last_contacted_at: null,
      deleted_at: null,
    };
    const { db, pipelineStagesChain } = buildDb({ contact, pipelineItems: [], activities: [], tasks: [] });
    const { createContactsOverviewRouter } = await import('../routes/contacts-overview');
    const app = buildApp(db, createContactsOverviewRouter);

    const res = await request(app).get('/api/contacts/c2/overview');

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.deals).toEqual([]);
    expect(data.metrics.total_deal_value).toBe(0);
    expect(data.metrics.current_stage).toBeNull();
    expect(data.stage_funnel).toEqual([]);
    expect(pipelineStagesChain['execute']).not.toHaveBeenCalled();
  });
});
