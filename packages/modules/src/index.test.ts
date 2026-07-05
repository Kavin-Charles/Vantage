import { describe, it, expect } from 'vitest';
import {
  getDefaultPermissionsForRole,
  getModuleForPermission,
  getAllPermissions,
  MODULE_REGISTRY,
} from './index';

describe('getDefaultPermissionsForRole', () => {
  it('admin gets all permissions', () => {
    const all = getAllPermissions().map(p => p.key);
    const adminPerms = getDefaultPermissionsForRole('admin');
    expect(adminPerms).toEqual(expect.arrayContaining(all));
    expect(adminPerms.length).toBe(all.length);
  });

  it('member does not get delete permissions', () => {
    const memberPerms = getDefaultPermissionsForRole('member');
    const deletePerms = memberPerms.filter(p => p.endsWith(':delete'));
    expect(deletePerms).toHaveLength(0);
  });

  it('member gets view, create, edit for contacts', () => {
    const memberPerms = getDefaultPermissionsForRole('member');
    expect(memberPerms).toContain('contacts:view');
    expect(memberPerms).toContain('contacts:create');
    expect(memberPerms).toContain('contacts:edit');
    expect(memberPerms).not.toContain('contacts:delete');
  });
});

describe('getModuleForPermission', () => {
  it('returns correct moduleId for known permission', () => {
    expect(getModuleForPermission('contacts:create')).toBe('contacts');
    expect(getModuleForPermission('servers:delete')).toBe('servers');
    expect(getModuleForPermission('analytics:view')).toBe('analytics');
  });

  it('returns null for unknown permission', () => {
    expect(getModuleForPermission('unknown:action')).toBeNull();
  });
});

describe('MODULE_REGISTRY', () => {
  it('has 8 modules', () => {
    expect(MODULE_REGISTRY).toHaveLength(8);
  });

  it('every module has at least one permission', () => {
    for (const mod of MODULE_REGISTRY) {
      expect(mod.permissions.length).toBeGreaterThan(0);
    }
  });

  it('projects module emits both activity and alerts', () => {
    const projects = MODULE_REGISTRY.find(m => m.id === 'projects');
    expect(projects?.emitsActivity).toBe(true);
    expect(projects?.emitsAlerts).toBe(true);
  });
});
