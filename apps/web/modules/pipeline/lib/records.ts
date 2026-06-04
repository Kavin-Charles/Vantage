import { apiFetch } from '@/modules/shared/lib/api';
import type { PipelineRecordWithValues, PipelineRecord } from '@vencore/types';

export function listRecords(token: string, params: {
  pipeline_id?: string; stage_id?: string; record_type_id?: string;
  owner_id?: string; contact_id?: string; company_id?: string;
  q?: string; page?: number; per_page?: number;
}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
  return apiFetch<{ data: PipelineRecordWithValues[]; page: number; per_page: number }>(
    `/api/records?${qs}`, { token }
  );
}

export function getRecord(token: string, id: string) {
  return apiFetch<{ data: PipelineRecordWithValues }>(`/api/records/${id}`, { token });
}

export function createRecord(token: string, body: {
  record_type_id: string; pipeline_id: string; stage_id: string;
  name: string; owner_id: string; contact_id?: string; company_id?: string;
  field_values?: Record<string, unknown>;
}) {
  return apiFetch<{ data: PipelineRecordWithValues }>('/api/records', {
    method: 'POST', body: JSON.stringify(body), token,
  });
}

export function updateRecord(token: string, id: string, body: Partial<{
  name: string; stage_id: string; owner_id: string;
  contact_id: string | null; company_id: string | null;
  field_values: Record<string, unknown>;
}>) {
  return apiFetch<{ data: PipelineRecordWithValues }>(`/api/records/${id}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}

export function deleteRecord(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/records/${id}`, { method: 'DELETE', token });
}

export function convertRecord(token: string, id: string, body: {
  template_id: string; field_overrides?: Record<string, unknown>;
}) {
  return apiFetch<{ data: { source: PipelineRecord; target: PipelineRecordWithValues } }>(
    `/api/records/${id}/convert`,
    { method: 'POST', body: JSON.stringify(body), token }
  );
}
