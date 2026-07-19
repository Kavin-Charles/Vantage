import { getAllPermissions, expandLegacyPermission } from '@vencore/modules';

// Permissions the seeded Member system role receives: every registry
// permission whose defaultRoles includes 'member'. Keys are already granular
// (Task 2), so no legacy expansion is needed for the seed itself.
export function memberSeedPermissions(): string[] {
  const keys = getAllPermissions()
    .filter(p => p.defaultRoles.includes('member'))
    .map(p => p.key);
  return [...new Set(keys)];
}

// For existing group_permissions rows that used legacy coarse keys.
export function mapLegacyRolePermission(key: string): string[] {
  return expandLegacyPermission(key);
}
