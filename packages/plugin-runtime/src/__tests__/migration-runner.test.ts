import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations } from '../migration-runner';
import type { PluginTableDef } from '@vencore/plugin-types';
import type { Kysely } from 'kysely';

const TABLES: PluginTableDef[] = [
  {
    name: 'items',
    columns: [
      { name: 'id', type: 'uuid', primary: true },
      { name: 'label', type: 'text', nullable: false },
    ],
  },
  {
    name: 'tags',
    columns: [
      { name: 'id', type: 'uuid', primary: true },
      { name: 'name', type: 'text', nullable: false },
    ],
    drop_on_uninstall: true,
  },
];

function makeMockDb(appliedVersions: string[] = []) {
  const tableExecute = vi.fn().mockResolvedValue(undefined);
  const insertExecute = vi.fn().mockResolvedValue({ id: '1' });
  const selectResult = appliedVersions.map((v) => ({ version: v }));

  const onConflictChain = { doNothing: vi.fn().mockReturnThis(), execute: insertExecute };
  const insertChain = { values: vi.fn().mockReturnThis(), onConflict: vi.fn().mockReturnValue(onConflictChain), execute: insertExecute };
  const selectChain = { select: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue(selectResult) };

  const createColChain = {
    ifNotExists: vi.fn().mockReturnThis(),
    addColumn: vi.fn().mockReturnThis(),
    execute: tableExecute,
  };
  const createIdxChain = {
    ifNotExists: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    columns: vi.fn().mockReturnThis(),
    unique: vi.fn().mockReturnThis(),
    execute: tableExecute,
  };

  const advisoryLockExecute = vi.fn().mockResolvedValue(undefined);

  const db = {
    selectFrom: vi.fn().mockReturnValue(selectChain),
    insertInto: vi.fn().mockReturnValue(insertChain),
    schema: {
      createTable: vi.fn().mockReturnValue(createColChain),
      createIndex: vi.fn().mockReturnValue(createIdxChain),
    },
    transaction: vi.fn().mockImplementation((cb: any) => ({
      execute: (fn: (trx: any) => Promise<void>) => fn({
        selectFrom: vi.fn().mockReturnValue(selectChain),
        insertInto: vi.fn().mockReturnValue(insertChain),
        schema: {
          createTable: vi.fn().mockReturnValue(createColChain),
          createIndex: vi.fn().mockReturnValue(createIdxChain),
        },
      } as unknown as Kysely<any>),
    })),
  } as unknown as Kysely<any>;

  return { db, tableExecute, insertExecute };
}

describe('runMigrations (generated DDL)', () => {
  it('is a no-op with empty tables array', async () => {
    const { db, tableExecute } = makeMockDb([]);
    await runMigrations(db, 'test-plugin', 'ws-1', []);
    expect(tableExecute).not.toHaveBeenCalled();
  });

  it('creates tables that have not yet been applied', async () => {
    const { db, tableExecute } = makeMockDb([]);
    await runMigrations(db, 'test-plugin', 'ws-1', TABLES);
    expect(tableExecute).toHaveBeenCalled();
  });

  it('skips tables already in the migration log', async () => {
    const { db, tableExecute } = makeMockDb(['table:items', 'table:tags']);
    await runMigrations(db, 'test-plugin', 'ws-1', TABLES);
    // Schema createTable should NOT be called because both versions are already applied
    // The mock transaction calls the fn inline; tableExecute comes from createTable chain
    expect(tableExecute).not.toHaveBeenCalled();
  });
});
