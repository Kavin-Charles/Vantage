export * from './types';
export * from './contacts';
export * from './companies';
export * from './pipelines';
export * from './tasks';
export * from './websites';
export * from './servers';
export * from './databases';
export * from './analytics';
export * from './activity';
export * from './dashboard';
export * from './projects';
export * from './alerts';
export * from './messaging';

import { CONTACTS_MODULE } from './contacts';
import { COMPANIES_MODULE } from './companies';
import { PIPELINES_MODULE } from './pipelines';
import { TASKS_MODULE } from './tasks';
import { WEBSITES_MODULE } from './websites';
import { SERVERS_MODULE } from './servers';
import { DATABASES_MODULE } from './databases';
import { ANALYTICS_MODULE } from './analytics';
import { ACTIVITY_MODULE } from './activity';
import { DASHBOARD_MODULE } from './dashboard';
import { PROJECTS_MODULE } from './projects';
import { ALERTS_MODULE } from './alerts';
import { MESSAGING_MODULE } from './messaging';
import type { ModuleDefinition, PermissionDef, UserRole } from './types';

export const MODULE_REGISTRY: ModuleDefinition[] = [
  DASHBOARD_MODULE,
  CONTACTS_MODULE,
  COMPANIES_MODULE,
  PIPELINES_MODULE,
  TASKS_MODULE,
  WEBSITES_MODULE,
  SERVERS_MODULE,
  DATABASES_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
  PROJECTS_MODULE,
  ALERTS_MODULE,
  MESSAGING_MODULE,
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
