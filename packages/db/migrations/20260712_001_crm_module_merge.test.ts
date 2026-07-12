import { describe, it, expect } from 'vitest';
import { deriveCrmEnabled, rewriteKeysForCrm } from './20260712_001_crm_module_merge';

describe('deriveCrmEnabled', () => {
  it('true only when all four are enabled', () => {
    expect(deriveCrmEnabled({ contacts: true, companies: true, pipelines: true, tasks: true })).toBe(true);
    expect(deriveCrmEnabled({ contacts: true, companies: true, pipelines: false, tasks: true })).toBe(false);
  });

  it('missing rows count as enabled (defaultEnabled)', () => {
    expect(deriveCrmEnabled({ contacts: true })).toBe(true);
    expect(deriveCrmEnabled({})).toBe(true);
    expect(deriveCrmEnabled({ tasks: false })).toBe(false);
  });
});

describe('rewriteKeysForCrm', () => {
  it('replaces the first old key in place and drops the rest', () => {
    expect(rewriteKeysForCrm(['/pipeline', '/contacts', '/companies', '/tasks', '/activity']))
      .toEqual(['/crm', '/activity']);
  });

  it('keeps position when old keys are interleaved', () => {
    expect(rewriteKeysForCrm(['/dashboard', '/contacts', '/servers', '/tasks']))
      .toEqual(['/dashboard', '/crm', '/servers']);
  });

  it('leaves untouched lists alone', () => {
    expect(rewriteKeysForCrm(['/dashboard', '/alerts'])).toEqual(['/dashboard', '/alerts']);
  });

  it('does not duplicate an existing /crm key', () => {
    expect(rewriteKeysForCrm(['/crm', '/contacts', '/tasks'])).toEqual(['/crm']);
  });
});
