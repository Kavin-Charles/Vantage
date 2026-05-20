import { describe, it, expect } from 'vitest';

describe('GET /api/deals — deprecated', () => {
  it('router is exported and mounts without error', async () => {
    const { createDealsRouter } = await import('../routes/deals');
    const router = createDealsRouter();
    expect(router).toBeDefined();
  });
});
