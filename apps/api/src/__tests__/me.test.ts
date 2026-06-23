import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createMeRouter } from '../routes/me';

function buildApp(db: Partial<Kysely<Database>>, userOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = {
      id: 'user-1',
      role: 'member',
      name: 'Old Name',
      email: 'user@example.com',
      theme: 'light',
      password_hash: '$existing-hash',
      ...userOverrides,
    };
    next();
  });
  app.use('/api/me', createMeRouter(db as Kysely<Database>));
  return app;
}

describe('PATCH /api/me', () => {
  it('updates name and theme', async () => {
    const updated = { id: 'user-1', name: 'New Name', email: 'user@example.com', role: 'member', theme: 'dark' };
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue(updated),
      }),
    };
    const res = await request(buildApp(db)).patch('/api/me').send({ name: 'New Name', theme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject(updated);
  });

  it('rejects an invalid theme value', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/me').send({ theme: 'blue' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects an empty body', async () => {
    const db: any = {};
    const res = await request(buildApp(db)).patch('/api/me').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});

describe('PATCH /api/me/password', () => {
  it('rejects when current password is wrong', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    const db: any = {};
    const res = await request(buildApp(db, { password_hash: hash }))
      .patch('/api/me/password')
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('updates the password when current password is correct', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const res = await request(buildApp(db, { password_hash: hash }))
      .patch('/api/me/password')
      .send({ currentPassword: 'correct-password', newPassword: 'new-password-123' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const db: any = {};
    const res = await request(buildApp(db))
      .patch('/api/me/password')
      .send({ currentPassword: 'whatever', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});
