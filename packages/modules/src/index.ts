export * from './types';
export * from './hook-types';
export * from './crm';
export * from './infra';
export * from './analytics';
export * from './activity';
export * from './dashboard';
export * from './projects';
export * from './messaging';
export * from './admin';

import { CRM_MODULE } from './crm';
import { INFRA_MODULE } from './infra';
import { ANALYTICS_MODULE } from './analytics';
import { ACTIVITY_MODULE } from './activity';
import { DASHBOARD_MODULE } from './dashboard';
import { PROJECTS_MODULE } from './projects';
import { MESSAGING_MODULE } from './messaging';
import { ADMIN_MODULE } from './admin';
import type { ModuleDefinition, PermissionDef, UserRole } from './types';
import type { HookFeature } from './hook-types';
import { PROJECT_MANAGEMENT_HOOKS } from './projects/hooks';

export const HOOK_REGISTRY: Record<string, HookFeature[]> = {
  'projects': PROJECT_MANAGEMENT_HOOKS,
};

export const MODULE_REGISTRY: ModuleDefinition[] = [
  DASHBOARD_MODULE,
  CRM_MODULE,
  INFRA_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
  PROJECTS_MODULE,
  MESSAGING_MODULE,
  ADMIN_MODULE,
];

export const MODULE_IDS: string[] = MODULE_REGISTRY.map(m => m.id);

export function getAllPermissions(): PermissionDef[] {
  return MODULE_REGISTRY.flatMap(m => m.permissions);
}

export function getDefaultPermissionsForRole(role: UserRole): string[] {
  return getAllPermissions()
    .filter(p => p.defaultRoles.includes(role))
    .map(p => p.key);
}

export function getModuleForPermission(key: string): string | null {
  const mod = MODULE_REGISTRY.find(m => m.permissions.some(p => p.key === key));
  return mod?.id ?? null;
}

// 'projects:view' is intentionally absent here: it survives the rewrite as its
// own granular permission (see PROJECTS_MODULE), so it is not legacy and must
// pass through expandLegacyPermission() unchanged.
export const LEGACY_PERMISSION_MAP: Record<string, string[]> = {
  'projects:manage': [
    'projects:create', 'projects:edit', 'projects:archive',
    'pm.tasks:assign', 'pm.tasks:delete',
    'pm.sprints:manage', 'pm.milestones:manage',
    'pm.automations:manage', 'pm.portal:manage', 'pm.docs:edit',
  ],
};

export function expandLegacyPermission(key: string): string[] {
  return LEGACY_PERMISSION_MAP[key] ?? [key];
}
