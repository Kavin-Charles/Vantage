import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';

const JWT_SECRET = 'test-secret';

vi.mock('otplib', () => ({
  authenticator: {
    verify: vi.fn(),
  },
}));

vi.mock('../middleware/permission', () => ({
  getEnabledModuleIds: vi.fn().mockResolvedValue([]),
  resolveUserPermissions: vi.fn().mockResolvedValue({ superuser: false, permissions: new Set() }),
}));

import { authenticator } from 'otplib';
import { createAuthRouter } from '../routes/auth';
import { encryptSecret } from '../lib/secret-crypto';

describe('createRequireAuth', () => {
  let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let next: NextFunction;
  let mockDb: { selectFrom: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    mockRes = { status, json };
    next = vi.fn() as unknown as NextFunction;
    mockDb = { selectFrom: vi.fn() };
  });

  it('returns 401 if no cookie', async () => {
    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(mockDb as never, JWT_SECRET);
    const req = { cookies: {}, headers: {} } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if token invalid', async () => {
    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(mockDb as never, JWT_SECRET);
    const req = { cookies: { vencore_token: 'bad-token' }, headers: {} } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('calls next if valid token and user found', async () => {
    const token = jwt.sign(
      { sub: 'user-1', role: 'admin', workspaceId: 'ws-1' },
      JWT_SECRET,
      { expiresIn: '24h' },
    );
    const fakeUser = { id: 'user-1', role: 'admin', workspace_id: 'ws-1', is_active: true };
    const fakeWorkspace = { id: 'ws-1', name: 'Test' };
    const chainMock = {
      where: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn(),
    };
    chainMock.executeTakeFirst
      .mockResolvedValueOnce(fakeUser)
      .mockResolvedValueOnce(fakeWorkspace);
    mockDb.selectFrom.mockReturnValue(chainMock);

    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(mockDb as never, JWT_SECRET);
    const req = { cookies: { vencore_token: token }, headers: {} } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 if token is expired', async () => {
    const token = jwt.sign(
      { sub: 'user-1', role: 'admin', workspaceId: 'ws-1' },
      JWT_SECRET,
      { expiresIn: '-1s' }, // already expired
    );
    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(mockDb as never, JWT_SECRET);
    const req = { cookies: { vencore_token: token }, headers: {} } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if user not found after valid token', async () => {
    const token = jwt.sign(
      { sub: 'deleted-user', role: 'admin', workspaceId: 'ws-1' },
      JWT_SECRET,
      { expiresIn: '24h' },
    );
    const chainMock = {
      where: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined), // user not found
    };
    mockDb.selectFrom.mockReturnValue(chainMock);

    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(mockDb as never, JWT_SECRET);
    const req = { cookies: { vencore_token: token }, headers: {} } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('returns 403 if isAdmin is false', async () => {
    const json = vi.fn();
    const mockRes = { status: vi.fn().mockReturnValue({ json }) };
    const next = vi.fn();
    const req = { user: {}, isAdmin: false };
    const { requireAdmin } = await import('../middleware/auth');
    requireAdmin(req as never, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  it('calls next if isAdmin is true', async () => {
    const next = vi.fn();
    const req = { user: {}, isAdmin: true };
    const { requireAdmin } = await import('../middleware/auth');
    requireAdmin(req as never, {} as never, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('POST /api/auth/login — TOTP challenge', () => {
  const VALID_KEY = 'b'.repeat(64);
  const originalKey = process.env['SSH_ENCRYPTION_KEY'];

  beforeEach(() => {
    process.env['SSH_ENCRYPTION_KEY'] = VALID_KEY;
    vi.mocked(authenticator.verify).mockReset();
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env['SSH_ENCRYPTION_KEY'];
    else process.env['SSH_ENCRYPTION_KEY'] = originalKey;
  });

  function buildLoginApp(usersRow: Record<string, unknown>, recoveryRows: Array<Record<string, unknown>> = []) {
    const usersUpdateSet = vi.fn().mockReturnThis();
    const usersUpdateExecute = vi.fn().mockResolvedValue(undefined);
    const recoveryUpdateSet = vi.fn().mockReturnThis();
    const recoveryUpdateWhere = vi.fn().mockReturnThis();
    const recoveryUpdateExecute = vi.fn().mockResolvedValue(undefined);
    const recoveryUpdateExecuteTakeFirst = vi.fn().mockResolvedValue({ numUpdatedRows: 1n });

    const db: any = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            where: vi.fn().mockReturnThis(),
            selectAll: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(usersRow),
          };
        }
        if (table === 'user_recovery_codes') {
          return {
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue(recoveryRows),
          };
        }
        throw new Error(`unexpected selectFrom table: ${table}`);
      }),
      updateTable: vi.fn((table: string) => {
        if (table === 'users') {
          return { set: usersUpdateSet, where: vi.fn().mockReturnThis(), execute: usersUpdateExecute };
        }
        if (table === 'user_recovery_codes') {
          return { set: recoveryUpdateSet, where: recoveryUpdateWhere, execute: recoveryUpdateExecute, executeTakeFirst: recoveryUpdateExecuteTakeFirst };
        }
        throw new Error(`unexpected updateTable table: ${table}`);
      }),
    };

    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(db as never, JWT_SECRET, null, 'http://localhost'));

    return { app, db, recoveryUpdateSet, recoveryUpdateWhere, usersUpdateExecute, recoveryUpdateExecuteTakeFirst };
  }

  it('(a) totp_enabled user + no code -> totp_required:true, no cookie issued', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    const encrypted = encryptSecret('REALSECRET');
    const { app } = buildLoginApp({
      id: 'user-1', email: 'user@example.com', password_hash: hash,
      workspace_id: 'ws-1', totp_enabled: true, totp_secret: encrypted, theme: 'light',
    });

    const res = await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual({ totp_required: true });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('(b) + valid TOTP code -> token issued', async () => {
    vi.mocked(authenticator.verify).mockReturnValue(true);
    const hash = await bcrypt.hash('correct-password', 12);
    const encrypted = encryptSecret('REALSECRET');
    const { app } = buildLoginApp({
      id: 'user-1', email: 'user@example.com', password_hash: hash,
      workspace_id: 'ws-1', totp_enabled: true, totp_secret: encrypted, theme: 'light',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.token).toBeTruthy();
    expect(authenticator.verify).toHaveBeenCalledWith({ token: '123456', secret: 'REALSECRET' });
    expect(res.headers['set-cookie']?.[0]).toContain('vencore_token=');
  });

  it('(c) + invalid code (no TOTP match, no recovery match) -> 401 INVALID_2FA, no token', async () => {
    vi.mocked(authenticator.verify).mockReturnValue(false);
    const hash = await bcrypt.hash('correct-password', 12);
    const encrypted = encryptSecret('REALSECRET');
    const { app } = buildLoginApp({
      id: 'user-1', email: 'user@example.com', password_hash: hash,
      workspace_id: 'ws-1', totp_enabled: true, totp_secret: encrypted, theme: 'light',
    }, []);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password', code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('INVALID_2FA');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('(d) + valid recovery code -> token issued and that row is marked used (single-use)', async () => {
    vi.mocked(authenticator.verify).mockReturnValue(false);
    const hash = await bcrypt.hash('correct-password', 12);
    const encrypted = encryptSecret('REALSECRET');
    const recoveryPlain = 'abcdef0123456789'; // 16-char recovery code
    const recoveryHash = await bcrypt.hash(recoveryPlain, 10);
    const { app, recoveryUpdateSet, recoveryUpdateWhere } = buildLoginApp(
      {
        id: 'user-1', email: 'user@example.com', password_hash: hash,
        workspace_id: 'ws-1', totp_enabled: true, totp_secret: encrypted, theme: 'light',
      },
      [{ id: 'rc-1', user_id: 'user-1', code_hash: recoveryHash, used_at: null }],
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password', code: recoveryPlain });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.token).toBeTruthy();
    expect(recoveryUpdateWhere).toHaveBeenCalledWith('id', '=', 'rc-1');
    // Atomic single-use guard: the spend is conditioned on the row still being unused.
    expect(recoveryUpdateWhere).toHaveBeenCalledWith('used_at', 'is', null);
    expect(recoveryUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ used_at: expect.any(Date) }));
  });

  it('(g) recovery code lost a concurrent redemption race (0 rows spent) -> 401 INVALID_2FA, no token', async () => {
    vi.mocked(authenticator.verify).mockReturnValue(false);
    const hash = await bcrypt.hash('correct-password', 12);
    const encrypted = encryptSecret('REALSECRET');
    const recoveryPlain = 'abcdef0123456789';
    const recoveryHash = await bcrypt.hash(recoveryPlain, 10);
    const { app, recoveryUpdateExecuteTakeFirst } = buildLoginApp(
      {
        id: 'user-1', email: 'user@example.com', password_hash: hash,
        workspace_id: 'ws-1', totp_enabled: true, totp_secret: encrypted, theme: 'light',
      },
      [{ id: 'rc-1', user_id: 'user-1', code_hash: recoveryHash, used_at: null }],
    );
    // Simulate a concurrent login already having spent this code between our read and write.
    recoveryUpdateExecuteTakeFirst.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password', code: recoveryPlain });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_2FA');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('(e) an already-used recovery code (excluded by the used_at IS NULL query) -> 401 INVALID_2FA', async () => {
    vi.mocked(authenticator.verify).mockReturnValue(false);
    const hash = await bcrypt.hash('correct-password', 12);
    const encrypted = encryptSecret('REALSECRET');
    // The route only ever fetches rows where used_at IS NULL, so a spent code
    // never appears among the candidates — simulate that by returning none.
    const { app } = buildLoginApp(
      {
        id: 'user-1', email: 'user@example.com', password_hash: hash,
        workspace_id: 'ws-1', totp_enabled: true, totp_secret: encrypted, theme: 'light',
      },
      [],
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password', code: 'abcdef0123456789' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_2FA');
  });

  it('(f) a user without totp_enabled logs in unchanged, without needing a code', async () => {
    const hash = await bcrypt.hash('correct-password', 12);
    const { app } = buildLoginApp({
      id: 'user-1', email: 'user@example.com', password_hash: hash,
      workspace_id: 'ws-1', totp_enabled: false, totp_secret: null, theme: 'light',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.totp_required).toBeUndefined();
    expect(authenticator.verify).not.toHaveBeenCalled();
  });
});
