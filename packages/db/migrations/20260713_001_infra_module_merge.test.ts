import { describe, it, expect } from 'vitest';
import { deriveInfraEnabled, rewriteKeysForInfra } from './20260713_001_infra_module_merge';

describe('deriveInfraEnabled (parent = any old module enabled)', () => {
  it('true when any of the four is enabled', () => {
    expect(deriveInfraEnabled({ servers: true, databases: true, websites: true, alerts: true })).toBe(true);
    expect(deriveInfraEnabled({ servers: false, databases: false, websites: false, alerts: true })).toBe(true);
  });

  it('false only when all four are explicitly disabled', () => {
    expect(deriveInfraEnabled({ servers: false, databases: false, websites: false, alerts: false })).toBe(false);
  });

  it('missing rows count as enabled (defaultEnabled)', () => {
    expect(deriveInfraEnabled({})).toBe(true);
    expect(deriveInfraEnabled({ alerts: false })).toBe(true);
    expect(deriveInfraEnabled({ servers: false })).toBe(true);
  });
});

describe('rewriteKeysForInfra (per-page nested keys)', () => {
  it('maps each old key to its nested /infra/* key in place', () => {
    expect(rewriteKeysForInfra(['/servers', '/databases', '/websites', '/alerts', '/analytics']))
      .toEqual(['/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts', '/analytics']);
  });

  it('keeps position when old keys are interleaved', () => {
    expect(rewriteKeysForInfra(['/dashboard', '/servers', '/crm/contacts', '/alerts']))
      .toEqual(['/dashboard', '/infra/servers', '/crm/contacts', '/infra/alerts']);
  });

  it('leaves untouched lists alone', () => {
    expect(rewriteKeysForInfra(['/dashboard', '/analytics'])).toEqual(['/dashboard', '/analytics']);
  });

  it('dedupes when a mapped key already exists', () => {
    expect(rewriteKeysForInfra(['/infra/servers', '/servers', '/databases'])).toEqual(['/infra/servers', '/infra/databases']);
  });
});
