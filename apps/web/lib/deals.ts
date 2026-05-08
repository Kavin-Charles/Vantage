import { apiFetch } from './api';
import type { Deal } from '@vantage/types';

export async function listDeals(token: string) {
  return apiFetch<{ data: Deal[]; error: null }>('/api/deals?per_page=100', { token });
}

export async function createDeal(token: string, body: Omit<Partial<Deal>, 'close_date'> & { close_date?: string }) {
  return apiFetch<{ data: Deal; error: null }>('/api/deals', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateDeal(token: string, id: string, body: Omit<Partial<Deal>, 'close_date'> & { close_date?: string }) {
  return apiFetch<{ data: Deal; error: null }>(`/api/deals/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}
