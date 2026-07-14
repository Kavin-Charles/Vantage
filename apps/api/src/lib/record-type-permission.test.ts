import { describe, it, expect, vi } from 'vitest';
import { checkRecordTypePermission } from './record-type-permission';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

function buildMockDb(opts: { roleIds: string[]; grantingRow: Record<string, unknown> | undefined }) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom', 'select', 'where']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(opts.roleIds.map(role_id => ({ role_id })));
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(opts.grantingRow);
  return { selectFrom: vi.fn().mockReturnValue(chain) } as unknown as Kysely<Database>;
}

vi.mock('../middleware/permission', () => ({
  userIsSuperuser: vi.fn(),
}));

import { userIsSuperuser } from '../middleware/permission';

describe('checkRecordTypePermission', () => {
  it('returns true for a superuser regardless of role grants', async () => {
    vi.mocked(userIsSuperuser).mockResolvedValue(true);
    const db = buildMockDb({ roleIds: [], grantingRow: undefined });
    const result = await checkRecordTypePermission(db, {
      userId: 'user-1', workspaceId: 'ws-1', recordTypeId: 'type-1', op: 'create',
    });
    expect(result).toBe(true);
  });

  it('returns true when an assigned role grants the op', async () => {
    vi.mocked(userIsSuperuser).mockResolvedValue(false);
    const db = buildMockDb({ roleIds: ['role-1'], grantingRow: { role_id: 'role-1' } });
    const result = await checkRecordTypePermission(db, {
      userId: 'user-1', workspaceId: 'ws-1', recordTypeId: 'type-1', op: 'view',
    });
    expect(result).toBe(true);
  });

  it('returns false when the user has no assigned roles', async () => {
    vi.mocked(userIsSuperuser).mockResolvedValue(false);
    const db = buildMockDb({ roleIds: [], grantingRow: undefined });
    const result = await checkRecordTypePermission(db, {
      userId: 'user-1', workspaceId: 'ws-1', recordTypeId: 'type-1', op: 'delete',
    });
    expect(result).toBe(false);
  });

  it('returns false when no role grants the op', async () => {
    vi.mocked(userIsSuperuser).mockResolvedValue(false);
    const db = buildMockDb({ roleIds: ['role-1'], grantingRow: undefined });
    const result = await checkRecordTypePermission(db, {
      userId: 'user-1', workspaceId: 'ws-1', recordTypeId: 'type-1', op: 'edit',
    });
    expect(result).toBe(false);
  });
});
