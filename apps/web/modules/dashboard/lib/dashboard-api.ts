import { apiFetch } from '@/modules/shared/lib/api';

export interface DashboardSummary {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LayoutWidget {
  id: string;
  dashboard_id: string;
  widget_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  min_w: number | null;
  min_h: number | null;
  permission_key: string | null;
}

export interface DashboardDetail extends DashboardSummary {
  layout: LayoutWidget[];
  group_ids: string[];
}

export interface SaveLayoutWidget {
  widget_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  min_w?: number | null;
  min_h?: number | null;
  permission_key?: string | null;
}

export async function listDashboards(token: string): Promise<DashboardSummary[]> {
  const res = await apiFetch<{ data: DashboardSummary[]; error: null }>('/api/dashboards', { token });
  return res.data ?? [];
}

export async function getDashboard(id: string, token: string): Promise<DashboardDetail> {
  const res = await apiFetch<{ data: DashboardDetail; error: null }>(`/api/dashboards/${id}`, { token });
  return res.data;
}

export async function createDashboard(name: string, token: string): Promise<DashboardSummary> {
  const res = await apiFetch<{ data: DashboardSummary; error: null }>('/api/dashboards', {
    method: 'POST',
    body: JSON.stringify({ name }),
    token,
  });
  return res.data;
}

export async function renameDashboard(id: string, name: string, token: string): Promise<void> {
  await apiFetch<{ data: null; error: null }>(`/api/dashboards/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
    token,
  });
}

export async function deleteDashboard(id: string, token: string): Promise<void> {
  await apiFetch<{ data: null; error: null }>(`/api/dashboards/${id}`, { method: 'DELETE', token });
}

export async function saveLayout(id: string, widgets: SaveLayoutWidget[], token: string): Promise<void> {
  await apiFetch<{ data: null; error: null }>(`/api/dashboards/${id}/layout`, {
    method: 'PUT',
    body: JSON.stringify({ widgets }),
    token,
  });
}

export async function assignGroups(id: string, group_ids: string[], token: string): Promise<void> {
  await apiFetch<{ data: null; error: null }>(`/api/dashboards/${id}/groups`, {
    method: 'PUT',
    body: JSON.stringify({ group_ids }),
    token,
  });
}
