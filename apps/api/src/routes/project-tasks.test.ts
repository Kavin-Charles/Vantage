import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/pm-events', () => ({ pmEvents: { emit: vi.fn() } }));

import { createProjectTasksRouter } from './project-tasks';
import { logActivity } from '../lib/log-activity';
import { notify } from '../lib/notify';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    onConflict: vi.fn().mockReturnThis(),
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

// verifyProjectAccess does db.selectFrom('projects')...executeTakeFirst() -> must resolve truthy
function projectAccessChain() {
  return buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) });
}

describe('createProjectTasksRouter activity + notify wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs pm_task_created on POST /', async () => {
    const projectChain = projectAccessChain();
    const taskChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'task-1', project_id: 'project-1', title: 'Ship feature',
      }),
    });
    const assigneeChain = buildChain();
    const db = {
      selectFrom: vi.fn(() => projectChain),
      insertInto: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : assigneeChain)),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    const res = await request(app).post('/api/projects/project-1/tasks').send({ title: 'Ship feature', status_id: 'd3f5880e-4726-4574-b81b-0328cff169b2' });

    expect(res.status).toBe(201);
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_task_created', record_id: 'task-1' }),
    );
  });

  it('notifies assignees when assignee_ids set on POST /', async () => {
    const projectChain = projectAccessChain();
    const taskChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'task-1', project_id: 'project-1', title: 'Ship feature',
      }),
    });
    const assigneeChain = buildChain();
    const db = {
      selectFrom: vi.fn(() => projectChain),
      insertInto: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : assigneeChain)),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    const res = await request(app)
      .post('/api/projects/project-1/tasks')
      .send({ title: 'Ship feature', status_id: 'd3f5880e-4726-4574-b81b-0328cff169b2', assignee_ids: ['900f3ab9-2b54-4dfa-a2f3-9d9f8f3eb24e'] });

    expect(res.status).toBe(201);
    expect(notify).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: '900f3ab9-2b54-4dfa-a2f3-9d9f8f3eb24e', type: 'pm_task_assigned', resourceType: 'projects', resourceId: 'task-1' }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_task_assigned', record_id: 'task-1' }),
    );
  });

  it('notifies assignees on PATCH /:taskId assignee change', async () => {
    const projectChain = projectAccessChain();
    const existingChain = buildChain({
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'task-1', title: 'Ship feature', status_id: 'd3f5880e-4726-4574-b81b-0328cff169b2' }),
    });
    const priorAssigneesChain = buildChain({ execute: vi.fn().mockResolvedValue([]) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'task-1', project_id: 'project-1', title: 'Ship feature', status_id: 'd3f5880e-4726-4574-b81b-0328cff169b2',
      }),
    });
    const deleteChain = buildChain();
    const insertAssigneeChain = buildChain();
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'projects') return projectChain;
        if (table === 'project_task_assignees') return priorAssigneesChain;
        return existingChain;
      }),
      updateTable: vi.fn(() => updateChain),
      deleteFrom: vi.fn(() => deleteChain),
      insertInto: vi.fn(() => insertAssigneeChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    const res = await request(app)
      .patch('/api/projects/project-1/tasks/task-1')
      .send({ assignee_ids: ['8bbc1f6a-d24a-4610-a203-a22c9ea0ff55'] });

    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: '8bbc1f6a-d24a-4610-a203-a22c9ea0ff55', type: 'pm_task_assigned', resourceType: 'projects', resourceId: 'task-1' }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_task_assigned', record_id: 'task-1' }),
    );
  });

  it('does not notify when PATCH /:taskId assignee list is unchanged', async () => {
    const projectChain = projectAccessChain();
    const existingChain = buildChain({
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'task-1', title: 'Ship feature', status_id: 'd3f5880e-4726-4574-b81b-0328cff169b2' }),
    });
    const priorAssigneesChain = buildChain({
      execute: vi.fn().mockResolvedValue([{ user_id: '8bbc1f6a-d24a-4610-a203-a22c9ea0ff55' }]),
    });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'task-1', project_id: 'project-1', title: 'Ship feature', status_id: 'd3f5880e-4726-4574-b81b-0328cff169b2',
      }),
    });
    const deleteChain = buildChain();
    const insertAssigneeChain = buildChain();
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'projects') return projectChain;
        if (table === 'project_task_assignees') return priorAssigneesChain;
        return existingChain;
      }),
      updateTable: vi.fn(() => updateChain),
      deleteFrom: vi.fn(() => deleteChain),
      insertInto: vi.fn(() => insertAssigneeChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    const res = await request(app)
      .patch('/api/projects/project-1/tasks/task-1')
      .send({ assignee_ids: ['8bbc1f6a-d24a-4610-a203-a22c9ea0ff55'] });

    expect(res.status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_task_assigned' }),
    );
  });

  it('logs pm_comment_added on POST /:taskId/comments', async () => {
    const projectChain = projectAccessChain();
    const commentChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'comment-1', task_id: 'task-1', body: 'Looks good' }),
    });
    const db = {
      selectFrom: vi.fn(() => projectChain),
      insertInto: vi.fn(() => commentChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    const res = await request(app).post('/api/projects/project-1/tasks/task-1/comments').send({ body: 'Looks good' });

    expect(res.status).toBe(201);
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_comment_added', record_id: 'task-1' }),
    );
  });
});
