import { apiFetch } from './api';
import type { ApiKey } from '@vantage/types';

export async function listApiKeys(token: string) {
  return apiFetch<{ data: ApiKey[]; error: null }>('/api/api-keys', { token });
}

export async function createApiKey(
  token: string,
  body: { name: string; scope: 'read' | 'read_write' },
) {
  return apiFetch<{ data: ApiKey & { key: string }; error: null }>('/api/api-keys', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteApiKey(token: string, id: string) {
  return apiFetch<{ data: { id: string }; error: null }>(`/api/api-keys/${id}`, {
    method: 'DELETE',
    token,
  });
}
