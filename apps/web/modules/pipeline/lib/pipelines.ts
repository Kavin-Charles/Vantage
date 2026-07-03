// apps/web/modules/pipeline/lib/pipelines.ts
const API = '/api';

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  position: number;
}

export interface PipelineField {
  id: string;
  pipeline_id: string;
  label: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'user' | 'checkbox' | 'url';
  options: { label: string; value: string }[] | null;
  position: number;
  required: boolean;
}

export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  position: number;
  view?: 'kanban' | 'table' | 'list';
  stages: PipelineStage[];
  fields: PipelineField[];
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

export const listPipelines = (token: string) =>
  apiFetch<Pipeline[]>(token, '/pipelines');

export const getPipeline = (token: string, id: string) =>
  apiFetch<Pipeline>(token, `/pipelines/${id}`);

export const createPipeline = (token: string, body: { name: string }) =>
  apiFetch<Pipeline>(token, '/pipelines', { method: 'POST', body: JSON.stringify(body) });

export const deletePipeline = (token: string, id: string) =>
  apiFetch<{ id: string }>(token, `/pipelines/${id}`, { method: 'DELETE' });

export const updatePipeline = (
  token: string,
  id: string,
  body: { name?: string; description?: string; is_default?: boolean },
) =>
  apiFetch<Pipeline>(token, `/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const createStage = (
  token: string,
  pipelineId: string,
  body: { name: string; color: string; is_won?: boolean; is_lost?: boolean },
) =>
  apiFetch<PipelineStage>(token, `/pipelines/${pipelineId}/stages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateStage = (
  token: string,
  pipelineId: string,
  stageId: string,
  body: Partial<PipelineStage>,
) =>
  apiFetch<PipelineStage>(token, `/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteStage = (token: string, pipelineId: string, stageId: string) =>
  apiFetch<{ id: string }>(token, `/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'DELETE',
  });

export const reorderStages = (token: string, pipelineId: string, ids: string[]) =>
  apiFetch<{ reordered: number }>(token, `/pipelines/${pipelineId}/stages/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });

export const createField = (
  token: string,
  pipelineId: string,
  body: Omit<PipelineField, 'id' | 'pipeline_id'>,
) =>
  apiFetch<PipelineField>(token, `/pipelines/${pipelineId}/fields`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateField = (
  token: string,
  pipelineId: string,
  fieldId: string,
  body: Partial<PipelineField>,
) =>
  apiFetch<PipelineField>(token, `/pipelines/${pipelineId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteField = (token: string, pipelineId: string, fieldId: string) =>
  apiFetch<{ id: string }>(token, `/pipelines/${pipelineId}/fields/${fieldId}`, {
    method: 'DELETE',
  });

export const reorderFields = (token: string, pipelineId: string, ids: string[]) =>
  apiFetch<{ reordered: number }>(token, `/pipelines/${pipelineId}/fields/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
