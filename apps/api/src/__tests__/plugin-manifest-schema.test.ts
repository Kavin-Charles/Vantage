import { describe, it, expect } from 'vitest';
import { manifestSchema } from '../routes/plugins';

const base = { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' };

describe('manifest version field', () => {
  it('accepts stable and prerelease semver', () => {
    expect(manifestSchema.safeParse({ ...base, version: '1.2.3' }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...base, version: '1.2.3-dev.1' }).success).toBe(true);
  });

  it('rejects non-semver', () => {
    expect(manifestSchema.safeParse({ ...base, version: '1.2' }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, version: '1.2.3.4' }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, version: 'latest' }).success).toBe(false);
  });
});

describe('manifest sdk_version field', () => {
  it('accepts exact semver, rejects ranges', () => {
    expect(manifestSchema.safeParse({ ...base, sdk_version: '0.0.1' }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...base, sdk_version: '^0.0.1' }).success).toBe(false);
  });

  it('remains optional', () => {
    expect(manifestSchema.safeParse(base).success).toBe(true);
  });
});

describe('manifest host_version field', () => {
  it('accepts valid ranges', () => {
    expect(manifestSchema.safeParse({ ...base, host_version: '>=1.2.0 <2' }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...base, host_version: '^1.2' }).success).toBe(true);
  });

  it('rejects garbage ranges', () => {
    expect(manifestSchema.safeParse({ ...base, host_version: 'not a range' }).success).toBe(false);
  });

  it('remains optional', () => {
    expect(manifestSchema.safeParse(base).success).toBe(true);
  });
});
