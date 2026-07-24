import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const WORKSPACE_ID = 'ws1';
const USER_ID = 'u1';

// ---------------------------------------------------------------------------
// Per-table fluent chain mock — mirrors the buildDb harness in
// contacts-overview.test.ts but keyed by table name since this route reads
// from companies, contacts, pipeline_items, pipeline_stages, activities and
// tasks in a single request.
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
  company?: unknown;
  contacts?: unknown[];
  pipelineItems?: unknown[];
  pipelineStages?: unknown[];
  activities?: unknown[];
  tasks?: unknown[];
} = {}) {
  const companyChain = makeChain({ executeTakeFirst: opts.company });
  const contactsChain = makeChain({ execute: opts.contacts ?? [] });
  const pipelineItemsChain = makeChain({ execute: opts.pipelineItems ?? [] });
  const pipelineStagesChain = makeChain({ execute: opts.pipelineStages ?? [] });
  const activitiesChain = makeChain({ execute: opts.activities ?? [] });
  const tasksChain = makeChain({ execute: opts.tasks ?? [] });

  const selectFrom = vi.fn((table: string) => {
    if (table === 'companies') return companyChain;
    if (table === 'contacts') return contactsChain;
    if (table === 'pipeline_items') return pipelineItemsChain;
    if (table === 'pipeline_stages') return pipelineStagesChain;
    if (table === 'activities') return activitiesChain;
    if (table === 'tasks') return tasksChain;
    throw new Error(`buildDb: unexpected table "${table}"`);
  });

  const db = { selectFrom } as unknown;
  return { db, companyChain, contactsChain, pipelineItemsChain, pipelineStagesChain, activitiesChain, tasksChain };
}

const noopPermission = () => (_req: unknown, _res: unknown, next: () => void) => next();

function buildApp(db: unknown, createCompaniesOverviewRouter: (db: never, requirePermission: never) => express.Router) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { workspace: unknown }).workspace = { id: WORKSPACE_ID };
    (req as unknown as { user: unknown }).user = { id: USER_ID, role: 'admin' };
    next();
  });
  app.use('/api/companies', createCompaniesOverviewRouter(db as never, noopPermission as never));
  return app;
}

describe('GET /api/companies/:id/overview', () => {
  it('returns 404 when the company does not exist (missing)', async () => {
    const { db } = buildDb({ company: undefined });
    const { createCompaniesOverviewRouter } = await import('../routes/companies-overview');
    const app = buildApp(db, createCompaniesOverviewRouter);

    const res = await request(app).get('/api/companies/nope/overview');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ data: null, error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('returns 404 when the company is soft-deleted (query scoped by deleted_at is null returns nothing)', async () => {
    const { db, companyChain } = buildDb({ company: undefined });
    const { createCompaniesOverviewRouter } = await import('../routes/companies-overview');
    const app = buildApp(db, createCompaniesOverviewRouter);

    const res = await request(app).get('/api/companies/co-deleted/overview');

    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(companyChain['where']).toHaveBeenCalledWith('deleted_at', 'is', null);
  });

  it('returns 404 for a company belonging to another workspace (query is scoped by workspace_id)', async () => {
    const { db, companyChain } = buildDb({ company: undefined });
    const { createCompaniesOverviewRouter } = await import('../routes/companies-overview');
    const app = buildApp(db, createCompaniesOverviewRouter);

    const res = await request(app).get('/api/companies/co-other-ws/overview');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(companyChain['where']).toHaveBeenCalledWith('workspace_id', '=', WORKSPACE_ID);
  });

  it('aggregates contacts, deals, tasks and activities into overview metrics', async () => {
    const company = {
      id: 'co1',
      workspace_id: WORKSPACE_ID,
      name: 'Acme Inc',
      deleted_at: null,
    };
    const contacts = [
      { id: 'c1', workspace_id: WORKSPACE_ID, company_id: 'co1', name: 'Alice', email: 'alice@example.com', deleted_at: null },
      { id: 'c2', workspace_id: WORKSPACE_ID, company_id: 'co1', name: 'Bob', email: 'bob@example.com', deleted_at: null },
    ];
    // pipeline_items rows — deal name/value live in field_values jsonb; stage
    // names must be resolved separately from pipeline_stages by stage_id.
    const pipelineItems = [
      {
        id: 'd1',
        workspace_id: WORKSPACE_ID,
        contact_id: 'c1',
        company_id: 'co1',
        stage_id: 'stage-lead',
        field_values: { name: 'Website Revamp', value: 1000 },
        deleted_at: null,
      },
      {
        id: 'd2',
        workspace_id: WORKSPACE_ID,
        contact_id: 'c2',
        company_id: 'co1',
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
      { id: 'a2', workspace_id: WORKSPACE_ID, contact_id: 'c2', type: 'email', created_at: new Date('2026-07-18T10:00:00.000Z') },
    ];
    const tasks = [
      { id: 't1', workspace_id: WORKSPACE_ID, contact_id: 'c1', assignee_id: 'u1', title: 'Follow up', status: 'todo', created_at: new Date('2026-07-21T10:00:00.000Z') },
    ];
    const { db, pipelineStagesChain, contactsChain } = buildDb({ company, contacts, pipelineItems, pipelineStages, activities, tasks });
    const { createCompaniesOverviewRouter } = await import('../routes/companies-overview');
    const app = buildApp(db, createCompaniesOverviewRouter);

    const res = await request(app).get('/api/companies/co1/overview');

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const { data } = res.body;
    expect(data.company.id).toBe('co1');
    expect(data.contacts).toHaveLength(2);
    expect(data.deals).toHaveLength(2);
    expect(data.activities).toHaveLength(2);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].id).toBe('t1');

    expect(data.metrics.total_deal_value).toBe(3000);
    expect(data.metrics.open_deal_count).toBe(2);
    expect(data.metrics.contact_count).toBe(2);
    expect(data.metrics.last_activity_at).toBe(activities[0].created_at.toISOString());

    // deals must be mapped from field_values + resolved stage name
    expect(data.deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'd1', name: 'Website Revamp', value: 1000, stage_id: 'stage-lead', stage: 'Lead', contact_id: 'c1', company_id: 'co1' }),
        expect.objectContaining({ id: 'd2', name: 'Support Contract', value: 2000, stage_id: 'stage-proposal', stage: 'Proposal', contact_id: 'c2', company_id: 'co1' }),
      ]),
    );

    expect(pipelineStagesChain['where']).toHaveBeenCalledWith('id', 'in', ['stage-lead', 'stage-proposal']);
    expect(contactsChain['where']).toHaveBeenCalledWith('company_id', '=', 'co1');
  });

  it('returns empty contacts/deals/activities/tasks and zeroed metrics when the company has no contacts (guards empty "in" lists)', async () => {
    const company = {
      id: 'co2',
      workspace_id: WORKSPACE_ID,
      name: 'Empty Co',
      deleted_at: null,
    };
    const { db, pipelineStagesChain, activitiesChain, tasksChain } = buildDb({ company, contacts: [], pipelineItems: [] });
    const { createCompaniesOverviewRouter } = await import('../routes/companies-overview');
    const app = buildApp(db, createCompaniesOverviewRouter);

    const res = await request(app).get('/api/companies/co2/overview');

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.contacts).toEqual([]);
    expect(data.deals).toEqual([]);
    expect(data.activities).toEqual([]);
    expect(data.tasks).toEqual([]);
    expect(data.metrics.total_deal_value).toBe(0);
    expect(data.metrics.open_deal_count).toBe(0);
    expect(data.metrics.contact_count).toBe(0);
    expect(data.metrics.last_activity_at).toBeNull();
    expect(pipelineStagesChain['execute']).not.toHaveBeenCalled();
    expect(activitiesChain['execute']).not.toHaveBeenCalled();
    expect(tasksChain['execute']).not.toHaveBeenCalled();
  });
});
