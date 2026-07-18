import { describe, it, expect } from 'vitest';
import { memberSeedPermissions, mapLegacyRolePermission } from './20260714_001_rbac3.helpers';

describe('memberSeedPermissions', () => {
  it('includes baseline member keys and excludes admin-only keys', () => {
    const perms = memberSeedPermissions();
    expect(perms).toContain('contacts:view');
    expect(perms).toContain('pm.tasks:create');
    expect(perms).not.toContain('projects:delete');
    expect(perms).not.toContain('roles:manage');
  });
  it('is deduped', () => {
    const perms = memberSeedPermissions();
    expect(new Set(perms).size).toBe(perms.length);
  });
});

describe('mapLegacyRolePermission', () => {
  it('expands projects:manage', () => {
    expect(mapLegacyRolePermission('projects:manage')).toContain('pm.sprints:manage');
  });
});
