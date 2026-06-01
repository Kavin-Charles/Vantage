import { describe, it, expect, vi } from 'vitest';
import { dispatchBridgeCall } from '../bridge-router';
import type { BridgeContext } from '../bridge-router';
import type { Kysely } from 'kysely';

function makeCtx(overrides: Partial<BridgeContext> = {}): BridgeContext {
  return {
    workspaceId: 'ws-1',
    pluginSlug: 'com.example.test',
    permissions: ['contacts:read', 'contacts:write', 'storage:read', 'storage:write'],
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

describe('dispatchBridgeCall — permission gate', () => {
  it('returns FORBIDDEN when permission missing', async () => {
    const db = makeDb();
    const ctx = makeCtx({ permissions: [] });
    const result = await dispatchBridgeCall(db, ctx, { method: 'contacts.list', payload: {} });
    expect(result.error?.code).toBe('FORBIDDEN');
  });

  it('returns data when permission satisfied', async () => {
    const db = makeDb([{ id: '1' }]);
    const result = await dispatchBridgeCall(db, makeCtx(), { method: 'contacts.list', payload: { filter: {} } });
    expect(result.error).toBeNull();
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
