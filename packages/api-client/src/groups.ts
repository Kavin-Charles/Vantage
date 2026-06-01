import { apiFetch } from './core';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  member_count: string | number;
  created_at: string;
}

export interface GroupDetail extends Omit<Group, 'member_count'> {
  updated_at: string;
  members: { id: string; name: string; email: string; role: string; joined_at: string }[];
  permissions: { permission: string; granted: boolean }[];
}

export interface GroupsResponse { data: Group[]; error: null }
export interface GroupDetailResponse { data: GroupDetail; error: null }

export async function listGroups(token: string): Promise<GroupsResponse> {
  return apiFetch('/api/groups', { token });
}

export async function getGroup(token: string, id: string): Promise<GroupDetailResponse> {
  return apiFetch(`/api/groups/${id}`, { token });
}

export async function createGroup(
  token: string,
  body: { name: string; description?: string; color?: string },
): Promise<{ data: Group; error: null }> {
  return apiFetch('/api/groups', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateGroup(
  token: string,
  id: string,
  body: { name?: string; description?: string; color?: string },
): Promise<{ data: Group; error: null }> {
  return apiFetch(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function deleteGroup(token: string, id: string): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/groups/${id}`, { method: 'DELETE', token });
}

export async function addGroupMember(
  token: string,
  groupId: string,
  userId: string,
): Promise<{ data: { groupId: string; userId: string }; error: null }> {
  return apiFetch(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }), token });
}

export async function removeGroupMember(
  token: string,
  groupId: string,
  userId: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE', token });
}

export async function setGroupPermission(
  token: string,
  groupId: string,
  permission: string,
  granted: boolean,
): Promise<{ data: { permission: string; granted: boolean }; error: null }> {
  return apiFetch(`/api/groups/${groupId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permission, granted }),
    token,
  });
}

export async function deleteGroupPermission(
  token: string,
  groupId: string,
  permission: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/groups/${groupId}/permissions/${encodeURIComponent(permission)}`, {
    method: 'DELETE',
    token,
  });
}
