import { describe, it, expect } from 'vitest';
import {
  getDefaultPermissionsForRole,
  getModuleForPermission,
  getAllPermissions,
  MODULE_REGISTRY,
  INFRA_SUBMODULE_IDS,
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
    expect(getModuleForPermission('contacts:create')).toBe('crm');
    expect(getModuleForPermission('pipelines:stage.edit')).toBe('crm');
    expect(getModuleForPermission('tasks:delete')).toBe('crm');
    expect(getModuleForPermission('servers:delete')).toBe('infra');
    expect(getModuleForPermission('websites:view')).toBe('infra');
    expect(getModuleForPermission('alerts:configure')).toBe('infra');
    expect(getModuleForPermission('analytics:view')).toBe('analytics');
  });

  it('returns null for unknown permission', () => {
    expect(getModuleForPermission('unknown:action')).toBeNull();
  });
});

describe('MODULE_REGISTRY', () => {
  it('contains crm and not the merged module ids', () => {
    const ids = MODULE_REGISTRY.map(m => m.id);
    expect(ids).toContain('crm');
    for (const old of ['contacts', 'companies', 'pipelines', 'tasks']) {
      expect(ids).not.toContain(old);
    }
  });

  it('crm module carries all merged permission keys', () => {
    const crm = MODULE_REGISTRY.find(m => m.id === 'crm');
    const keys = crm!.permissions.map(p => p.key);
    expect(keys).toEqual(expect.arrayContaining([
      'contacts:view', 'contacts:delete',
      'companies:view', 'companies:delete',
      'pipelines:view', 'pipelines:config', 'pipelines:field.delete',
      'tasks:view', 'tasks:delete',
    ]));
    expect(keys).toHaveLength(21);
  });

  it('contains infra and not the merged infra module ids', () => {
    const ids = MODULE_REGISTRY.map(m => m.id);
    expect(ids).toContain('infra');
    for (const old of ['servers', 'databases', 'websites', 'alerts']) {
      expect(ids).not.toContain(old);
    }
  });

  it('infra module carries all merged permission keys', () => {
    const infra = MODULE_REGISTRY.find(m => m.id === 'infra');
    const keys = infra!.permissions.map(p => p.key);
    expect(keys).toEqual(expect.arrayContaining([
      'servers:view', 'servers:ssh', 'servers:delete',
      'databases:view', 'databases:delete',
      'websites:view', 'websites:delete',
      'alerts:view', 'alerts:acknowledge', 'alerts:resolve', 'alerts:configure',
    ]));
    expect(keys).toHaveLength(17);
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

describe('INFRA_SUBMODULES', () => {
  it('exposes the four child module ids', () => {
    expect(INFRA_SUBMODULE_IDS).toEqual([
      'infra:servers', 'infra:databases', 'infra:websites', 'infra:alerts',
    ]);
  });
});
