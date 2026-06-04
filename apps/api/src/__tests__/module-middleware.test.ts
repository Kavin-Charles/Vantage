import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createRequireModule, __clearModuleCacheForTesting } from '../middleware/module';
import type { AuthenticatedRequest } from '../middleware/auth';

function mockReq(workspaceId: string): Partial<AuthenticatedRequest> {
  return { workspace: { id: workspaceId } as any };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireModule middleware', () => {
  let db: Partial<Kysely<Database>>;

  beforeEach(() => __clearModuleCacheForTesting());

  beforeEach(() => {
    db = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ enabled: true }),
      }),
    } as any;
  });

  it('calls next() when module is enabled', async () => {
    const requireModule = createRequireModule(db as Kysely<Database>);
    const middleware = requireModule('contacts');
    const next = vi.fn();
    await middleware(mockReq('ws-1') as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when module is disabled', async () => {
    (db.selectFrom as any).mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ enabled: false }),
    });
    const requireModule = createRequireModule(db as Kysely<Database>);
    const middleware = requireModule('contacts');
    const next = vi.fn();
    const res = mockRes();
    await middleware(mockReq('ws-1') as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: { code: 'MODULE_DISABLED', message: 'contacts module is disabled for this workspace.' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when module row does not exist', async () => {
    (db.selectFrom as any).mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    });
    const requireModule = createRequireModule(db as Kysely<Database>);
    const middleware = requireModule('contacts');
    const next = vi.fn();
    const res = mockRes();
    await middleware(mockReq('ws-1') as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('hits cache on second call and skips DB', async () => {
    const requireModule = createRequireModule(db as Kysely<Database>);
    const middleware = requireModule('contacts');
    const next1 = vi.fn();
    const next2 = vi.fn();
    // First call — populates cache
    await middleware(mockReq('ws-cache') as Request, mockRes() as Response, next1);
    // Second call — should use cache, not hit DB again
    await middleware(mockReq('ws-cache') as Request, mockRes() as Response, next2);
    expect(next1).toHaveBeenCalledOnce();
    expect(next2).toHaveBeenCalledOnce();
    // DB should have been called exactly once (cache hit on second call)
    const selectFromMock = db.selectFrom as any;
    expect(selectFromMock).toHaveBeenCalledTimes(1);
  });
});
