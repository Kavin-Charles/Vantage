import { describe, it, expect, vi } from 'vitest';
import { runMigrations } from '../migration-runner';
import type { PluginMigration } from '@vencore/plugin-types';
import type { Kysely } from 'kysely';

// Mock kysely's sql tag so sql.raw(...).execute() is a no-op in unit tests
vi.mock('kysely', async (importOriginal) => {
  const actual = await importOriginal<typeof import('kysely')>();
  return {
    ...actual,
    sql: Object.assign(
      vi.fn(),
      {
        raw: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) }),
      },
    ),
  };
});

const MIGRATIONS: PluginMigration[] = [
  { version: '1.0.0', up: 'CREATE TABLE plugin_test_t1 (id uuid PRIMARY KEY)' },
  { version: '1.1.0', up: 'ALTER TABLE plugin_test_t1 ADD COLUMN name text' },
];

function makeMockDb(appliedVersions: string[] = []) {
  const sqlExecute = vi.fn().mockResolvedValue(undefined);
  const insertExecute = vi.fn().mockResolvedValue(undefined);

  const selectResult = appliedVersions.map((v) => ({ version: v }));

  const db = {
    selectFrom: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(selectResult),
    }),
    insertInto: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnThis(),
      execute: insertExecute,
    }),
    schema: {
      createTable: vi.fn().mockReturnValue({
        ifNotExists: vi.fn().mockReturnThis(),
        addColumn: vi.fn().mockReturnThis(),
        addUniqueConstraint: vi.fn().mockReturnThis(),
        execute: sqlExecute,
      }),
    },
  };

  return { db: db as unknown as Kysely<any>, sqlExecute, insertExecute };
}

describe('runMigrations', () => {
  it('runs all migrations when none applied yet', async () => {
    const { db, insertExecute } = makeMockDb([]);
    await runMigrations(db, 'com.example.test', 'ws-1', MIGRATIONS);
    expect(insertExecute).toHaveBeenCalledTimes(2);
  });

  it('skips already-applied migrations', async () => {
    const { db, insertExecute } = makeMockDb(['1.0.0']);
    await runMigrations(db, 'com.example.test', 'ws-1', MIGRATIONS);
    expect(insertExecute).toHaveBeenCalledTimes(1);
  });

  it('runs migrations in version sort order', async () => {
    const shuffled: PluginMigration[] = [
      { version: '1.1.0', up: 'ALTER TABLE t1 ADD COLUMN name text' },
      { version: '1.0.0', up: 'CREATE TABLE t1 (id uuid PRIMARY KEY)' },
    ];
    const { db, insertExecute } = makeMockDb([]);
    await runMigrations(db, 'com.example.test', 'ws-1', shuffled);
    expect(insertExecute).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when all migrations already applied', async () => {
    const { db, insertExecute } = makeMockDb(['1.0.0', '1.1.0']);
    await runMigrations(db, 'com.example.test', 'ws-1', MIGRATIONS);
    expect(insertExecute).toHaveBeenCalledTimes(0);
  });
});
