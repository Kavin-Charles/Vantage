import { apiFetch } from '@/modules/shared/lib/api';
import type { Server, MetricsSnapshot, MetricsSeries, MetricsRange } from '@vencore/types';

export async function getServerMetrics(token: string, id: string, range: MetricsRange) {
  return apiFetch<{ data: MetricsSeries; error: null }>(`/api/servers/${id}/metrics?range=${range}`, { token });
}

export async function listServers(token: string) {
  return apiFetch<{ data: Server[]; total: number; error: null }>('/api/servers', { token });
}

export async function createServer(token: string, body: { name: string; region?: string; ip_address?: string }) {
  return apiFetch<{ data: Server & { agent_token: string }; error: null }>('/api/servers', { method: 'POST', body: JSON.stringify(body), token });
}

export async function getServer(token: string, id: string) {
  return apiFetch<{ data: Server & { snapshots: MetricsSnapshot[] }; error: null }>(`/api/servers/${id}`, { token });
}

export async function updateServer(token: string, id: string, body: Partial<{ name: string; region: string; ip_address: string; ssh_port: number }>) {
  return apiFetch<{ data: Server; error: null }>(`/api/servers/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function regenToken(token: string, id: string) {
  return apiFetch<{ data: { agent_token: string }; error: null }>(`/api/servers/${id}/token-regen`, {
    method: 'POST',
    token,
  });
}

export async function deleteServer(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/servers/${id}`, { method: 'DELETE', token });
}
