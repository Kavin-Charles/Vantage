import { apiFetch } from './core';
import type { PipelineRecord } from '@vencore/types';

export async function listDeals(token: string, pipelineId: string): Promise<{ data: PipelineRecord[] }> {
  return apiFetch<{ data: PipelineRecord[] }>(
    `/api/deals?pipeline_id=${pipelineId}&per_page=500`,
    { token },
  );
}

export async function getDeal(token: string, id: string): Promise<{ data: PipelineRecord }> {
  return apiFetch<{ data: PipelineRecord }>(`/api/deals/${id}`, { token });
}

export async function createDeal(
  token: string,
  body: {
    name: string;
    pipeline_id: string;
    stage_id: string;
    contact_id?: string;
    company_id?: string;
    field_values?: Record<string, string>;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  },
): Promise<{ data: PipelineRecord }> {
  return apiFetch<{ data: PipelineRecord }>('/api/deals', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateDeal(
  token: string,
  id: string,
  body: {
    name?: string;
    stage_id?: string;
    field_values?: Record<string, string>;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  },
): Promise<{ data: PipelineRecord }> {
  return apiFetch<{ data: PipelineRecord }>(`/api/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteDeal(token: string, id: string): Promise<{ data: { id: string } }> {
  return apiFetch<{ data: { id: string } }>(`/api/deals/${id}`, { method: 'DELETE', token });
}
