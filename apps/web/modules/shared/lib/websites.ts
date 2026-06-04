import { apiFetch } from './api';
import type { Website } from '@vencore/types';

export async function listWebsites(token: string) {
  return apiFetch<{ data: Website[]; total: number; error: null }>('/api/websites', { token });
}

export async function createWebsite(token: string, body: { url: string; label?: string }) {
  return apiFetch<{ data: Website; error: null }>('/api/websites', { method: 'POST', body: JSON.stringify(body), token });
}

export async function deleteWebsite(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/websites/${id}`, { method: 'DELETE', token });
}
