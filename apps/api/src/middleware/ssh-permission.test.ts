import { describe, it, expect } from 'vitest';
import { getModuleForPermission } from '@vencore/modules';
import { resolveRolePermissions } from '../lib/rbac/resolve';

// DB wiring for userHasPermission is integration-tested in Plan B; here we
// assert the servers:ssh gate against the pure resolver contract the
// middleware/permission.ts userHasPermission ultimately delegates to.
describe('servers:ssh gate (resolver contract)', () => {
  it('a role with grants_all always passes, regardless of explicit perms', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['admin-role'],
      edges: [],
      grantsAllRoleIds: new Set(['admin-role']),
      rolePermissions: new Map(),
      enabledModuleIds: new Set(['infra']),
      moduleOf: getModuleForPermission,
    });
    expect(r.superuser).toBe(true);
  });

  it('denies a role without an explicit servers:ssh grant', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['member-role'],
      edges: [],
      grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['member-role', ['servers:view']]]),
      enabledModuleIds: new Set(['infra']),
      moduleOf: getModuleForPermission,
    });
    expect(r.permissions.has('servers:ssh')).toBe(false);
  });

  it('grants a role with an explicit servers:ssh permission', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['member-role'],
      edges: [],
      grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['member-role', ['servers:ssh']]]),
      enabledModuleIds: new Set(['infra']),
      moduleOf: getModuleForPermission,
    });
    expect(r.permissions.has('servers:ssh')).toBe(true);
  });

  it('denies when the infra module is disabled, even with the permission granted', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['member-role'],
      edges: [],
      grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['member-role', ['servers:ssh']]]),
      enabledModuleIds: new Set(['crm']),
      moduleOf: getModuleForPermission,
    });
    expect(r.permissions.has('servers:ssh')).toBe(false);
  });
});
