import { describe, it, expect } from 'vitest';
import {
  isStableSemver,
  compareSemver,
  pickLatest,
  SUPPORTED_SDK_MAJOR,
} from '../lib/version';

describe('isStableSemver', () => {
  it('accepts plain X.Y.Z', () => {
    expect(isStableSemver('1.2.3')).toBe(true);
    expect(isStableSemver('0.1.0')).toBe(true);
  });

  it('rejects prereleases and junk', () => {
    expect(isStableSemver('1.2.3-rc.1')).toBe(false);
    expect(isStableSemver('0.0.0-dev')).toBe(false);
    expect(isStableSemver('latest')).toBe(false);
    expect(isStableSemver('1.2')).toBe(false);
  });
});

describe('compareSemver', () => {
  it('orders numerically, not lexically', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('orders prereleases below their release', () => {
    expect(compareSemver('1.2.0-dev.1', '1.2.0')).toBeLessThan(0);
    expect(compareSemver('1.2.0-dev.2', '1.2.0-dev.1')).toBeGreaterThan(0);
  });
});

describe('pickLatest', () => {
  it('picks the highest stable version', () => {
    expect(pickLatest(['latest', '1.2', '1.2.3', '1.10.0', '1.9.9'])).toBe('1.10.0');
  });

  it('ignores prerelease tags', () => {
    expect(pickLatest(['1.2.3', '2.0.0-rc.1'])).toBe('1.2.3');
  });

  it('returns null when nothing stable', () => {
    expect(pickLatest(['latest', 'main'])).toBeNull();
    expect(pickLatest(['2.0.0-rc.1'])).toBeNull();
    expect(pickLatest([])).toBeNull();
  });
});

describe('SUPPORTED_SDK_MAJOR', () => {
  it('is a non-negative integer', () => {
    expect(Number.isInteger(SUPPORTED_SDK_MAJOR)).toBe(true);
    expect(SUPPORTED_SDK_MAJOR).toBeGreaterThanOrEqual(0);
  });
});
