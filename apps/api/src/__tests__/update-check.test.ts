import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildMockDb(meta: { notified_version: string | null } = { notified_version: null }) {
  const chain: Record<string, unknown> = {};
  for (const f of ['set', 'where', 'select', 'selectAll', 'values', 'execute', 'executeTakeFirst', 'innerJoin']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue([]);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(meta);
  return {
    updateTable: vi.fn().mockReturnValue(chain),
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function mockGhcr(tags: string[]) {
  return vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'tok' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ tags }) }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.resetModules();
  process.env['VENCORE_VERSION'] = '1.2.0';
});

describe('fetchLatestGhcrVersion', () => {
  it('exchanges an anonymous token then lists tags', async () => {
    const { fetchLatestGhcrVersion } = await import('../lib/update-check');
    const fetchFn = mockGhcr(['1.2.3', '1.3.0', 'latest']);
    expect(await fetchLatestGhcrVersion(fetchFn)).toBe('1.3.0');
  });

  it('throws when GHCR is unreachable', async () => {
    const { fetchLatestGhcrVersion } = await import('../lib/update-check');
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(fetchLatestGhcrVersion(fetchFn)).rejects.toThrow();
  });
});

describe('runUpdateCheck', () => {
  it('persists latest version and notifies admins once per version', async () => {
    const { runUpdateCheck } = await import('../lib/update-check');
    const db = buildMockDb({ notified_version: null });
    (db._chain['execute'] as ReturnType<typeof vi.fn>)
      .mockResolvedValue([{ id: 'u1', workspace_id: 'ws1' }]);
    const info = await runUpdateCheck(db as never, mockGhcr(['1.3.0']));
    expect(info.updateAvailable).toBe(true);
    expect(info.latestVersion).toBe('1.3.0');
    expect(db.updateTable).toHaveBeenCalledWith('instance_meta');
    expect(db.insertInto).toHaveBeenCalledWith('notifications');
  });

  it('does not re-notify for an already-notified version', async () => {
    const { runUpdateCheck } = await import('../lib/update-check');
    const db = buildMockDb({ notified_version: '1.3.0' });
    const info = await runUpdateCheck(db as never, mockGhcr(['1.3.0']));
    expect(info.updateAvailable).toBe(true);
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('reports no update when running a dev build', async () => {
    process.env['VENCORE_VERSION'] = '0.0.0-dev';
    const { runUpdateCheck } = await import('../lib/update-check');
    const db = buildMockDb();
    const info = await runUpdateCheck(db as never, mockGhcr(['1.3.0']));
    expect(info.updateAvailable).toBe(false);
  });
});
