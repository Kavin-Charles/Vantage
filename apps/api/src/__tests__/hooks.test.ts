// apps/api/src/__tests__/hooks.test.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createHooksRouter } from '../routes/hooks';

function buildApp(db: Partial<Kysely<Database>>, role: 'admin' | 'member' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1' };
    (req as any).isAdmin = role === 'admin';
    (req as any).permissions = new Set<string>();
    next();
  });
  app.use('/api/settings', createHooksRouter(db as Kysely<Database>));
  return app;
}

/** Builds a db mock whose `selectFrom` returns canned rows per table name. */
function buildDb(opts: { installedProviders: unknown[]; configs: unknown[] }) {
  return {
    selectFrom: vi.fn((table: string) => {
      if (table === 'hook_providers') {
        return {
          where: vi.fn().mockReturnThis(),
          selectAll: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValue(opts.installedProviders),
        };
      }
      if (table === 'workspace_hook_configs') {
        return {
          where: vi.fn().mockReturnThis(),
          selectAll: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValue(opts.configs),
        };
      }
      throw new Error(`unexpected selectFrom(${table})`);
    }),
  };
}

describe('GET /api/settings/hooks/crm', () => {
  it('includes the crm-analytics hook feature as provider_required when Analytics is not installed', async () => {
    const db = buildDb({ installedProviders: [], configs: [] });
    const res = await request(buildApp(db as any)).get('/api/settings/hooks/crm');

    expect(res.status).toBe(200);
    const analytics = res.body.data.find((f: any) => f.id === 'crm-analytics');
    expect(analytics).toBeDefined();
    expect(analytics.state).toBe('provider_required');
  });

  it('includes the crm-analytics hook feature as available once vencore-analytics is installed', async () => {
    const db = buildDb({
      installedProviders: [
        { id: 'hp-1', provider_id: 'vencore-analytics', name: 'Analytics', enabled: true },
      ],
      configs: [],
    });
    const res = await request(buildApp(db as any)).get('/api/settings/hooks/crm');

    expect(res.status).toBe(200);
    const analytics = res.body.data.find((f: any) => f.id === 'crm-analytics');
    expect(analytics).toBeDefined();
    expect(analytics.compatible_providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'vencore-analytics' })]),
    );
    expect(analytics.state).toBe('available');
  });
});
