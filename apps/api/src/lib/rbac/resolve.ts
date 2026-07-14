import { authorizedRoleClosure, type InheritanceEdge } from './closure';

export type RoleResolveInput = {
  activeRoleIds: string[];
  edges: InheritanceEdge[];
  grantsAllRoleIds: Set<string>;
  rolePermissions: Map<string, string[]>;
  enabledModuleIds: Set<string>;
  moduleOf: (perm: string) => string | null;
};

export function resolveRolePermissions(input: RoleResolveInput): { superuser: boolean; permissions: Set<string> } {
  if (input.activeRoleIds.some(id => input.grantsAllRoleIds.has(id))) {
    return { superuser: true, permissions: new Set() };
  }
  const roles = authorizedRoleClosure(input.activeRoleIds, input.edges);
  const perms = new Set<string>();
  for (const roleId of roles) {
    for (const perm of input.rolePermissions.get(roleId) ?? []) {
      const mod = input.moduleOf(perm);
      if (mod === null || input.enabledModuleIds.has(mod)) perms.add(perm);
    }
  }
  return { superuser: false, permissions: perms };
}
