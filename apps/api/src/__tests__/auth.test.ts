import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';

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
    const req = { cookies: { vantage_token: 'bad-token' }, headers: {} } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('calls next if valid token and user found', async () => {
    const token = jwt.sign(
      { sub: 'user-1', role: 'admin', workspaceId: 'ws-1' },
      JWT_SECRET,
      { expiresIn: '24h' },
    );
    const fakeUser = { id: 'user-1', role: 'admin', workspace_id: 'ws-1' };
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
    const req = { cookies: { vantage_token: token }, headers: {} } as unknown as Request;
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
    const req = { cookies: { vantage_token: token }, headers: {} } as unknown as Request;
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
    const req = { cookies: { vantage_token: token }, headers: {} } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('returns 403 if role is member', async () => {
    const json = vi.fn();
    const mockRes = { status: vi.fn().mockReturnValue({ json }) };
    const next = vi.fn();
    const req = { user: { role: 'member' } };
    const { requireAdmin } = await import('../middleware/auth');
    requireAdmin(req as never, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  it('calls next if role is admin', async () => {
    const next = vi.fn();
    const req = { user: { role: 'admin' } };
    const { requireAdmin } = await import('../middleware/auth');
    requireAdmin(req as never, {} as never, next);
    expect(next).toHaveBeenCalled();
  });
});
