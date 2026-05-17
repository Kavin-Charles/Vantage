import { apiFetch } from './core';
import type { Deal } from '@vantage/types';

export async function listDeals(token: string, pipelineId: string): Promise<{ data: Deal[] }> {
  return apiFetch<{ data: Deal[] }>(
    `/api/deals?pipeline_id=${pipelineId}&per_page=500`,
    { token },
  );
}

export async function getDeal(token: string, id: string): Promise<{ data: Deal }> {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`, { token });
}

export async function createDeal(
  token: string,
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
): Promise<{ data: Deal }> {
  return apiFetch<{ data: Deal }>('/api/deals', {
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
    value?: number;
    stage_id?: string;
    probability?: number;
    close_date?: string;
    field_values?: Record<string, string>;
  },
): Promise<{ data: Deal }> {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteDeal(token: string, id: string): Promise<{ data: { id: string } }> {
  return apiFetch<{ data: { id: string } }>(`/api/deals/${id}`, { method: 'DELETE', token });
}
