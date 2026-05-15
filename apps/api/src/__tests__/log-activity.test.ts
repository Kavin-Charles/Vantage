import { describe, it, expect, vi } from 'vitest';

function buildMockDb(shouldFail = false) {
  const chain: Record<string, unknown> = {};
  for (const f of ['insertInto','values','returningAll','executeTakeFirstOrThrow']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  if (shouldFail) {
    chain['executeTakeFirstOrThrow'] = vi.fn().mockRejectedValue(new Error('DB down'));
  } else {
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ id: 'act1' });
  }
  return { insertInto: vi.fn().mockReturnValue(chain) };
}

describe('logActivity', () => {
  it('inserts an activity record', async () => {
    const db = buildMockDb();
    const { logActivity } = await import('../lib/log-activity');
    await logActivity(db as never, {
      workspace_id: 'ws1',
      user_id: 'u1',
      type: 'note',
      body: 'Created contact Alice',
      contact_id: 'c1',
    });
    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });

  it('does not throw if insert fails (fire-and-forget)', async () => {
    const db = buildMockDb(true);
    const { logActivity } = await import('../lib/log-activity');
    await expect(logActivity(db as never, {
      workspace_id: 'ws1', user_id: 'u1', type: 'note', body: 'test',
    })).resolves.not.toThrow();
  });

  it('accepts deal_change type with deal_id and meta', async () => {
    const db = buildMockDb();
    const { logActivity } = await import('../lib/log-activity');
    await logActivity(db as never, {
      workspace_id: 'ws1',
      user_id: 'u1',
      type: 'deal_change',
      body: 'Deal moved to Closing',
      deal_id: 'd1',
      meta: { old_stage: 'Qualifying', new_stage: 'Closing' },
    });
    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });
});
