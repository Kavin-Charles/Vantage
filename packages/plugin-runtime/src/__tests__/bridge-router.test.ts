import { describe, it, expect, vi } from 'vitest';
import { dispatchBridgeCall } from '../bridge-router';
import { bridgeRegistry } from '../bridge-registry';
import type { BridgeContext } from '../bridge-router';
import type { Kysely } from 'kysely';

function makeCtx(overrides: Partial<BridgeContext> = {}): BridgeContext {
  return {
    workspaceId: 'ws-1',
    pluginSlug: 'com.example.test',
    dataAccess: ['contacts:read', 'contacts:write', 'storage:read', 'storage:write'],
    tables: ['my_cache'],
    ...overrides,
  };
}

function makeDb(selectResult: unknown[] = []): Kysely<any> {
  const execute = vi.fn().mockResolvedValue(selectResult);
  const executeTakeFirst = vi.fn().mockResolvedValue(selectResult[0] ?? undefined);
  const base: Record<string, unknown> = { execute, executeTakeFirst };
  const chain: any = new Proxy(base, {
    get: (target, key) => {
      if (key in target) return target[key as string];
      return (..._args: unknown[]) => chain;
    },
  });
  return chain as unknown as Kysely<any>;
}

describe('dispatchBridgeCall — permission gate (registry-based)', () => {
  it('returns FORBIDDEN when registered handler permission missing', async () => {
    const db = makeDb();
    // Register a contacts.list handler requiring contacts:read
    bridgeRegistry.register('contacts.list.test_forbidden', 'contacts:read', async () => []);
    const ctx = makeCtx({ dataAccess: [] });
    const result = await dispatchBridgeCall(db, ctx, { method: 'contacts.list.test_forbidden', payload: {} });
    expect(result.error?.code).toBe('FORBIDDEN');
  });

  it('returns data when registered handler permission satisfied', async () => {
    const db = makeDb([{ id: '1' }]);
    bridgeRegistry.register('contacts.list.test_ok', 'contacts:read', async () => [{ id: '1' }]);
    const result = await dispatchBridgeCall(db, makeCtx(), { method: 'contacts.list.test_ok', payload: {} });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: '1' }]);
  });

  // Module methods (contacts.list, deals.get etc.) are registered at API startup (Task 9)
  it('returns UNKNOWN_METHOD for unregistered module method', async () => {
    const db = makeDb();
    const result = await dispatchBridgeCall(db, makeCtx(), { method: 'contacts.list', payload: {} });
    expect(result.error?.code).toBe('UNKNOWN_METHOD');
  });
});

describe('dispatchBridgeCall — table access', () => {
  it('returns FORBIDDEN for undeclared table', async () => {
    const db = makeDb();
    const result = await dispatchBridgeCall(
      db,
      makeCtx({ tables: [] }),
      { method: 'table.list', payload: { name: 'secret_table' } },
    );
    expect(result.error?.code).toBe('FORBIDDEN');
  });

  it('allows declared table and dispatches to table-client', async () => {
    const db = makeDb([{ id: 'row-1' }]);
    const result = await dispatchBridgeCall(
      db,
      makeCtx({ tables: ['my_cache'] }),
      { method: 'table.list', payload: { name: 'my_cache' } },
    );
    // Table declared — passes access check and dispatches to dispatchTableCall.
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: 'row-1' }]);
  });
});

describe('dispatchBridgeCall — unknown method', () => {
  it('returns UNKNOWN_METHOD for unrecognised namespace', async () => {
    const db = makeDb();
    const result = await dispatchBridgeCall(db, makeCtx(), { method: 'foobar.xyz', payload: {} });
    expect(result.error?.code).toBe('UNKNOWN_METHOD');
  });
});
