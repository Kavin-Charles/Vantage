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
    (req as any).user = { id: 'user-1' };
    (req as any).isAdmin = role === 'admin';
    (req as any).permissions = new Set<string>();
    next();
  });
  app.use('/api/workspace/modules', createWorkspaceModulesRouter(db as Kysely<Database>));
  return app;
}

const mockModuleRows = [
  { module_id: 'crm', enabled: true },
  { module_id: 'infra', enabled: true },
  { module_id: 'messaging', enabled: false },
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
    expect(res.body.data[0]).toMatchObject({ module_id: 'crm', enabled: true });
  });
});

describe('PATCH /api/workspace/modules/:moduleId', () => {
  it('upserts module enabled status (admin)', async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const providerUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    };
    const db: any = {
      insertInto: vi.fn().mockReturnValue(insertChain),
      updateTable: vi.fn(() => providerUpdateChain),
    };
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/crm')
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ module_id: 'crm', enabled: false });
    expect(db.insertInto).toHaveBeenCalledWith('workspace_modules');
  });

  it('upserts a crm sub-module row (crm:contacts) without a pre-existing row', async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const db: any = {
      insertInto: vi.fn().mockReturnValue(insertChain),
      updateTable: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      })),
    };
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/crm:contacts')
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ module_id: 'crm:contacts', enabled: false });
  });

  it('PATCH accepts an infra child module id and upserts the row', async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const db: any = {
      insertInto: vi.fn().mockReturnValue(insertChain),
      updateTable: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      })),
    };
    const res = await request(buildApp(db))
      .patch('/api/workspace/modules/infra:servers')
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ module_id: 'infra:servers', enabled: false });
    expect(insertChain.onConflict).toHaveBeenCalled();
  });

  it('returns 403 for non-admin', async () => {
    const db: any = {};
    const res = await request(buildApp(db, 'member'))
      .patch('/api/workspace/modules/crm')
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
      .patch('/api/workspace/modules/crm')
      .send({ enabled: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });
});
