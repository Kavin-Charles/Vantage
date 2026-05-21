// apps/web/lib/conversions.ts

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await res.json()) as { data: T; error: { message: string } | null };
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed');
  return json.data;
}

export interface ConversionTemplate {
  id: string;
  workspace_id: string;
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  position: number;
  created_at: string;
}

export interface EnrichedFieldMapping {
  id: string;
  template_id: string;
  source_field_id: string | null;
  source_builtin: string | null;
  target_field_id: string | null;
  target_builtin: string | null;
  source_field_label: string | null;
  target_field_label: string | null;
  target_field_type: string | null;
  target_field_options: unknown;
  target_field_required: boolean;
}

export interface ConversionTemplateWithMappings extends ConversionTemplate {
  field_mappings: EnrichedFieldMapping[];
}

export interface EnrichedConversion {
  id: string;
  source_record_id: string;
  target_record_id: string;
  template_id: string;
  converted_by: string;
  converted_at: string;
  source_record_name: string | null;
  source_record_number: string | null;
  target_record_name: string | null;
  target_record_number: string | null;
}

export interface RawFieldMapping {
  source_field_id?: string | null;
  source_builtin?: string | null;
  target_field_id?: string | null;
  target_builtin?: string | null;
}

export interface CreateTemplateBody {
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  field_mappings: RawFieldMapping[];
}

export function listTemplates(params?: { source_type_id?: string }): Promise<ConversionTemplate[]> {
  const qs = params?.source_type_id ? `?source_type_id=${encodeURIComponent(params.source_type_id)}` : '';
  return apiFetch(`/templates${qs}`);
}

export function getTemplate(id: string): Promise<ConversionTemplateWithMappings> {
  return apiFetch(`/templates/${id}`);
}

export function createTemplate(body: CreateTemplateBody): Promise<ConversionTemplate> {
  return apiFetch('/templates', { method: 'POST', body: JSON.stringify(body) });
}

export function updateTemplate(id: string, body: CreateTemplateBody): Promise<ConversionTemplate> {
  return apiFetch(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/templates/${id}`, { method: 'DELETE' });
}

export function convertRecord(
  recordId: string,
  body: { template_id: string; field_overrides?: Record<string, unknown> },
): Promise<{ record_id: string }> {
  return apiFetch(`/records/${recordId}/convert`, { method: 'POST', body: JSON.stringify(body) });
}

export function getRecordConversions(recordId: string): Promise<EnrichedConversion[]> {
  return apiFetch(`/records/${recordId}/conversions`);
}
