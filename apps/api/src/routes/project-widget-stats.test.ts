import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createProjectWidgetStatsRouter } from './project-widget-stats';

function buildChain(rows: unknown[] = [], scalar?: Record<string, unknown>) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(rows),
    executeTakeFirst: vi.fn().mockResolvedValue(scalar),
  };
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' };
    (req as any).workspace = { id: 'ws-1' };
    next();
  });
}

describe('createProjectWidgetStatsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active, at-risk, overdue, and upcoming-milestone counts', async () => {
    const milestoneChain = buildChain([
      { id: 'milestone-1', name: 'Beta', due_date: new Date('2026-06-25'), project_id: 'project-1' },
    ]);

    const sequentialExecuteTakeFirst = vi.fn()
      .mockResolvedValueOnce({ count: '3' })
      .mockResolvedValueOnce({ count: '1' })
      .mockResolvedValueOnce({ count: '2' });

    const countChain = {
      selectFrom: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
      executeTakeFirst: sequentialExecuteTakeFirst,
    };

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'milestones') return milestoneChain;
        return countChain;
      }),
      fn: {
        countAll: vi.fn(() => ({ as: vi.fn(() => 'count') })),
      },
    } as any;

    const app = express();
    injectUser(app);
    app.use('/api/projects/widget-stats', createProjectWidgetStatsRouter(db));

    const res = await request(app).get('/api/projects/widget-stats');

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual(
      expect.objectContaining({
        active_projects: 3,
        at_risk_projects: 1,
        overdue_tasks: 2,
        upcoming_milestones: expect.arrayContaining([expect.objectContaining({ id: 'milestone-1' })]),
      }),
    );
  });
});
