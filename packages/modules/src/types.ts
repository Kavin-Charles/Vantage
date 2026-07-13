export type UserRole = 'admin' | 'member';

export interface PermissionDef {
  key: string;
  label: string;
  defaultRoles: UserRole[];
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  permissions: PermissionDef[];
  nav: NavItem[];
  apiPrefixes: string[];
  workers: string[];
  emitsActivity?: boolean;
  emitsAlerts?: boolean;
}

// A parent module's per-page child. Each child gates one sidebar entry, its
// page, and its API routes; a child is only effective when the parent module
// is also enabled.
export interface SubModule {
  id: string;
  label: string;
  path: string;
  permission: string;
  legacyModuleId: string;
}
