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
}
