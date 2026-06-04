import { apiFetch } from './core';
import type { PipelineWithDetails, PipelineRecord } from '@vencore/types';

export async function listPipelines(token: string): Promise<{ data: PipelineWithDetails[] }> {
  return apiFetch<{ data: PipelineWithDetails[] }>('/api/pipelines', { token });
}

export async function getDefaultPipeline(token: string): Promise<{ data: PipelineWithDetails }> {
  return apiFetch<{ data: PipelineWithDetails }>('/api/pipelines/default', { token });
}

export async function listPipelineDeals(
  token: string,
  pipelineId: string,
): Promise<{ data: PipelineRecord[] }> {
  return apiFetch<{ data: PipelineRecord[] }>(
    `/api/deals?pipeline_id=${pipelineId}&per_page=200`,
    { token },
  );
}
