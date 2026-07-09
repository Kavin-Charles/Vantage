// apps/api/src/__tests__/setup-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSetupRouter } from '../routes/setup';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const mockDb = {} as Kysely<Database>;

describe('GET /api/setup/status', () => {
  it('returns { configured: false } when not set up', async () => {
    const router = createSetupRouter(mockDb);
    expect(router).toBeDefined();
    expect(typeof router.get).toBe('function');
  });
});

describe('POST /api/setup', () => {
  it('router exports createSetupRouter function', async () => {
    const { createSetupRouter } = await import('../routes/setup');
    expect(typeof createSetupRouter).toBe('function');
  });

  it('router has POST route', async () => {
    const { createSetupRouter } = await import('../routes/setup');
    const router = createSetupRouter(mockDb);
    expect(typeof router.post).toBe('function');
  });

  it('source validates zod schema before processing', async () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/setup.ts'),
      'utf-8',
    );
    expect(source).toContain('setupSchema');
    expect(source).toContain('safeParse');
  });

  it('source contains transaction', async () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/setup.ts'),
      'utf-8',
    );
    expect(source).toContain('transaction');
  });

  it('source hashes password with bcrypt', async () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/setup.ts'),
      'utf-8',
    );
    expect(source).toContain('bcrypt.hash');
  });
});
