import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkVersionRules } from '../lib/plugin-version-rules';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

function mockDb(existingVersion: string | null) {
  const chain: Record<string, unknown> = {};
  for (const f of ['select', 'where']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['executeTakeFirst'] = vi
    .fn()
    .mockResolvedValue(existingVersion === null ? undefined : { version: existingVersion });
  return { selectFrom: vi.fn().mockReturnValue(chain) } as unknown as Kysely<Database>;
}

const WS = 'ws-1';

afterEach(() => {
  delete process.env['VENCORE_VERSION'];
});

describe('strict bump rule', () => {
  it('passes a fresh install (no existing row)', async () => {
    const r = await checkVersionRules(mockDb(null), WS, { id: 'p', version: '1.0.0' });
    expect(r.error).toBeNull();
  });

  it('passes an upgrade', async () => {
    const r = await checkVersionRules(mockDb('1.0.0'), WS, { id: 'p', version: '1.0.1' });
    expect(r.error).toBeNull();
  });

  it('rejects same version', async () => {
    const r = await checkVersionRules(mockDb('1.2.0'), WS, { id: 'p', version: '1.2.0' });
    expect(r.error?.code).toBe('VERSION_NOT_BUMPED');
    expect(r.error?.message).toContain('1.2.0');
  });

  it('rejects downgrade', async () => {
    const r = await checkVersionRules(mockDb('2.0.0'), WS, { id: 'p', version: '1.9.9' });
    expect(r.error?.code).toBe('VERSION_NOT_BUMPED');
    expect(r.error?.message).toContain('2.0.0');
    expect(r.error?.message).toContain('1.9.9');
  });

  it('orders prerelease chain correctly', async () => {
    const ok = await checkVersionRules(mockDb('1.2.0-dev.1'), WS, { id: 'p', version: '1.2.0-dev.2' });
    expect(ok.error).toBeNull();
    const release = await checkVersionRules(mockDb('1.2.0-dev.2'), WS, { id: 'p', version: '1.2.0' });
    expect(release.error).toBeNull();
    const behind = await checkVersionRules(mockDb('1.2.0'), WS, { id: 'p', version: '1.2.1-dev.1' });
    expect(behind.error).toBeNull();
    const stale = await checkVersionRules(mockDb('1.2.0'), WS, { id: 'p', version: '1.2.0-dev.3' });
    expect(stale.error?.code).toBe('VERSION_NOT_BUMPED');
  });

  it('allows republish over an invalid stored version', async () => {
    const r = await checkVersionRules(mockDb('1.2.3.4'), WS, { id: 'p', version: '1.0.0' });
    expect(r.error).toBeNull();
  });
});

describe('host_version range', () => {
  it('passes when host satisfies range', async () => {
    process.env['VENCORE_VERSION'] = '1.5.0';
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', host_version: '>=1.2.0 <2',
    });
    expect(r.error).toBeNull();
  });

  it('rejects when host outside range', async () => {
    process.env['VENCORE_VERSION'] = '1.1.3';
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', host_version: '>=1.2.0 <2',
    });
    expect(r.error?.code).toBe('HOST_VERSION_UNSATISFIED');
    expect(r.error?.message).toContain('>=1.2.0 <2');
    expect(r.error?.message).toContain('1.1.3');
  });

  it('skips the check on dev instances', async () => {
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', host_version: '>=99.0.0',
    });
    expect(r.error).toBeNull();
  });

  it('no check when host_version absent', async () => {
    process.env['VENCORE_VERSION'] = '0.1.0';
    const r = await checkVersionRules(mockDb(null), WS, { id: 'p', version: '1.0.0' });
    expect(r.error).toBeNull();
  });
});

describe('sdk_version warning', () => {
  it('warns on major mismatch, does not block', async () => {
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', sdk_version: '99.0.0',
    });
    expect(r.error).toBeNull();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('99.0.0');
  });

  it('silent when sdk_version matches supported major', async () => {
    const r = await checkVersionRules(mockDb(null), WS, {
      id: 'p', version: '1.0.0', sdk_version: '0.0.1',
    });
    expect(r.warnings).toHaveLength(0);
  });

  it('silent when sdk_version missing', async () => {
    const r = await checkVersionRules(mockDb(null), WS, { id: 'p', version: '1.0.0' });
    expect(r.warnings).toHaveLength(0);
  });
});
