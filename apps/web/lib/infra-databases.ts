import { apiFetch } from './api';
import type { InfraDatabase } from '@vantage/types';

export async function listInfraDatabases(token: string) {
  return apiFetch<{ data: InfraDatabase[]; total: number; error: null }>('/api/databases', { token });
}

export async function createInfraDatabase(token: string, body: { name: string; engine: string; host?: string; port?: number }) {
  return apiFetch<{ data: InfraDatabase; error: null }>('/api/databases', { method: 'POST', body: JSON.stringify(body), token });
}

export async function deleteInfraDatabase(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/databases/${id}`, { method: 'DELETE', token });
}
