import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

vi.mock('../lib/plugin-disable', () => ({
  disablePluginRuntime: vi.fn().mockResolvedValue(undefined),
}));

import { runLicenseCheck } from '../workers/license-check';
import { disablePluginRuntime } from '../lib/plugin-disable';

const KEY_OK = '11111111-1111-4111-8111-111111111111';
const KEY_BAD = '22222222-2222-4222-8222-222222222222';

function mockDb(rows: Array<Record<string, unknown>>) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const selectChain: Record<string, unknown> = {};
  for (const f of ['select', 'where']) {
    selectChain[f] = vi.fn().mockReturnValue(selectChain);
  }
  selectChain['execute'] = vi.fn().mockResolvedValue(rows);

  const makeUpdateChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain['set'] = vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      return chain;
    });
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['execute'] = vi.fn().mockResolvedValue(undefined);
    return chain;
  };

  const db = {
    selectFrom: vi.fn().mockReturnValue(selectChain),
    updateTable: vi.fn((table: string) => makeUpdateChain(table)),
  } as unknown as Kysely<Database>;

  return { db, updates };
}

function mockFetch(results: Array<{ key: string; valid: boolean; status: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: results, error: null }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env['MARKETPLACE_API_URL'] = 'https://platform.test';
  process.env['MARKETPLACE_SERVICE_TOKEN'] = 'svc-token';
  vi.mocked(disablePluginRuntime).mockClear();
});

afterEach(() => {
  delete process.env['MARKETPLACE_API_URL'];
  delete process.env['MARKETPLACE_SERVICE_TOKEN'];
});

const ROWS = [
  { id: 'wp-1', workspace_id: 'ws-1', plugin_id: 'crm-plus', name: 'CRM Plus', license_key: KEY_OK, enabled: true },
  { id: 'wp-2', workspace_id: 'ws-1', plugin_id: 'infra-pro', name: 'Infra Pro', license_key: KEY_BAD, enabled: true },
];

describe('runLicenseCheck', () => {
  it('is a no-op when MARKETPLACE_API_URL unset', async () => {
    delete process.env['MARKETPLACE_API_URL'];
    const { db } = mockDb(ROWS);
    const fetchFn = mockFetch([]);
    await runLicenseCheck(db, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('records status and disables only unusable licenses', async () => {
    const { db, updates } = mockDb(ROWS);
    const fetchFn = mockFetch([
      { key: KEY_OK, valid: true, status: 'grace' },
      { key: KEY_BAD, valid: false, status: 'revoked' },
    ]);
    await runLicenseCheck(db, fetchFn);

    // one /check POST per workspace with instance_id = workspace id
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://platform.test/v1/licenses/check');
    expect(JSON.parse(init.body as string)).toEqual({ instance_id: 'ws-1', keys: [KEY_OK, KEY_BAD] });

    // grace: status recorded, still enabled, no teardown
    const graceUpdate = updates.find(u => u.values['license_status'] === 'grace');
    expect(graceUpdate).toBeDefined();
    expect(graceUpdate!.values['enabled']).toBeUndefined();

    // revoked: disabled + teardown
    const revokedUpdate = updates.find(u => u.values['license_status'] === 'revoked');
    expect(revokedUpdate).toBeDefined();
    expect(revokedUpdate!.values['enabled']).toBe(false);
    expect(disablePluginRuntime).toHaveBeenCalledTimes(1);
    expect(disablePluginRuntime).toHaveBeenCalledWith(db, 'ws-1', 'infra-pro', 'Infra Pro', expect.stringContaining('revoked'));
  });

  it('skips non-uuid license keys (platform rejects them)', async () => {
    const { db } = mockDb([
      { id: 'wp-3', workspace_id: 'ws-2', plugin_id: 'x', name: 'X', license_key: 'not-a-uuid', enabled: true },
    ]);
    const fetchFn = mockFetch([]);
    await runLicenseCheck(db, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
