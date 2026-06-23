import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createDashboardsRouter } from '../routes/dashboards';

function buildApp(db: Partial<Kysely<Database>>, role: 'admin' | 'member' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1', role };
    next();
  });
  app.use('/api/dashboards', createDashboardsRouter(db as Kysely<Database>));
  return app;
}

describe('GET /api/dashboards/group-assignments', () => {
  it('returns groups with their assigned dashboard and the full dashboard list (admin)', async () => {
    const groupRows = [
      { id: 'g1', name: 'Sales', color: '#ff0000', dashboard_id: 'd1' },
      { id: 'g2', name: 'Support', color: '#00ff00', dashboard_id: null },
    ];
    const dashboardRows = [
      { id: 'd1', name: 'Sales Overview' },
      { id: 'd2', name: 'Support Overview' },
    ];
    const db: any = {
      selectFrom: vi.fn((table: string) => {
        const chain: any = {};
        for (const f of ['leftJoin', 'where', 'select', 'orderBy', 'groupBy']) chain[f] = vi.fn(() => chain);
        chain.execute = vi.fn().mockResolvedValue(table.startsWith('groups') ? groupRows : dashboardRows);
        return chain;
      }),
    };
    const res = await request(buildApp(db)).get('/api/dashboards/group-assignments');
    expect(res.status).toBe(200);
    expect(res.body.data.groups).toEqual(groupRows);
    expect(res.body.data.dashboards).toEqual(dashboardRows);
  });

  it('returns 403 for a non-admin', async () => {
    const db: any = {};
    const res = await request(buildApp(db, 'member')).get('/api/dashboards/group-assignments');
    expect(res.status).toBe(403);
  });
});
