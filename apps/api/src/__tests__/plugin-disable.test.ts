import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

vi.mock('../lib/plugin-loader', () => ({ invalidatePlugin: vi.fn() }));
vi.mock('@vencore/plugin-runtime', () => ({ deactivateProvider: vi.fn().mockResolvedValue([]) }));

import { disablePluginRuntime } from '../lib/plugin-disable';
import { invalidatePlugin } from '../lib/plugin-loader';
import { deactivateProvider } from '@vencore/plugin-runtime';

function mockDb(admins: Array<Record<string, unknown>>) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

  const selectChain: Record<string, unknown> = {};
  for (const f of ['select', 'where', 'innerJoin']) {
    selectChain[f] = vi.fn().mockReturnValue(selectChain);
  }
  selectChain['execute'] = vi.fn().mockResolvedValue(admins);

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

  const makeInsertChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain['values'] = vi.fn((values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return chain;
    });
    chain['execute'] = vi.fn().mockResolvedValue(undefined);
    return chain;
  };

  const db = {
    selectFrom: vi.fn().mockReturnValue(selectChain),
    updateTable: vi.fn((table: string) => makeUpdateChain(table)),
    insertInto: vi.fn((table: string) => makeInsertChain(table)),
  } as unknown as Kysely<Database>;

  return { db, updates, inserts };
}

const WS = 'ws-1';
const PLUGIN_ID = 'crm-plus';
const PLUGIN_NAME = 'CRM Plus';
const REASON = 'license revoked';

beforeEach(() => {
  vi.mocked(invalidatePlugin).mockClear();
  vi.mocked(deactivateProvider).mockClear();
});

describe('disablePluginRuntime', () => {
  it('invalidates the plugin cache and deactivates the runtime provider', async () => {
    const { db } = mockDb([{ id: 'admin-1' }]);

    await disablePluginRuntime(db, WS, PLUGIN_ID, PLUGIN_NAME, REASON);

    expect(invalidatePlugin).toHaveBeenCalledWith(PLUGIN_ID, WS);
    expect(deactivateProvider).toHaveBeenCalledWith(db, WS, PLUGIN_ID);
  });

  it('sets hook_providers enabled to false', async () => {
    const { db, updates } = mockDb([{ id: 'admin-1' }]);

    await disablePluginRuntime(db, WS, PLUGIN_ID, PLUGIN_NAME, REASON);

    const hookProvidersUpdate = updates.find((u) => u.table === 'hook_providers');
    expect(hookProvidersUpdate).toBeDefined();
    expect(hookProvidersUpdate!.values['enabled']).toBe(false);
    expect(hookProvidersUpdate!.values['updated_at']).toBeInstanceOf(Date);
  });

  it('inserts one plugin_notifications row per admin', async () => {
    const { db, inserts } = mockDb([{ id: 'admin-1' }, { id: 'admin-2' }]);

    await disablePluginRuntime(db, WS, PLUGIN_ID, PLUGIN_NAME, REASON);

    expect(inserts).toHaveLength(2);
    for (const [i, adminId] of ['admin-1', 'admin-2'].entries()) {
      expect(inserts[i]!.table).toBe('plugin_notifications');
      expect(inserts[i]!.values).toEqual({
        workspace_id: WS,
        user_id: adminId,
        plugin_id: PLUGIN_ID,
        title: 'CRM Plus was disabled',
        body: REASON,
        type: 'info',
      });
    }
  });

  it('does nothing and does not throw when there are no admins', async () => {
    const { db, inserts } = mockDb([]);

    await expect(disablePluginRuntime(db, WS, PLUGIN_ID, PLUGIN_NAME, REASON)).resolves.toBeUndefined();
    expect(inserts).toHaveLength(0);
  });
});
