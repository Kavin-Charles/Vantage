import { describe, it, expect, beforeEach } from 'vitest';
import { resolveRolePermissions } from '../lib/rbac/resolve';

// The DB wiring is integration-tested in Plan B; here we assert the pure
// resolver contract the middleware relies on.
beforeEach(() => {});

describe('resolver contract used by permission middleware', () => {
  const moduleOf = (p: string) => (p.startsWith('contacts') ? 'crm' : null);
  it('superuser bypasses everything', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['a'], edges: [], grantsAllRoleIds: new Set(['a']),
      rolePermissions: new Map(), enabledModuleIds: new Set(), moduleOf,
    });
    expect(r.superuser).toBe(true);
  });
  it('member gets only granted role perms in enabled modules', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['m'], edges: [], grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['m', ['contacts:view']]]),
      enabledModuleIds: new Set(['crm']), moduleOf,
    });
    expect(r.permissions.has('contacts:view')).toBe(true);
    expect(r.permissions.has('contacts:delete')).toBe(false);
  });
});
