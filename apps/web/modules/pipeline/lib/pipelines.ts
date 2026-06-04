import { apiFetch } from '@/modules/shared/lib/api';
import type { Pipeline, PipelineWithDetails, PipelineStage } from '@vencore/types';

export function listPipelines(token: string) {
  return apiFetch<{ data: PipelineWithDetails[] }>('/api/pipelines', { token });
}

export function getPipeline(token: string, id: string) {
  return apiFetch<{ data: PipelineWithDetails }>(`/api/pipelines/${id}`, { token });
}

export function createPipeline(token: string, body: { name: string; record_type_id: string; view?: string }) {
  return apiFetch<{ data: Pipeline }>('/api/pipelines', {
    method: 'POST', body: JSON.stringify(body), token,
  });
}

export function updatePipeline(token: string, id: string, body: Partial<{
  name: string; view: string; table_columns: string[] | null; is_default: boolean;
}>) {
  return apiFetch<{ data: Pipeline }>(`/api/pipelines/${id}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}

export function deletePipeline(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${id}`, { method: 'DELETE', token });
}

export function addStage(token: string, pipelineId: string, body: {
  name: string; color?: string; is_won?: boolean; is_lost?: boolean; position?: number;
}) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages`, {
    method: 'POST', body: JSON.stringify(body), token,
  });
}

export function updateStage(token: string, pipelineId: string, stageId: string, body: Partial<{
  name: string; color: string; is_won: boolean; is_lost: boolean; position: number;
}>) {
  return apiFetch<{ data: PipelineStage }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}

export function deleteStage(token: string, pipelineId: string, stageId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'DELETE', token,
  });
}

export function reorderStages(token: string, pipelineId: string, ids: string[]) {
  return apiFetch<{ data: { ids: string[] } }>(`/api/pipelines/${pipelineId}/stages/reorder`, {
    method: 'PATCH', body: JSON.stringify({ ids }), token,
  });
}
