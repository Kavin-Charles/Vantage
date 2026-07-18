import { apiFetch } from './core';

// Base role fields shared by every endpoint that returns a role row.
// GET /api/roles selects `rank` (used for list ordering) but not `member_count`
// on create/update; the list endpoint adds `member_count` on top of RoleBase.
export interface RoleBase {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_system: boolean;
  grants_all: boolean;
  is_default: boolean;
  max_members: number | null;
  rank: number;
}

export interface RoleSummary extends RoleBase {
  member_count: number | string;
}

export interface GroupedPermission {
  key: string;
  label: string;
  granted: boolean;
  inherited: boolean;
}

export interface GroupedModule {
  id: string;
  name: string;
  groups: { id: string; label: string; permissions: GroupedPermission[] }[];
}

// GET /api/roles/:id does not select `rank`, so RoleDetail is built from the
// role's shared fields directly rather than extending RoleBase.
export interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_system: boolean;
  grants_all: boolean;
  is_default: boolean;
  max_members: number | null;
  members: { id: string; name: string; email: string }[];
  modules: GroupedModule[];
  inheritance: { parents: string[]; children: string[] };
}

export async function listRoles(token: string): Promise<{ data: RoleSummary[]; error: null }> {
  return apiFetch('/api/roles', { token });
}

export async function getRole(token: string, id: string): Promise<{ data: RoleDetail; error: null }> {
  return apiFetch(`/api/roles/${id}`, { token });
}

export async function createRole(
  token: string,
  body: { name: string; description?: string; color?: string; copyDefaults?: boolean },
): Promise<{ data: RoleBase; error: null }> {
  return apiFetch('/api/roles', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateRole(
  token: string,
  id: string,
  body: { name?: string; description?: string | null; color?: string; max_members?: number | null },
): Promise<{ data: RoleBase; error: null }> {
  return apiFetch(`/api/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function deleteRole(token: string, id: string): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/roles/${id}`, { method: 'DELETE', token });
}

export async function setRolePermissions(
  token: string,
  id: string,
  body: { permissions: string[] } | { permission: string; granted: boolean },
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify(body), token });
}

export async function addRoleMember(token: string, id: string, userId: string): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/roles/${id}/members`, { method: 'POST', body: JSON.stringify({ userId }), token });
}

export async function removeRoleMember(
  token: string,
  id: string,
  userId: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/roles/${id}/members/${userId}`, { method: 'DELETE', token });
}

export async function addInheritance(
  token: string,
  id: string,
  childRoleId: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/roles/${id}/inherit`, { method: 'POST', body: JSON.stringify({ childRoleId }), token });
}

export async function removeInheritance(
  token: string,
  id: string,
  childId: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/roles/${id}/inherit/${childId}`, { method: 'DELETE', token });
}

export async function getUserRoles(
  token: string,
  userId: string,
): Promise<{ data: { roleIds: string[]; isAdmin: boolean; modules: GroupedModule[] }; error: null }> {
  return apiFetch(`/api/users/${userId}/roles`, { token });
}

export async function setUserRoles(
  token: string,
  userId: string,
  roleIds: string[],
): Promise<{ data: { roleIds: string[] }; error: null }> {
  return apiFetch(`/api/users/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds }), token });
}

export interface ConstraintSet {
  id: string;
  name: string;
  cardinality: number;
  roleIds: string[];
}

export async function listSsdSets(token: string): Promise<{ data: ConstraintSet[]; error: null }> {
  return apiFetch('/api/rbac/ssd-sets', { token });
}

export async function createSsdSet(
  token: string,
  body: { name: string; cardinality: number; roleIds: string[] },
): Promise<{ data: ConstraintSet; error: null }> {
  return apiFetch('/api/rbac/ssd-sets', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateSsdSet(
  token: string,
  id: string,
  body: { name?: string; cardinality?: number; roleIds?: string[] },
): Promise<{ data: ConstraintSet; error: null }> {
  return apiFetch(`/api/rbac/ssd-sets/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function deleteSsdSet(token: string, id: string): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/rbac/ssd-sets/${id}`, { method: 'DELETE', token });
}

export async function listDsdSets(token: string): Promise<{ data: ConstraintSet[]; error: null }> {
  return apiFetch('/api/rbac/dsd-sets', { token });
}

export async function createDsdSet(
  token: string,
  body: { name: string; cardinality: number; roleIds: string[] },
): Promise<{ data: ConstraintSet; error: null }> {
  return apiFetch('/api/rbac/dsd-sets', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateDsdSet(
  token: string,
  id: string,
  body: { name?: string; cardinality?: number; roleIds?: string[] },
): Promise<{ data: ConstraintSet; error: null }> {
  return apiFetch(`/api/rbac/dsd-sets/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function deleteDsdSet(token: string, id: string): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/rbac/dsd-sets/${id}`, { method: 'DELETE', token });
}

export interface DiscardedGrant {
  id: string;
  workspace_id: string;
  user_id: string;
  permission: string;
  discarded_at: string;
}

// GET /api/rbac/discarded-grants — per-user permission overrides discarded by the
// groups->roles migration (packages/db/migrations/20260714_001_rbac3.ts step 8).
export async function getDiscardedGrants(token: string): Promise<{ data: DiscardedGrant[]; error: null }> {
  return apiFetch('/api/rbac/discarded-grants', { token });
}

export async function getActiveRoles(
  token: string,
): Promise<{ data: { assigned: { id: string; name: string; active: boolean }[] }; error: null }> {
  return apiFetch('/api/me/active-roles', { token });
}

export async function setActiveRoles(
  token: string,
  roleIds: string[],
): Promise<{ data: { active: string[] }; error: null }> {
  return apiFetch('/api/me/active-roles', { method: 'PUT', body: JSON.stringify({ roleIds }), token });
}
