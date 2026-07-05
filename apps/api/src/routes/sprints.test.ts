import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/pm-events', () => ({ pmEvents: { emit: vi.fn() } }));

import { createSprintsRouter } from './sprints';
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

describe('createSprintsRouter activity + pmEvents wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits sprint_started and logs activity on PLANNED -> ACTIVE transition', async () => {
    const projectChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) });
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'PLANNED' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'sprint-1', project_id: 'project-1', name: 'Sprint 4', status: 'ACTIVE' }),
    });
    const selectFromCalls: string[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        selectFromCalls.push(table);
        if (table === 'projects') return projectChain;
        return priorChain;
      }),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/sprints', createSprintsRouter(db));

    await request(app).patch('/api/projects/project-1/sprints/sprint-1').send({ status: 'ACTIVE' });

    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'sprint_started', sprintId: 'sprint-1' }));
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'sprint_started', record_id: 'sprint-1' }),
    );
  });

  it('emits sprint_ended and logs activity on ACTIVE -> COMPLETED transition', async () => {
    const projectChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) });
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'sprint-1', project_id: 'project-1', name: 'Sprint 4', status: 'COMPLETED' }),
    });
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'projects') return projectChain;
        return priorChain;
      }),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/sprints', createSprintsRouter(db));

    await request(app).patch('/api/projects/project-1/sprints/sprint-1').send({ status: 'COMPLETED' });

    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'sprint_ended', sprintId: 'sprint-1' }));
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'sprint_ended', record_id: 'sprint-1' }),
    );
  });

  it('does not emit when status is unchanged', async () => {
    const projectChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) });
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'sprint-1', project_id: 'project-1', name: 'Sprint 4 renamed', status: 'ACTIVE' }),
    });
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'projects') return projectChain;
        return priorChain;
      }),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/sprints', createSprintsRouter(db));

    await request(app).patch('/api/projects/project-1/sprints/sprint-1').send({ name: 'Sprint 4 renamed' });

    expect(pmEvents.emit).not.toHaveBeenCalled();
  });
});
