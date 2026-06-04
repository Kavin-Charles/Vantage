import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePermissions, __clearPermCacheForTesting } from './permission';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

function buildMockDb(overrides: { permission: string; granted: boolean }[]) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom', 'select', 'where']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(overrides);
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
  } as unknown as Kysely<Database>;
}

beforeEach(() => {
  __clearPermCacheForTesting();
});

describe('resolvePermissions', () => {
  it('returns all permissions for admin (bypasses DB)', async () => {
    const db = buildMockDb([]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'admin', []);
    // admin sentinel: always returns true for has()
    expect(result.has('contacts:delete')).toBe(true);
    expect(result.has('anything:random')).toBe(true);
  });

  it('returns role-default permissions for member', async () => {
    const db = buildMockDb([]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['contacts', 'companies', 'pipelines', 'tasks', 'websites', 'servers', 'analytics', 'activity']);
    expect(result.has('contacts:view')).toBe(true);
    expect(result.has('contacts:create')).toBe(true);
    expect(result.has('contacts:delete')).toBe(false);
  });

  it('applies granted override', async () => {
    const db = buildMockDb([{ permission: 'contacts:delete', granted: true }]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['contacts', 'companies', 'pipelines', 'tasks', 'websites', 'servers', 'analytics', 'activity']);
    expect(result.has('contacts:delete')).toBe(true);
  });

  it('applies denied override', async () => {
    const db = buildMockDb([{ permission: 'contacts:create', granted: false }]);
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['contacts', 'companies', 'pipelines', 'tasks', 'websites', 'servers', 'analytics', 'activity']);
    expect(result.has('contacts:create')).toBe(false);
  });

  it('blocks permissions from disabled modules', async () => {
    const db = buildMockDb([]);
    // contacts module disabled — only companies enabled
    const result = await resolvePermissions(db, 'user-1', 'ws-1', 'member', ['companies']);
    expect(result.has('contacts:view')).toBe(false);
    expect(result.has('companies:view')).toBe(true);
  });
});
