import { describe, expect, it } from 'vitest';

describe('infra db client helpers', () => {
  it('redacts db_password and exposes whether a password is configured', async () => {
    const { redactInfraDatabase } = await import('../lib/infra-db-client');

    const redacted = redactInfraDatabase({
      id: 'db-1',
      workspace_id: 'ws-1',
      name: 'prod',
      engine: 'postgres',
      version: null,
      host: 'db.internal',
      port: 5432,
      db_user: 'app',
      db_password: 'secret',
      database_name: 'appdb',
      use_ssl: true,
      storage_gb: null,
      connection_count: null,
      replication_lag_s: null,
      memory_used_mb: null,
      connected_clients: null,
      uptime_seconds: null,
      status: 'healthy',
      last_checked_at: null,
      created_at: '2026-05-14T00:00:00.000Z',
      updated_at: '2026-05-14T00:00:00.000Z',
    });

    expect(redacted).not.toHaveProperty('db_password');
    expect(redacted.has_password).toBe(true);
    expect(redacted.db_user).toBe('app');
  });

  it('classifies SQL statements and rejects blocked or multi-statement input', async () => {
    const { classifySqlStatement } = await import('../lib/infra-db-client');

    expect(classifySqlStatement(' select * from customers ')).toEqual({ kind: 'select' });
    expect(classifySqlStatement('UPDATE customers SET name = $1')).toEqual({ kind: 'dml' });
    expect(classifySqlStatement('delete from customers where id = 1')).toEqual({ kind: 'dml' });
    expect(classifySqlStatement('drop table customers')).toEqual({
      kind: 'blocked',
      code: 'BLOCKED_SQL',
      message: 'Schema-changing SQL is not allowed from Vantage.',
    });
    expect(classifySqlStatement('select 1; select 2')).toEqual({
      kind: 'blocked',
      code: 'MULTI_STATEMENT_SQL',
      message: 'Only one SQL statement can be run at a time.',
    });
  });

  it('quotes only discovered identifiers for the active dialect', async () => {
    const { quoteIdentifier } = await import('../lib/infra-db-client');

    expect(quoteIdentifier('postgres', 'users', ['users'])).toBe('"users"');
    expect(quoteIdentifier('mysql', 'users', ['users'])).toBe('`users`');
    expect(() => quoteIdentifier('postgres', 'users; drop table users', ['users'])).toThrow('Unknown identifier');
  });
});

