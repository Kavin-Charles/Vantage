import { describe, it, expect } from 'vitest';
import { isValidVersion, rewriteEnvVersion } from './lib';

describe('isValidVersion', () => {
  it('accepts x.y.z only', () => {
    expect(isValidVersion('1.2.3')).toBe(true);
    expect(isValidVersion('latest')).toBe(false);
    expect(isValidVersion('1.2')).toBe(false);
    expect(isValidVersion('1.2.3;rm -rf /')).toBe(false);
  });
});

describe('rewriteEnvVersion', () => {
  it('replaces VENCORE_VERSION and records the previous value', () => {
    const input = 'JWT_SECRET=abc\nVENCORE_VERSION=1.2.0\nREDIS_URL=redis://redis:6379\n';
    const out = rewriteEnvVersion(input, '1.3.0');
    expect(out).toContain('VENCORE_VERSION=1.3.0');
    expect(out).toContain('VENCORE_PREVIOUS_VERSION=1.2.0');
    expect(out).toContain('JWT_SECRET=abc');
    expect(out.match(/^VENCORE_VERSION=/gm)).toHaveLength(1);
  });

  it('appends VENCORE_VERSION when missing and records no previous', () => {
    const out = rewriteEnvVersion('JWT_SECRET=abc\n', '1.3.0');
    expect(out).toContain('VENCORE_VERSION=1.3.0');
    expect(out).not.toContain('VENCORE_PREVIOUS_VERSION');
  });

  it('overwrites a stale VENCORE_PREVIOUS_VERSION line', () => {
    const input = 'VENCORE_PREVIOUS_VERSION=1.1.0\nVENCORE_VERSION=1.2.0\n';
    const out = rewriteEnvVersion(input, '1.3.0');
    expect(out).toContain('VENCORE_PREVIOUS_VERSION=1.2.0');
    expect(out).not.toContain('VENCORE_PREVIOUS_VERSION=1.1.0');
  });
});
