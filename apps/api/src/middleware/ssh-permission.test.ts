import { describe, it, expect, beforeEach, vi } from 'vitest';
import { userHasPermission, __clearPermCacheForTesting } from './permission';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

// Routes db.selectFrom(table) to a chain whose execute() resolves the canned
// rows for that table — lets us simulate enabled modules + permission overrides.
function buildDb(rowsByTable: Record<string, unknown[]>): Kysely<Database> {
  return {
    selectFrom: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const f of ['select', 'where']) chain[f] = vi.fn(() => chain);
      chain['execute'] = vi.fn().mockResolvedValue(rowsByTable[table] ?? []);
      return chain;
    }),
  } as unknown as Kysely<Database>;
}

const ENABLED = [{ module_id: 'servers' }, { module_id: 'contacts' }];

beforeEach(() => __clearPermCacheForTesting());

describe('userHasPermission (servers:ssh gate)', () => {
  it('admins always pass', async () => {
    const db = buildDb({});
    expect(await userHasPermission(db, { id: 'u1', role: 'admin' }, 'ws1', 'servers:ssh')).toBe(true);
  });

  it('denies members by default (servers:ssh is admin-only)', async () => {
    const db = buildDb({ workspace_modules: ENABLED, group_members: [], user_permissions: [] });
    expect(await userHasPermission(db, { id: 'u1', role: 'member' }, 'ws1', 'servers:ssh')).toBe(false);
  });

  it('grants a member with an explicit servers:ssh override', async () => {
    const db = buildDb({
      workspace_modules: ENABLED,
      group_members: [],
      user_permissions: [{ permission: 'servers:ssh', granted: true }],
    });
    expect(await userHasPermission(db, { id: 'u1', role: 'member' }, 'ws1', 'servers:ssh')).toBe(true);
  });

  it('denies when the servers module is disabled, even with the permission', async () => {
    const db = buildDb({
      workspace_modules: [{ module_id: 'contacts' }],
      group_members: [],
      user_permissions: [{ permission: 'servers:ssh', granted: true }],
    });
    expect(await userHasPermission(db, { id: 'u1', role: 'member' }, 'ws1', 'servers:ssh')).toBe(false);
  });
});
