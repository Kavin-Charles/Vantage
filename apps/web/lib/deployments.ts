import { apiFetch } from './api';
import type { Deployment } from '@vantage/types';

export interface ListDeploymentsParams {
  name?: string;
  environment?: string;
  status?: string;
  server_id?: string;
  source?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface CreateDeploymentBody {
  name?: string;
  environment?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  source: 'webhook' | 'agent' | 'manual';
  server_id?: string;
  started_at?: string;
  git_commit?: string;
  git_branch?: string;
  git_tag?: string;
  git_message?: string;
  git_author?: string;
  meta?: Record<string, unknown>;
}

export async function listDeployments(token: string, params: ListDeploymentsParams = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<{ data: Deployment[]; total: number; error: null }>(`/api/deployments${query}`, { token });
}

export async function createDeployment(token: string, body: CreateDeploymentBody) {
  return apiFetch<{ data: Deployment; error: null }>('/api/deployments', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function patchDeployment(token: string, id: string, body: { status?: string; finished_at?: string }) {
  return apiFetch<{ data: Deployment; error: null }>(`/api/deployments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteDeployment(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/deployments/${id}`, {
    method: 'DELETE',
    token,
  });
}
