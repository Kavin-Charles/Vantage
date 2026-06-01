import { apiFetch } from './core';

export interface PermissionEntry {
  key: string;
  label: string;
  moduleId: string;
  moduleName: string;
  effectivelyGranted: boolean;
  isOverride: boolean;
  moduleEnabled: boolean;
}

export interface UserPermissionsResponse {
  data: { permissions: PermissionEntry[] };
  error: null;
}

export async function getUserPermissions(
  token: string,
  userId: string,
): Promise<UserPermissionsResponse> {
  return apiFetch(`/api/users/${userId}/permissions`, { token });
}

export async function setUserPermission(
  token: string,
  userId: string,
  permission: string,
  granted: boolean,
): Promise<{ data: { permission: string; granted: boolean }; error: null }> {
  return apiFetch(`/api/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permission, granted }),
    token,
  });
}

export async function deleteUserPermissionOverride(
  token: string,
  userId: string,
  permission: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/users/${userId}/permissions/${encodeURIComponent(permission)}`, {
    method: 'DELETE',
    token,
  });
}
