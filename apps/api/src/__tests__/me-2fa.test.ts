import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const VALID_KEY = 'b'.repeat(64);

vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn(() => 'RAWSECRETXYZ'),
    keyuri: vi.fn((email: string, issuer: string, secret: string) => `otpauth://totp/${issuer}:${email}?secret=${secret}`),
    verify: vi.fn(),
  },
}));

import { authenticator } from 'otplib';
import { createMe2faRouter } from '../routes/me-2fa';
import { encryptSecret } from '../lib/secret-crypto';

function buildApp(db: Partial<Kysely<Database>>, userOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).isAdmin = false;
    (req as any).permissions = new Set<string>();
    (req as any).user = {
      id: 'user-1',
      role: 'member',
      name: 'Test User',
      email: 'user@example.com',
      ...userOverrides,
    };
    next();
  });
  app.use('/api/me', createMe2faRouter(db as Kysely<Database>));
  return app;
}

describe('POST /api/me/2fa/enroll', () => {
  const originalKey = process.env['SSH_ENCRYPTION_KEY'];
  beforeEach(() => { process.env['SSH_ENCRYPTION_KEY'] = VALID_KEY; });
  afterEach(() => {
    if (originalKey === undefined) delete process.env['SSH_ENCRYPTION_KEY'];
    else process.env['SSH_ENCRYPTION_KEY'] = originalKey;
  });

  it('generates a secret, stores it encrypted, and stays disabled', async () => {
    const setMock = vi.fn().mockReturnThis();
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: setMock,
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const res = await request(buildApp(db)).post('/api/me/2fa/enroll').send({});

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.otpauth_uri).toContain('RAWSECRETXYZ');
    expect(res.body.data.secret).toBe('RAWSECRETXYZ');

    // stored value must be encrypted (not the raw secret) and totp_enabled must be false
    const setArg = setMock.mock.calls[0][0];
    expect(setArg.totp_enabled).toBe(false);
    expect(setArg.totp_secret).not.toBe('RAWSECRETXYZ');
    expect(setArg.totp_secret.split(':')).toHaveLength(3);
  });

  it('re-enroll gate: rejects re-enrollment for an already-enabled user with no code, and does not rotate the secret', async () => {
    const encrypted = encryptSecret('EXISTINGSECRET');
    vi.mocked(authenticator.verify).mockReturnValue(false);
    const db: any = { updateTable: vi.fn() };

    const res = await request(
      buildApp(db, { totp_enabled: true, totp_secret: encrypted }),
    ).post('/api/me/2fa/enroll').send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_CODE');
    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it('re-enroll gate: rejects re-enrollment for an already-enabled user with an invalid code, and does not rotate the secret', async () => {
    const encrypted = encryptSecret('EXISTINGSECRET');
    vi.mocked(authenticator.verify).mockReturnValue(false);
    const db: any = { updateTable: vi.fn() };

    const res = await request(
      buildApp(db, { totp_enabled: true, totp_secret: encrypted }),
    ).post('/api/me/2fa/enroll').send({ code: '000000' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_CODE');
    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it('re-enroll gate: allows re-enrollment for an already-enabled user with a valid current code, and rotates the secret', async () => {
    const encrypted = encryptSecret('EXISTINGSECRET');
    vi.mocked(authenticator.verify).mockReturnValue(true);
    const setMock = vi.fn().mockReturnThis();
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: setMock,
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const res = await request(
      buildApp(db, { totp_enabled: true, totp_secret: encrypted }),
    ).post('/api/me/2fa/enroll').send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.secret).toBe('RAWSECRETXYZ');
    expect(authenticator.verify).toHaveBeenCalledWith({ token: '123456', secret: 'EXISTINGSECRET' });
    const setArg = setMock.mock.calls[0][0];
    expect(setArg.totp_enabled).toBe(false);
    expect(setArg.totp_secret).not.toBe('RAWSECRETXYZ');
  });
});

describe('POST /api/me/2fa/verify', () => {
  const originalKey = process.env['SSH_ENCRYPTION_KEY'];
  beforeEach(() => {
    process.env['SSH_ENCRYPTION_KEY'] = VALID_KEY;
    vi.mocked(authenticator.verify).mockReset();
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env['SSH_ENCRYPTION_KEY'];
    else process.env['SSH_ENCRYPTION_KEY'] = originalKey;
  });

  it('returns 400 when the user has not enrolled yet', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ totp_secret: null }),
      }),
    };
    const res = await request(buildApp(db)).post('/api/me/2fa/verify').send({ code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  it('enables 2FA, returns 10 recovery codes, and writes hashed rows on a correct code', async () => {
    const encrypted = encryptSecret('REALSECRET');
    vi.mocked(authenticator.verify).mockReturnValue(true);

    const updateSet = vi.fn().mockReturnThis();
    const updateWhere = vi.fn().mockReturnThis();
    const deleteWhere = vi.fn().mockReturnThis();
    const insertValues = vi.fn().mockReturnThis();
    const trx = {
      updateTable: vi.fn().mockReturnValue({ set: updateSet, where: updateWhere, execute: vi.fn().mockResolvedValue(undefined) }),
      deleteFrom: vi.fn().mockReturnValue({ where: deleteWhere, execute: vi.fn().mockResolvedValue(undefined) }),
      insertInto: vi.fn().mockReturnValue({ values: insertValues, execute: vi.fn().mockResolvedValue(undefined) }),
    };

    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ totp_secret: encrypted }),
      }),
      transaction: vi.fn().mockReturnValue({
        execute: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(trx)),
      }),
    };

    const res = await request(buildApp(db)).post('/api/me/2fa/verify').send({ code: '654321' });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.recovery_codes).toHaveLength(10);
    new Set(res.body.data.recovery_codes).forEach((_: unknown) => {}); // no-op to satisfy lint if unused
    expect(new Set(res.body.data.recovery_codes).size).toBe(10);

    expect(db.transaction).toHaveBeenCalled();
    expect(trx.updateTable).toHaveBeenCalledWith('users');
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ totp_enabled: true }));
    expect(trx.deleteFrom).toHaveBeenCalledWith('user_recovery_codes');
    expect(trx.insertInto).toHaveBeenCalledWith('user_recovery_codes');
    expect(insertValues).toHaveBeenCalledTimes(10);

    // every hashed code stored must NOT equal any of the returned plaintext codes
    const plaintextCodes: string[] = res.body.data.recovery_codes;
    for (const call of insertValues.mock.calls) {
      const inserted = call[0];
      expect(plaintextCodes).not.toContain(inserted.code_hash);
      expect(inserted.user_id).toBe('user-1');
    }
  });

  it('returns 400 and leaves 2FA disabled on an incorrect code', async () => {
    const encrypted = encryptSecret('REALSECRET');
    vi.mocked(authenticator.verify).mockReturnValue(false);

    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ totp_secret: encrypted }),
      }),
      transaction: vi.fn(),
    };

    const res = await request(buildApp(db)).post('/api/me/2fa/verify').send({ code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CODE');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/me/2fa/disable', () => {
  const originalKey = process.env['SSH_ENCRYPTION_KEY'];
  beforeEach(() => {
    process.env['SSH_ENCRYPTION_KEY'] = VALID_KEY;
    vi.mocked(authenticator.verify).mockReset();
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env['SSH_ENCRYPTION_KEY'];
    else process.env['SSH_ENCRYPTION_KEY'] = originalKey;
  });

  it('clears the secret and recovery codes on a correct code', async () => {
    const encrypted = encryptSecret('REALSECRET');
    vi.mocked(authenticator.verify).mockReturnValue(true);

    const updateSet = vi.fn().mockReturnThis();
    const deleteWhere = vi.fn().mockReturnThis();
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ totp_secret: encrypted }),
      }),
      updateTable: vi.fn().mockReturnValue({
        set: updateSet,
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
      deleteFrom: vi.fn().mockReturnValue({
        where: deleteWhere,
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const res = await request(buildApp(db)).post('/api/me/2fa/disable').send({ code: '111111' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ totp_enabled: false, totp_secret: null }));
    expect(db.deleteFrom).toHaveBeenCalledWith('user_recovery_codes');
  });

  it('returns 403 on an incorrect code and does not modify state', async () => {
    const encrypted = encryptSecret('REALSECRET');
    vi.mocked(authenticator.verify).mockReturnValue(false);

    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ totp_secret: encrypted }),
      }),
      updateTable: vi.fn(),
      deleteFrom: vi.fn(),
    };

    const res = await request(buildApp(db)).post('/api/me/2fa/disable').send({ code: '999999' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_CODE');
    expect(db.updateTable).not.toHaveBeenCalled();
    expect(db.deleteFrom).not.toHaveBeenCalled();
  });
});
