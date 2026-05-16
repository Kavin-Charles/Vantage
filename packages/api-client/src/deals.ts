import { apiFetch } from './core';
import type { Deal } from '@vantage/types';

export async function listDeals(pipelineId: string, token?: string) {
  return apiFetch<{ data: Deal[] }>(
    `/api/deals?pipeline_id=${pipelineId}&per_page=500`,
    token ? { token } : {},
  );
}

export async function getDeal(id: string, token?: string) {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`, token ? { token } : {});
}

export async function createDeal(
  body: {
    name: string;
    value?: number;
    pipeline_id: string;
    stage_id: string;
    probability?: number;
    close_date?: string;
    contact_id?: string;
    company_id?: string;
    field_values?: Record<string, string>;
  },
  token?: string,
) {
  return apiFetch<{ data: Deal }>('/api/deals', {
    method: 'POST',
    body: JSON.stringify(body),
    ...(token ? { token } : {}),
  });
}

export async function updateDeal(
  id: string,
  body: {
    name?: string;
    value?: number;
    stage_id?: string;
    probability?: number;
    close_date?: string;
    field_values?: Record<string, string>;
  },
  token?: string,
) {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    ...(token ? { token } : {}),
  });
}

export async function deleteDeal(id: string, token?: string) {
  return apiFetch<{ data: { id: string } }>(`/api/deals/${id}`, {
    method: 'DELETE',
    ...(token ? { token } : {}),
  });
}
