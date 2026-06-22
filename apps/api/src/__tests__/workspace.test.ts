import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createWorkspaceRouter } from '../routes/workspace';

function buildApp(db: Partial<Kysely<Database>>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1', name: 'Acme', domain: 'acme.com' };
    next();
  });
  app.use('/api/workspace', createWorkspaceRouter(db as Kysely<Database>));
  return app;
}

describe('PATCH /api/workspace', () => {
  it('updates name and domain', async () => {
    const updated = { id: 'ws-1', name: 'Acme Inc', domain: 'acme.io' };
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue(updated),
      }),
    };
    const res = await request(buildApp(db)).patch('/api/workspace').send({ name: 'Acme Inc', domain: 'acme.io' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject(updated);
  });

  it('rejects an empty body', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/workspace').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(res.body.error.message).toBe('No fields to update.');
  });

  it('rejects a blank name', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/workspace').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(res.body.error.message).toBe('Invalid name or domain.');
  });
});
