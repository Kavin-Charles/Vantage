import { describe, it, expect } from 'vitest';

const noopPermission = () => (_req: unknown, _res: unknown, next: Function) => next();

describe('GET /api/deals — deprecated', () => {
  it('router is exported and mounts without error', async () => {
    const { createDealsRouter } = await import('../routes/deals');
    const router = createDealsRouter(noopPermission as never);
    expect(router).toBeDefined();
  });
});
