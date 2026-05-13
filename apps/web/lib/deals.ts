import { apiFetch } from './api';
import type { Deal } from '@vantage/types';

export async function listDeals(pipelineId: string) {
  return apiFetch<{ data: Deal[] }>(`/api/deals?pipeline_id=${pipelineId}&per_page=500`);
}

export async function getDeal(id: string) {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`);
}

export async function createDeal(body: {
  name: string;
  value?: number;
  pipeline_id: string;
  stage_id: string;
  probability?: number;
  close_date?: string;
  contact_id?: string;
  company_id?: string;
  field_values?: Record<string, string>;
}) {
  return apiFetch<{ data: Deal }>('/api/deals', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateDeal(id: string, body: {
  name?: string;
  value?: number;
  stage_id?: string;
  probability?: number;
  close_date?: string;
  field_values?: Record<string, string>;
}) {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteDeal(id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/deals/${id}`, { method: 'DELETE' });
}
