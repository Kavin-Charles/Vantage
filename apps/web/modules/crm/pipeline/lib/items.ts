// apps/web/modules/pipeline/lib/items.ts
const API = '/api';

export interface PipelineItem {
  id: string;
  pipeline_id: string;
  stage_id: string;
  workspace_id: string;
  position: number;
  field_values: Record<string, unknown>;
  contact_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityEntry {
  id: string;
  item_id: string;
  user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

async function apiFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed');
  return json.data as T;
}

export const listItems = (
  token: string,
  pipelineId: string,
  params?: { stage_id?: string },
) => {
  const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<PipelineItem[]>(token, `/pipelines/${pipelineId}/items${qs ? `?${qs}` : ''}`);
};

export const createItem = (
  token: string,
  pipelineId: string,
  body: {
    stage_id: string;
    field_values: Record<string, unknown>;
    contact_id?: string | null;
    company_id?: string | null;
  },
) =>
  apiFetch<PipelineItem>(token, `/pipelines/${pipelineId}/items`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getItem = (token: string, id: string) =>
  apiFetch<PipelineItem>(token, `/items/${id}`);

export const updateItem = (
  token: string,
  id: string,
  body: {
    stage_id?: string;
    field_values?: Record<string, unknown>;
    contact_id?: string | null;
    company_id?: string | null;
  },
) =>
  apiFetch<PipelineItem>(token, `/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const moveItem = (
  token: string,
  id: string,
  body: { stage_id: string; position: number },
) =>
  apiFetch<{ id: string; stage_id: string; position: number }>(token, `/items/${id}/move`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteItem = (token: string, id: string) =>
  apiFetch<{ id: string }>(token, `/items/${id}`, { method: 'DELETE' });

export const getItemActivity = (token: string, id: string) =>
  apiFetch<ActivityEntry[]>(token, `/items/${id}/activity`);
