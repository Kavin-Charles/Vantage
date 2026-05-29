import { apiFetch } from './core';
import type { PipelineWithStages, Deal } from '@vantage/types';

export async function listPipelines(token: string): Promise<{ data: PipelineWithStages[] }> {
  return apiFetch<{ data: PipelineWithStages[] }>('/api/pipelines', { token });
}

export async function getDefaultPipeline(token: string): Promise<{ data: PipelineWithStages }> {
  return apiFetch<{ data: PipelineWithStages }>('/api/pipelines/default', { token });
}

export async function listPipelineDeals(
  token: string,
  pipelineId: string,
): Promise<{ data: Deal[] }> {
  return apiFetch<{ data: Deal[] }>(
    `/api/deals?pipeline_id=${pipelineId}&per_page=200`,
    { token },
  );
}
