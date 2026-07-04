import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/alert-service', () => ({
  createAlert: vi.fn().mockResolvedValue(undefined),
  hasOpenAlert: vi.fn().mockResolvedValue(false),
}));

import { createProjectsRouter } from './projects';
import { logActivity } from '../lib/log-activity';
import { createAlert } from '../lib/alert-service';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
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

describe('createProjectsRouter activity + alert wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs project_created on POST /', async () => {
    const projectChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'project-1', workspace_id: 'ws-1', name: 'Launch', status: 'ACTIVE', health: 'ON_TRACK',
      }),
    });
    // seedDefaultStatuses also calls db.insertInto(...).values(...).execute()
    const seedChain = buildChain();
    const db = {
      insertInto: vi.fn()
        .mockReturnValueOnce(projectChain)
        .mockReturnValue(seedChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects', createProjectsRouter(db));

    await request(app).post('/api/projects').send({ name: 'Launch' });

    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'project_created', workspace_id: 'ws-1', record_id: 'project-1' }),
    );
  });

  it('logs project_archived when status PATCHed to ARCHIVED', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE', health: 'ON_TRACK' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'project-1', workspace_id: 'ws-1', name: 'Launch', status: 'ARCHIVED', health: 'ON_TRACK',
      }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects', createProjectsRouter(db));

    await request(app).patch('/api/projects/project-1').send({ status: 'ARCHIVED' });

    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'project_archived', record_id: 'project-1' }),
    );
  });

  it('raises an alert when health PATCHed to OFF_TRACK', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE', health: 'ON_TRACK' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'project-1', workspace_id: 'ws-1', name: 'Launch', status: 'ACTIVE', health: 'OFF_TRACK',
      }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects', createProjectsRouter(db));

    await request(app).patch('/api/projects/project-1').send({ health: 'OFF_TRACK' });

    expect(createAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: 'ws-1', resourceType: 'projects', resourceId: 'project-1', severity: 'warning' }),
    );
  });
});
