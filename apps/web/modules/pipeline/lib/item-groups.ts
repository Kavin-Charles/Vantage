// apps/web/lib/item-groups.ts
import { apiFetch } from './api';
import type { ItemGroup, ItemGroupWithStages, GroupStage, ItemField, Item } from '@vantage/types';

// Item groups
export async function listItemGroups(token: string, pipelineId: string) {
  return apiFetch<{ data: (ItemGroup & { stages: GroupStage[]; fields: ItemField[] })[] }>(
    `/api/item-groups?pipeline_id=${pipelineId}`,
    { token },
  );
}

export async function getItemGroup(token: string, id: string) {
  return apiFetch<{ data: ItemGroupWithStages }>(`/api/item-groups/${id}`, { token });
}

export async function createItemGroup(token: string, body: { pipeline_id: string; name: string; color?: string }) {
  return apiFetch<{ data: ItemGroup }>('/api/item-groups', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateItemGroup(token: string, id: string, body: { name?: string; color?: string; position?: number }) {
  return apiFetch<{ data: ItemGroup }>(`/api/item-groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteItemGroup(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/item-groups/${id}`, { method: 'DELETE', token });
}

// Stages
export async function createGroupStage(token: string, groupId: string, body: { name: string; color?: string }) {
  return apiFetch<{ data: GroupStage }>(`/api/item-groups/${groupId}/stages`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateGroupStage(token: string, groupId: string, stageId: string, body: { name?: string; color?: string }) {
  return apiFetch<{ data: GroupStage }>(`/api/item-groups/${groupId}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteGroupStage(token: string, groupId: string, stageId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/item-groups/${groupId}/stages/${stageId}`, {
    method: 'DELETE',
    token,
  });
}

export async function reorderGroupStages(token: string, groupId: string, ids: string[]) {
  return apiFetch<{ data: { reordered: number } }>(`/api/item-groups/${groupId}/stages/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
    token,
  });
}

// Fields
export async function createItemField(token: string, groupId: string, body: { label: string; field_type: string; required?: boolean; options?: string[] }) {
  return apiFetch<{ data: ItemField }>(`/api/item-groups/${groupId}/fields`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateItemField(token: string, groupId: string, fieldId: string, body: { label?: string; required?: boolean; options?: string[] }) {
  return apiFetch<{ data: ItemField }>(`/api/item-groups/${groupId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteItemField(token: string, groupId: string, fieldId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/item-groups/${groupId}/fields/${fieldId}`, {
    method: 'DELETE',
    token,
  });
}

// Items
export async function listItems(token: string, groupId: string) {
  return apiFetch<{ data: Item[] }>(`/api/items?group_id=${groupId}`, { token });
}

export async function createItem(token: string, body: {
  group_id: string;
  stage_id: string;
  title: string;
  value?: number;
  contact_id?: string;
  company_id?: string;
  field_values?: Record<string, string>;
}) {
  return apiFetch<{ data: Item }>('/api/items', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateItem(token: string, id: string, body: {
  title?: string;
  stage_id?: string;
  value?: number | null;
  contact_id?: string | null;
  company_id?: string | null;
  field_values?: Record<string, string>;
}) {
  return apiFetch<{ data: Item }>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteItem(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/items/${id}`, { method: 'DELETE', token });
}

export async function convertItem(token: string, id: string, targetGroupId: string) {
  return apiFetch<{ data: Item }>(`/api/items/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify({ target_group_id: targetGroupId }),
    token,
  });
}
