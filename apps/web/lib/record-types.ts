import { apiFetch } from './api';
import type {
  RecordType,
  RecordTypeField,
  ConversionTemplateWithMappings,
  ConversionTemplate,
  ConversionFieldMapping,
} from '@vantage/types';

export function listRecordTypes(token: string) {
  return apiFetch<{ data: RecordType[] }>('/api/record-types', { token });
}

export function createRecordType(token: string, body: {
  name: string; icon?: string; description?: string;
  auto_number_enabled?: boolean; auto_number_prefix?: string;
}) {
  return apiFetch<{ data: RecordType }>('/api/record-types', {
    method: 'POST', body: JSON.stringify(body), token,
  });
}

export function updateRecordType(token: string, id: string, body: Partial<{
  name: string; icon: string; description: string;
  auto_number_enabled: boolean; auto_number_prefix: string; position: number;
}>) {
  return apiFetch<{ data: RecordType }>(`/api/record-types/${id}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}

export function deleteRecordType(token: string, id: string) {
  return apiFetch<{ data: { id: string } }>(`/api/record-types/${id}`, { method: 'DELETE', token });
}

export function listFields(token: string, typeId: string) {
  return apiFetch<{ data: RecordTypeField[] }>(`/api/record-types/${typeId}/fields`, { token });
}

export function addField(token: string, typeId: string, body: {
  label: string; field_type: string; is_required?: boolean;
  options?: { label: string; value: string }[]; position?: number;
}) {
  return apiFetch<{ data: RecordTypeField }>(`/api/record-types/${typeId}/fields`, {
    method: 'POST', body: JSON.stringify(body), token,
  });
}

export function updateField(token: string, typeId: string, fieldId: string, body: Partial<{
  label: string; is_required: boolean; options: { label: string; value: string }[]; position: number;
}>) {
  return apiFetch<{ data: RecordTypeField }>(`/api/record-types/${typeId}/fields/${fieldId}`, {
    method: 'PATCH', body: JSON.stringify(body), token,
  });
}

export function deleteField(token: string, typeId: string, fieldId: string) {
  return apiFetch<{ data: { id: string } }>(`/api/record-types/${typeId}/fields/${fieldId}`, {
    method: 'DELETE', token,
  });
}

export function reorderFields(token: string, typeId: string, ids: string[]) {
  return apiFetch<{ data: { ids: string[] } }>(`/api/record-types/${typeId}/fields/reorder`, {
    method: 'PATCH', body: JSON.stringify({ ids }), token,
  });
}

export function listConversions(token: string, typeId: string) {
  return apiFetch<{ data: ConversionTemplateWithMappings[] }>(
    `/api/record-types/${typeId}/conversions`, { token }
  );
}

export function createConversion(token: string, typeId: string, body: {
  name: string; target_type_id: string; target_pipeline_id: string; target_stage_id: string;
  field_mappings: Partial<ConversionFieldMapping>[];
}) {
  return apiFetch<{ data: ConversionTemplateWithMappings }>(
    `/api/record-types/${typeId}/conversions`,
    { method: 'POST', body: JSON.stringify(body), token }
  );
}

export function updateConversion(token: string, typeId: string, tid: string, body: Partial<{
  name: string; target_pipeline_id: string; target_stage_id: string;
  field_mappings: Partial<ConversionFieldMapping>[];
}>) {
  return apiFetch<{ data: ConversionTemplate }>(
    `/api/record-types/${typeId}/conversions/${tid}`,
    { method: 'PATCH', body: JSON.stringify(body), token }
  );
}

export function deleteConversion(token: string, typeId: string, tid: string) {
  return apiFetch<{ data: { id: string } }>(
    `/api/record-types/${typeId}/conversions/${tid}`,
    { method: 'DELETE', token }
  );
}
