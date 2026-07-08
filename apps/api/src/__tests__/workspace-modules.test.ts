// apps/api/src/__tests__/workspace-modules.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createWorkspaceModulesRouter } from '../routes/workspace-modules';

function buildApp(db: Partial<Kysely<Database>>, role: 'admin' | 'member' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1', role };
    next();
  });
  app.use('/api/workspace/modules', createWorkspaceModulesRouter(db as Kysely<Database>));
  return app;
}

const mockModuleRows = [
  { module_id: 'contacts', enabled: true },
  { module_id: 'companies', enabled: true },
  { module_id: 'pipelines', enabled: false },
];

describe('GET /api/workspace/modules', () => {
  it('returns all modules with enabled status', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        selectAll: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(mockModuleRows),
      }),
    };
    const res = await request(buildApp(db)).get('/api/workspace/modules');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toMatchObject({ module_id: 'contacts', enabled: true });
  });
});

describe('PATCH /api/workspace/modules/:moduleId', () => {
  it('toggles module enabled status (admin)', async () => {
    const updateResult = { numUpdatedRows: BigInt(1) };
    const providerUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    };
    const db: any = {
      updateTable: vi.fn((table: string) => {
        if (table === 'hook_providers') return providerUpdateChain;
        return {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          executeTakeFirst: vi.fn().mockResolvedValue(updateResult),
        };
      }),
    };
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/contacts')
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ module_id: 'contacts', enabled: false });
  });

  it('returns 404 when module row does not exist for workspace', async () => {
    const updateResult = { numUpdatedRows: BigInt(0) };
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(updateResult),
      }),
    };
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/contacts')
      .send({ enabled: false });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MODULE_NOT_FOUND');
  });

  it('returns 403 for non-admin', async () => {
    const db: any = {};
    const res = await request(buildApp(db, 'member'))
      .patch('/api/workspace/modules/contacts')
      .send({ enabled: false });
    expect(res.status).toBe(403);
  });

  it('returns 400 for unknown moduleId', async () => {
    const db: any = {};
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/unknown-module')
      .send({ enabled: false });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid body (INVALID_BODY)', async () => {
    const db: any = {};
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/contacts')
      .send({ enabled: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });
});
