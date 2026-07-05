import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/pm-events', () => ({ pmEvents: { emit: vi.fn() } }));

import { createMilestonesRouter } from './milestones';
import { logActivity } from '../lib/log-activity';
import { pmEvents } from '../lib/pm-events';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return chain;
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' };
    (req as any).workspace = { id: 'ws-1' };
    next();
  });
}

const PROJECT_ID = 'd3f5880e-4726-4574-b81b-0328cff169b2';
const MILESTONE_ID = '900f3ab9-2b54-4dfa-a2f3-9d9f8f3eb24e';

// verifyProjectAccess-style check does db.selectFrom('projects')...executeTakeFirst() -> must resolve truthy
function projectAccessChain() {
  return buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }) });
}

describe('createMilestonesRouter activity + pmEvents wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs milestone_created on POST /', async () => {
    const projectChain = projectAccessChain();
    const maxPosChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ max: 0 }) });
    const milestoneChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'milestone-1', project_id: PROJECT_ID, name: 'Beta', status: 'PENDING' }),
    });
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'projects') return projectChain;
        return maxPosChain;
      }),
      insertInto: vi.fn(() => milestoneChain),
      fn: { max: vi.fn(() => ({ as: vi.fn().mockReturnValue('max') })) },
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/milestones', createMilestonesRouter(db));

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/milestones`)
      .send({ name: 'Beta', due_date: '2026-07-01' });

    expect(res.status).toBe(201);
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'milestone_created', record_id: 'milestone-1' }),
    );
  });

  it('emits milestone_completed and logs activity on PENDING -> COMPLETED transition', async () => {
    const projectChain = projectAccessChain();
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'PENDING' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: MILESTONE_ID, project_id: PROJECT_ID, name: 'Beta', status: 'COMPLETED' }),
    });
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'projects' ? projectChain : priorChain)),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/milestones', createMilestonesRouter(db));

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(200);
    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'milestone_completed', milestoneId: MILESTONE_ID }));
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'milestone_completed', record_id: MILESTONE_ID }),
    );
  });

  it('does not emit milestone_completed when status stays COMPLETED', async () => {
    const projectChain = projectAccessChain();
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'COMPLETED' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: MILESTONE_ID, project_id: PROJECT_ID, name: 'Beta v2', status: 'COMPLETED' }),
    });
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'projects' ? projectChain : priorChain)),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/milestones', createMilestonesRouter(db));

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}`)
      .send({ name: 'Beta v2' });

    expect(res.status).toBe(200);
    expect(pmEvents.emit).not.toHaveBeenCalled();
  });
});
