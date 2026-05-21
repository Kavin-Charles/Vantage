import { apiFetch } from './api';
import type { Pipeline, PipelineWithStages, PipelineStage, StageField } from '@vantage/types';

// Pipelines
export async function listPipelines(token: string) {
  return apiFetch<{ data: Pipeline[] }>('/api/pipelines', { token });
}

export async function getPipeline(token: string, id: string) {
  return apiFetch<{ data: PipelineWithStages }>(`/api/pipelines/${id}`, { token });
}

export async function createPipeline(token: string, body: { name: string }) {
  return apiFetch<{ data: Pipeline }>('/api/pipelines', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updatePipeline(
  token: string,
  id: string,
  body: { name?: string; is_default?: boolean; view?: string; table_columns?: string[] | null; record_type_id?: string | null },
) {
  return apiFetch<{ data: Pipeline }>(`/api/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deletePipeline(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${id}`, { method: 'DELETE', token });
}

// Stages
export async function createStage(token: string, pipelineId: string, body: { name: string; color?: string }) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateStage(
  token: string,
  pipelineId: string,
  stageId: string,
  body: { name?: string; color?: string; is_won?: boolean; is_lost?: boolean },
) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteStage(token: string, pipelineId: string, stageId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'DELETE',
    token,
  });
}

export async function reorderStages(token: string, pipelineId: string, orderedIds: string[]) {
  return apiFetch<{ data: PipelineStage[] }>(`/api/pipelines/${pipelineId}/stages/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids: orderedIds }),
    token,
  });
}

// Stage fields
export async function createField(
  token: string,
  stageId: string,
  body: { name: string; field_type: string; options?: string[]; is_required?: boolean; position?: number },
) {
  return apiFetch<{ data: StageField }>(`/api/stages/${stageId}/fields`, {
    method: 'POST',
    body: JSON.stringify({ position: 0, ...body }),
    token,
  });
}

export async function updateField(
  token: string,
  stageId: string,
  fieldId: string,
  body: { name?: string; field_type?: string; options?: string[]; is_required?: boolean; position?: number },
) {
  return apiFetch<{ data: StageField }>(`/api/stages/${stageId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteField(token: string, stageId: string, fieldId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/stages/${stageId}/fields/${fieldId}`, {
    method: 'DELETE',
    token,
  });
}

export async function reorderFields(token: string, stageId: string, orderedIds: string[]) {
  return apiFetch<{ data: StageField[] }>(`/api/stages/${stageId}/fields/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids: orderedIds }),
    token,
  });
}
