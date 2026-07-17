import { apiFetch } from '@/modules/shared/lib/api';
import type { Server, MetricsSnapshot, MetricsSeries, MetricsRange, Alert } from '@vencore/types';

export async function getServerMetrics(token: string, id: string, range: MetricsRange) {
  return apiFetch<{ data: MetricsSeries; error: null }>(`/api/servers/${id}/metrics?range=${range}`, { token });
}

export interface ThresholdValues { cpu_pct: number; mem_pct: number; disk_pct: number }
export interface ServerThresholds {
  override: (ThresholdValues & { server_id: string }) | null;
  default: ThresholdValues;
  effective: ThresholdValues;
}

export async function getServerThresholds(token: string, id: string) {
  return apiFetch<{ data: ServerThresholds; error: null }>(`/api/servers/${id}/thresholds`, { token });
}

export async function setServerThresholds(token: string, id: string, body: ThresholdValues) {
  return apiFetch<{ data: ThresholdValues; error: null }>(`/api/servers/${id}/thresholds`, {
    method: 'PUT', body: JSON.stringify(body), token,
  });
}

export async function clearServerThresholds(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/servers/${id}/thresholds`, {
    method: 'DELETE', token,
  });
}

export async function listServerAlerts(token: string, id: string) {
  return apiFetch<{ data: Alert[]; total: number; error: null }>(
    `/api/alerts?resource_type=server&resource_id=${id}&limit=50`, { token },
  );
}

export async function resolveAlert(token: string, alertId: string) {
  return apiFetch<{ data: Alert; error: null }>(`/api/alerts/${alertId}/resolve`, { method: 'PATCH', token });
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
