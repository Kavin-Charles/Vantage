import { apiFetch } from './core';
import type { Alert } from '@vencore/types';

export async function listAlerts(
  token: string,
  params?: { resolved?: boolean; severity?: string },
): Promise<{ data: Alert[]; total: number; error: null }> {
  const qs = new URLSearchParams();
  if (params?.resolved !== undefined) qs.set('resolved', String(params.resolved));
  if (params?.severity) qs.set('severity', params.severity);
  const q = qs.toString();
  return apiFetch<{ data: Alert[]; total: number; error: null }>(
    `/api/alerts${q ? `?${q}` : ''}`,
    { token },
  );
}

export async function acknowledgeAlert(
  token: string,
  id: string,
): Promise<{ data: Alert; error: null }> {
  return apiFetch<{ data: Alert; error: null }>(`/api/alerts/${id}/acknowledge`, {
    method: 'PATCH',
    token,
  });
}

export async function resolveAlert(
  token: string,
  id: string,
): Promise<{ data: Alert; error: null }> {
  return apiFetch<{ data: Alert; error: null }>(`/api/alerts/${id}/resolve`, {
    method: 'PATCH',
    token,
  });
}
