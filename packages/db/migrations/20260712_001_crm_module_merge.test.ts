import { describe, it, expect } from 'vitest';
import { deriveCrmEnabled, rewriteKeysForCrm } from './20260712_001_crm_module_merge';

describe('deriveCrmEnabled (parent = any old module enabled)', () => {
  it('true when any of the four is enabled', () => {
    expect(deriveCrmEnabled({ contacts: true, companies: true, pipelines: true, tasks: true })).toBe(true);
    expect(deriveCrmEnabled({ contacts: false, companies: false, pipelines: false, tasks: true })).toBe(true);
  });

  it('false only when all four are explicitly disabled', () => {
    expect(deriveCrmEnabled({ contacts: false, companies: false, pipelines: false, tasks: false })).toBe(false);
  });

  it('missing rows count as enabled (defaultEnabled)', () => {
    expect(deriveCrmEnabled({})).toBe(true);
    expect(deriveCrmEnabled({ tasks: false })).toBe(true);
    expect(deriveCrmEnabled({ contacts: false })).toBe(true);
  });
});

describe('rewriteKeysForCrm (per-page nested keys)', () => {
  it('maps each old key to its nested /crm/* key in place', () => {
    expect(rewriteKeysForCrm(['/pipeline', '/contacts', '/companies', '/tasks', '/activity']))
      .toEqual(['/crm/pipeline', '/crm/contacts', '/crm/companies', '/crm/tasks', '/activity']);
  });

  it('keeps position when old keys are interleaved', () => {
    expect(rewriteKeysForCrm(['/dashboard', '/contacts', '/servers', '/tasks']))
      .toEqual(['/dashboard', '/crm/contacts', '/servers', '/crm/tasks']);
  });

  it('leaves untouched lists alone', () => {
    expect(rewriteKeysForCrm(['/dashboard', '/alerts'])).toEqual(['/dashboard', '/alerts']);
  });

  it('dedupes when a mapped key already exists', () => {
    expect(rewriteKeysForCrm(['/crm/tasks', '/tasks', '/contacts'])).toEqual(['/crm/tasks', '/crm/contacts']);
  });
});
