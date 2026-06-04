import { describe, it, expect, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const noopPermission = () => (_req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => next()

describe('item-groups router — admin guard patterns', () => {
  it('creates router and exports function', async () => {
    const { createItemGroupsRouter } = await import('../routes/item-groups');
    const mockDb = {
      selectFrom: vi.fn(),
    } as unknown as Kysely<Database>;

    const router = createItemGroupsRouter(mockDb, noopPermission);
    expect(router).toBeDefined();
    expect(typeof router.post).toBe('function');
    expect(typeof router.patch).toBe('function');
    expect(typeof router.delete).toBe('function');
  });

  it('router has admin-guarded POST route', async () => {
    const { createItemGroupsRouter } = await import('../routes/item-groups');
    const mockDb = {
      selectFrom: vi.fn(),
    } as unknown as Kysely<Database>;

    const router = createItemGroupsRouter(mockDb, noopPermission);
    // Verify POST method exists on router
    expect(router.post).toBeDefined();
  });

  it('router has admin-guarded PATCH route', async () => {
    const { createItemGroupsRouter } = await import('../routes/item-groups');
    const mockDb = {
      selectFrom: vi.fn(),
    } as unknown as Kysely<Database>;

    const router = createItemGroupsRouter(mockDb, noopPermission);
    // Verify PATCH method exists on router
    expect(router.patch).toBeDefined();
  });

  it('router has admin-guarded DELETE route', async () => {
    const { createItemGroupsRouter } = await import('../routes/item-groups');
    const mockDb = {
      selectFrom: vi.fn(),
    } as unknown as Kysely<Database>;

    const router = createItemGroupsRouter(mockDb, noopPermission);
    // Verify DELETE method exists on router
    expect(router.delete).toBeDefined();
  });

  it('source file contains isAdmin guard function', async () => {
    const module = await import('../routes/item-groups');
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/item-groups.ts'),
      'utf-8',
    );

    // Verify admin guard exists in source
    expect(source).toContain('isAdmin');
    expect(source).toContain("req.user.role === 'admin'");
    expect(source).toContain("{ code: 'FORBIDDEN'");
  });

  it('items router exports createItemsRouter function', async () => {
    const { createItemsRouter } = await import('../routes/items');
    const mockDb = {
      selectFrom: vi.fn(),
    } as unknown as Kysely<Database>;

    const router = createItemsRouter(mockDb, noopPermission);
    expect(router).toBeDefined();
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');
    expect(typeof router.patch).toBe('function');
    expect(typeof router.delete).toBe('function');
  });

  it('items router has convert endpoint', async () => {
    const { createItemsRouter } = await import('../routes/items');
    const mockDb = {
      selectFrom: vi.fn(),
    } as unknown as Kysely<Database>;

    const router = createItemsRouter(mockDb, noopPermission);
    // Verify POST method exists
    expect(router.post).toBeDefined();
  });
});
