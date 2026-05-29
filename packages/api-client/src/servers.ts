import { apiFetch } from './core';
import type { Server } from '@vantage/types';

export async function listServers(token: string): Promise<{ data: Server[] }> {
  return apiFetch<{ data: Server[] }>('/api/servers', { token });
}

export async function getServer(token: string, id: string): Promise<{ data: Server }> {
  return apiFetch<{ data: Server }>(`/api/servers/${id}`, { token });
}
