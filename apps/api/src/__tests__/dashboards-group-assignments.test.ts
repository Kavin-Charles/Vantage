import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createDashboardsRouter } from '../routes/dashboards';

vi.mock('../middleware/permission', async () => {
  const actual = await vi.importActual<typeof import('../middleware/permission')>('../middleware/permission');
  return {
    ...actual,
    createRequirePermission: () => () => (req: any, res: any, next: any) => {
      if (req.isAdmin) return next();
      res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
    },
  };
});

function buildApp(db: Partial<Kysely<Database>>, isAdmin = true) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1' };
    (req as any).isAdmin = isAdmin;
    next();
  });
  app.use('/api/dashboards', createDashboardsRouter(db as Kysely<Database>));
  return app;
}

describe('GET /api/dashboards/group-assignments', () => {
  it('returns roles with their assigned dashboard and the full dashboard list (admin)', async () => {
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
        chain.execute = vi.fn().mockResolvedValue(table.startsWith('roles') ? groupRows : dashboardRows);
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
    const res = await request(buildApp(db, false)).get('/api/dashboards/group-assignments');
    expect(res.status).toBe(403);
  });
});
