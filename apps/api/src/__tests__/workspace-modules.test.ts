// apps/api/src/__tests__/workspace-modules.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return vi.fn();
}

function getHandler(router: any, path: string, method: 'get' | 'post' | 'patch') {
  const stack = (router as any).stack as Array<{
    route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] };
  }>;
  const layer = stack.find(
    s => s.route?.path === path && s.route.methods[method],
  );
  return layer!.route!.stack[0]!.handle;
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
    const { createWorkspaceModulesRouter } = await import('../routes/workspace-modules');
    const router = createWorkspaceModulesRouter(db as Kysely<Database>);
    const handler = getHandler(router, '/', 'get');

    const req: any = { workspace: { id: 'ws-1' }, user: { id: 'user-1', role: 'admin' } };
    const res = mockRes();
    await handler(req, res, mockNext());

    expect(res.json).toHaveBeenCalledWith({ data: mockModuleRows, error: null });
  });
});

describe('PATCH /api/workspace/modules/:moduleId', () => {
  it('toggles module enabled status (admin)', async () => {
    const updateResult = { numUpdatedRows: BigInt(1) };
    const db: any = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(updateResult),
      }),
    };
    const { createWorkspaceModulesRouter } = await import('../routes/workspace-modules');
    const router = createWorkspaceModulesRouter(db as Kysely<Database>);
    const handler = getHandler(router, '/:moduleId', 'patch');

    const req: any = {
      workspace: { id: 'ws-1' },
      user: { id: 'user-1', role: 'admin' },
      params: { moduleId: 'contacts' },
      body: { enabled: false },
    };
    const res = mockRes();
    await handler(req, res, mockNext());

    expect(res.json).toHaveBeenCalledWith({
      data: { module_id: 'contacts', enabled: false },
      error: null,
    });
  });

  it('returns 403 for non-admin', async () => {
    const db: any = {};
    const { createWorkspaceModulesRouter } = await import('../routes/workspace-modules');
    const router = createWorkspaceModulesRouter(db as Kysely<Database>);
    const handler = getHandler(router, '/:moduleId', 'patch');

    const req: any = {
      workspace: { id: 'ws-1' },
      user: { id: 'user-1', role: 'member' },
      params: { moduleId: 'contacts' },
      body: { enabled: false },
    };
    const res = mockRes();
    await handler(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('returns 400 for unknown moduleId', async () => {
    const db: any = {};
    const { createWorkspaceModulesRouter } = await import('../routes/workspace-modules');
    const router = createWorkspaceModulesRouter(db as Kysely<Database>);
    const handler = getHandler(router, '/:moduleId', 'patch');

    const req: any = {
      workspace: { id: 'ws-1' },
      user: { id: 'user-1', role: 'admin' },
      params: { moduleId: 'unknown-module' },
      body: { enabled: false },
    };
    const res = mockRes();
    await handler(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
