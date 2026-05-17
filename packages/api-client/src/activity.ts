import { apiFetch } from './core';
import type { Activity } from '@vantage/types';

export async function listActivity(
  token: string,
  params?: {
    contact_id?: string;
    deal_id?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ data: Activity[]; total: number; error: null }> {
  const qs = new URLSearchParams();
  if (params?.contact_id) qs.set('contact_id', params.contact_id);
  if (params?.deal_id) qs.set('deal_id', params.deal_id);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return apiFetch<{ data: Activity[]; total: number; error: null }>(
    `/api/activity${q ? `?${q}` : ''}`,
    { token },
  );
}

export async function createActivity(
  token: string,
  body: { type: Activity['type']; body?: string; contact_id?: string; deal_id?: string },
): Promise<{ data: Activity; error: null }> {
  return apiFetch<{ data: Activity; error: null }>('/api/activity', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}
