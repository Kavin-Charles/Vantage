import { apiFetch } from './api';
import type { Pipeline, PipelineWithStages, PipelineStage, StageField } from '@vantage/types';

// Pipelines
export async function listPipelines() {
  return apiFetch<{ data: Pipeline[] }>('/api/pipelines');
}

export async function getPipeline(id: string) {
  return apiFetch<{ data: PipelineWithStages }>(`/api/pipelines/${id}`);
}

export async function createPipeline(body: { name: string }) {
  return apiFetch<{ data: Pipeline }>('/api/pipelines', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updatePipeline(id: string, body: { name?: string; is_default?: boolean }) {
  return apiFetch<{ data: Pipeline }>(`/api/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deletePipeline(id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${id}`, { method: 'DELETE' });
}

// Stages
export async function createStage(pipelineId: string, body: { name: string; color?: string }) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateStage(pipelineId: string, stageId: string, body: {
  name?: string;
  color?: string;
  is_won?: boolean;
  is_lost?: boolean;
}) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteStage(pipelineId: string, stageId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'DELETE',
  });
}

export async function reorderStages(pipelineId: string, orderedIds: string[]) {
  return apiFetch<{ data: PipelineStage[] }>(`/api/pipelines/${pipelineId}/stages/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

// Stage fields
export async function createField(stageId: string, body: {
  label: string;
  field_type: string;
  options?: string[];
  required?: boolean;
}) {
  return apiFetch<{ data: StageField }>(`/api/stages/${stageId}/fields`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateField(stageId: string, fieldId: string, body: {
  label?: string;
  options?: string[];
  required?: boolean;
}) {
  return apiFetch<{ data: StageField }>(`/api/stages/${stageId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteField(stageId: string, fieldId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/stages/${stageId}/fields/${fieldId}`, {
    method: 'DELETE',
  });
}

export async function reorderFields(stageId: string, orderedIds: string[]) {
  return apiFetch<{ data: StageField[] }>(`/api/stages/${stageId}/fields/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}
