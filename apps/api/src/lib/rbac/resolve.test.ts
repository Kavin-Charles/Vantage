import { describe, it, expect } from 'vitest';
import { resolveRolePermissions } from './resolve';

const moduleOf = (p: string) => (p.startsWith('contacts') ? 'crm' : p.startsWith('pm.') ? 'projects' : null);

describe('resolveRolePermissions', () => {
  it('short-circuits for a grants_all role', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['admin'], edges: [], grantsAllRoleIds: new Set(['admin']),
      rolePermissions: new Map(), enabledModuleIds: new Set(), moduleOf,
    });
    expect(r.superuser).toBe(true);
  });
  it('unions permissions across active + inherited roles', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['senior'],
      edges: [{ parent: 'senior', child: 'junior' }],
      grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['senior', ['contacts:edit']], ['junior', ['contacts:view']]]),
      enabledModuleIds: new Set(['crm']), moduleOf,
    });
    expect(r.superuser).toBe(false);
    expect(r.permissions.has('contacts:view')).toBe(true);
    expect(r.permissions.has('contacts:edit')).toBe(true);
  });
  it('filters permissions whose module is disabled', () => {
    const r = resolveRolePermissions({
      activeRoleIds: ['x'], edges: [], grantsAllRoleIds: new Set(),
      rolePermissions: new Map([['x', ['contacts:view', 'pm.tasks:view']]]),
      enabledModuleIds: new Set(['crm']), moduleOf,
    });
    expect(r.permissions.has('contacts:view')).toBe(true);
    expect(r.permissions.has('pm.tasks:view')).toBe(false);
  });
});
