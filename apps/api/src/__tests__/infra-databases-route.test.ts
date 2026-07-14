import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('infra databases router safety wiring', () => {
  it('uses safe response helpers and admin guards for data-editing routes', () => {
    const source = readFileSync(join(__dirname, '../routes/infra-databases.ts'), 'utf-8');

    expect(source).toContain('redactInfraDatabase');
    expect(source).toContain('runTargetDatabaseSql');
    expect(source).toContain('return req.isAdmin;');
    expect(source).toContain("{ code: 'FORBIDDEN'");
    expect(source).toContain("db_password: body.db_password");
  });
});

