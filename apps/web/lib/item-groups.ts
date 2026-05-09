// apps/web/lib/item-groups.ts
import { apiFetch } from './api';
import type { ItemGroup, ItemGroupWithStages, GroupStage, ItemField, Item } from '@vantage/types';

// Item groups
export async function listItemGroups(pipelineId: string) {
  return apiFetch<{ data: (ItemGroup & { stages: GroupStage[]; fields: ItemField[] })[] }>(
    `/api/item-groups?pipeline_id=${pipelineId}`,
  );
}

export async function getItemGroup(id: string) {
  return apiFetch<{ data: ItemGroupWithStages }>(`/api/item-groups/${id}`);
}

export async function createItemGroup(body: { pipeline_id: string; name: string; color?: string }) {
  return apiFetch<{ data: ItemGroup }>('/api/item-groups', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateItemGroup(id: string, body: { name?: string; color?: string; position?: number }) {
  return apiFetch<{ data: ItemGroup }>(`/api/item-groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteItemGroup(id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/item-groups/${id}`, { method: 'DELETE' });
}

// Stages
export async function createGroupStage(groupId: string, body: { name: string; color?: string }) {
  return apiFetch<{ data: GroupStage }>(`/api/item-groups/${groupId}/stages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateGroupStage(groupId: string, stageId: string, body: { name?: string; color?: string }) {
  return apiFetch<{ data: GroupStage }>(`/api/item-groups/${groupId}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteGroupStage(groupId: string, stageId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/item-groups/${groupId}/stages/${stageId}`, {
    method: 'DELETE',
  });
}

export async function reorderGroupStages(groupId: string, ids: string[]) {
  return apiFetch<{ data: { reordered: number } }>(`/api/item-groups/${groupId}/stages/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

// Fields
export async function createItemField(groupId: string, body: { label: string; field_type: string; required?: boolean; options?: string[] }) {
  return apiFetch<{ data: ItemField }>(`/api/item-groups/${groupId}/fields`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateItemField(groupId: string, fieldId: string, body: { label?: string; required?: boolean; options?: string[] }) {
  return apiFetch<{ data: ItemField }>(`/api/item-groups/${groupId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteItemField(groupId: string, fieldId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/item-groups/${groupId}/fields/${fieldId}`, {
    method: 'DELETE',
  });
}

// Items
export async function listItems(groupId: string) {
  return apiFetch<{ data: Item[] }>(`/api/items?group_id=${groupId}`);
}

export async function createItem(body: {
  group_id: string;
  stage_id: string;
  title: string;
  value?: number;
  contact_id?: string;
  company_id?: string;
}) {
  return apiFetch<{ data: Item }>('/api/items', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateItem(id: string, body: {
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
  });
}

export async function deleteItem(id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/items/${id}`, { method: 'DELETE' });
}

export async function convertItem(id: string, targetGroupId: string) {
  return apiFetch<{ data: Item }>(`/api/items/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify({ target_group_id: targetGroupId }),
  });
}
