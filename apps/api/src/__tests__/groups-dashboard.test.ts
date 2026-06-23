import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createGroupsRouter } from '../routes/groups';

function buildApp(db: Partial<Kysely<Database>>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/groups', createGroupsRouter(db as Kysely<Database>));
  return app;
}

describe('PUT /api/groups/:id/dashboard', () => {
  it('sets the group to exactly one dashboard', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      }),
      deleteFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
      insertInto: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
      transaction: vi.fn().mockReturnValue({
        execute: vi.fn(async (cb: any) => cb(db)),
      }),
    };
    const res = await request(buildApp(db))
      .put('/api/groups/group-1/dashboard')
      .send({ dashboard_id: '11111111-1111-1111-1111-111111111111' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ group_id: 'group-1', dashboard_id: '11111111-1111-1111-1111-111111111111' });
  });

  it('clears the group dashboard when dashboard_id is null', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      }),
      deleteFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
      insertInto: vi.fn(),
      transaction: vi.fn().mockReturnValue({
        execute: vi.fn(async (cb: any) => cb(db)),
      }),
    };
    const res = await request(buildApp(db))
      .put('/api/groups/group-1/dashboard')
      .send({ dashboard_id: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ group_id: 'group-1', dashboard_id: null });
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('returns 404 when the group does not exist in this workspace', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const res = await request(buildApp(db))
      .put('/api/groups/missing-group/dashboard')
      .send({ dashboard_id: '11111111-1111-1111-1111-111111111111' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an invalid body', async () => {
    const db: any = {};
    const res = await request(buildApp(db))
      .put('/api/groups/group-1/dashboard')
      .send({ dashboard_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});
