import { describe, it, expect, vi } from 'vitest';
import { checkRecordTypePermission } from './record-type-permission';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

function buildMockDb(perm: Record<string, boolean> | undefined) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom', 'select', 'where']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(perm);
  return { selectFrom: vi.fn().mockReturnValue(chain) };
}

describe('checkRecordTypePermission', () => {
  it('returns true when permission granted', async () => {
    const db = buildMockDb({ can_create: true });
    const result = await checkRecordTypePermission(
      db as unknown as Kysely<Database>, 'type-1', 'member', 'can_create'
    );
    expect(result).toBe(true);
  });

  it('returns false when permission denied', async () => {
    const db = buildMockDb({ can_delete: false });
    const result = await checkRecordTypePermission(
      db as unknown as Kysely<Database>, 'type-1', 'member', 'can_delete'
    );
    expect(result).toBe(false);
  });

  it('returns false when no permission row found', async () => {
    const db = buildMockDb(undefined);
    const result = await checkRecordTypePermission(
      db as unknown as Kysely<Database>, 'type-1', 'member', 'can_view'
    );
    expect(result).toBe(false);
  });
});
