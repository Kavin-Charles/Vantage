// apps/web/components/pipeline/ConversionModal.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listTemplates,
  getTemplate,
  convertRecord,
  type ConversionTemplate,
  type ConversionTemplateWithMappings,
} from '@/modules/pipeline/lib/conversions';

interface SourceRecord {
  id: string;
  name: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  field_values: { id: string; record_id: string; field_id: string; value: unknown }[];
}

interface RecordTypeField {
  id: string;
  label: string;
  field_type: string;
  options: unknown;
  is_required: boolean;
}

interface Props {
  recordId: string;
  recordTypeId: string;
  onClose: () => void;
  onConverted: (newRecordId: string) => void;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json() as { data: T };
  if (!res.ok) throw new Error((json as unknown as { error: { message: string } }).error?.message ?? 'Failed');
  return json.data;
}

const BUILTIN_LABELS: Record<string, string> = {
  name: 'Name',
  contact_id: 'Contact',
  company_id: 'Company',
  owner_id: 'Owner',
};

const inputStyle = (invalid: boolean): React.CSSProperties => ({
  width: '100%',
  border: `1px solid ${invalid ? '#ef4444' : 'var(--border)'}`,
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'DM Sans, sans-serif',
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text3)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export function ConversionModal({ recordId, recordTypeId, onClose, onConverted }: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Stage 1: list templates
  const { data: templates = [] } = useQuery<ConversionTemplate[]>({
    queryKey: ['conversion-templates', recordTypeId],
    queryFn: () => listTemplates({ source_type_id: recordTypeId }),
  });

  // Stage 2 data — only fetched after template selection
  const { data: templateWithMappings } = useQuery<ConversionTemplateWithMappings>({
    queryKey: ['conversion-template', selectedTemplateId],
    queryFn: () => getTemplate(selectedTemplateId!),
    enabled: !!selectedTemplateId,
  });

  const { data: sourceRecord } = useQuery<SourceRecord>({
    queryKey: ['record-for-convert', recordId],
    queryFn: () => fetchJson(`/records/${recordId}`),
    enabled: !!selectedTemplateId,
  });

  const { data: targetFields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', templateWithMappings?.target_type_id],
    queryFn: () => fetchJson(`/record-types/${templateWithMappings!.target_type_id}/fields`),
    enabled: !!templateWithMappings,
  });

  // Compute pre-fills from template mappings + source record values
  const preFills = useMemo<Record<string, string>>(() => {
    if (!templateWithMappings || !sourceRecord) return {};
    const sourceValueMap = new Map(
      (sourceRecord.field_values ?? []).map(fv => [fv.field_id, String(fv.value ?? '')])
    );
    const result: Record<string, string> = {};

    for (const m of templateWithMappings.field_mappings) {
      if (m.source_builtin && m.target_builtin) {
        const val = (sourceRecord as unknown as Record<string, unknown>)[m.source_builtin];
        if (val != null) result[m.target_builtin] = String(val);
      }
      if (m.source_field_id && m.target_field_id) {
        const val = sourceValueMap.get(m.source_field_id);
        if (val !== undefined) result[m.target_field_id] = val;
      }
      if (m.source_builtin && m.target_field_id) {
        const val = (sourceRecord as unknown as Record<string, unknown>)[m.source_builtin];
        if (val != null) result[m.target_field_id] = String(val);
      }
    }
    if (!result['name']) result['name'] = sourceRecord.name;
    return result;
  }, [templateWithMappings, sourceRecord]);

  // Seed form when preFills first become available
  useEffect(() => {
    if (Object.keys(preFills).length > 0) {
      setFormValues(preFills);
    }
  }, [JSON.stringify(preFills)]); // eslint-disable-line react-hooks/exhaustive-deps

  const convert = useMutation({
    mutationFn: () =>
      convertRecord(recordId, {
        template_id: selectedTemplateId!,
        field_overrides: formValues,
      }),
    onSuccess: data => onConverted(data.record_id),
    onError: (err: Error) => setFormError(err.message),
  });

  function handleSubmit() {
    if (!formValues['name']?.trim()) {
      setFormError('Name is required');
      return;
    }
    const missingRequired = targetFields.filter(
      f => f.is_required && !formValues[f.id]?.trim()
    );
    if (missingRequired.length > 0) {
      setFormError(`Required fields missing: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }
    setFormError(null);
    convert.mutate();
  }

  // Mapped builtin target keys (excluding 'name' which is always shown)
  const mappedBuiltins = templateWithMappings
    ? templateWithMappings.field_mappings
        .filter(m => m.target_builtin && m.target_builtin !== 'name')
        .map(m => m.target_builtin!)
    : [];

  function renderFieldInput(fieldId: string, fieldType: string, options: unknown, required: boolean) {
    const val = formValues[fieldId] ?? '';
    const invalid = required && !val.trim();
    if (fieldType === 'select' && Array.isArray(options)) {
      return (
        <select
          value={val}
          onChange={e => setFormValues(v => ({ ...v, [fieldId]: e.target.value }))}
          style={{ ...inputStyle(invalid), background: '#fff', cursor: 'pointer' }}
        >
          <option value="">— select —</option>
          {(options as string[]).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    const inputType = fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text';
    return (
      <input
        type={inputType}
        value={val}
        onChange={e => setFormValues(v => ({ ...v, [fieldId]: e.target.value }))}
        style={inputStyle(invalid)}
      />
    );
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: 32,
    width: 520, maxHeight: '80vh', overflowY: 'auto',
    fontFamily: 'DM Sans, sans-serif',
  };
  const btnSecondary: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };
  const btnPrimary: React.CSSProperties = {
    background: 'var(--text, #1a1814)', color: '#fff',
    border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, fontWeight: 400, margin: '0 0 20px' }}>
          {selectedTemplateId ? 'Review & Convert' : 'Convert Record'}
        </h2>

        {!selectedTemplateId ? (
          /* ── Stage 1: Template selection ── */
          <>
            {templates.length === 0 && (
              <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24 }}>
                No conversion templates configured for this record type.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {templates.map(tpl => (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, border: '1px solid var(--border)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  {tpl.name}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
            </div>
          </>
        ) : (
          /* ── Stage 2: Prefill form ── */
          <>
            {(!templateWithMappings || !sourceRecord) ? (
              <p style={{ color: 'var(--text3)' }}>Loading…</p>
            ) : (
              <>
                {/* Name (always shown, required) */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Name *</label>
                  <input
                    value={formValues['name'] ?? ''}
                    onChange={e => setFormValues(v => ({ ...v, name: e.target.value }))}
                    style={inputStyle(!formValues['name']?.trim())}
                  />
                </div>

                {/* Mapped builtin fields (contact_id, company_id, owner_id) */}
                {mappedBuiltins.map(key => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>{BUILTIN_LABELS[key] ?? key}</label>
                    <input
                      value={formValues[key] ?? ''}
                      onChange={e => setFormValues(v => ({ ...v, [key]: e.target.value }))}
                      style={inputStyle(false)}
                    />
                  </div>
                ))}

                {/* All target type fields — pre-filled if mapped, empty otherwise; required = red border */}
                {targetFields.map(field => (
                  <div key={field.id} style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>
                      {field.label}{field.is_required ? ' *' : ''}
                    </label>
                    {renderFieldInput(field.id, field.field_type, field.options, field.is_required)}
                  </div>
                ))}

                {formError && (
                  <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginBottom: 12 }}>{formError}</p>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button onClick={() => { setSelectedTemplateId(null); setFormValues({}); setFormError(null); }} style={btnSecondary}>
                    Back
                  </button>
                  <button onClick={onClose} style={btnSecondary}>Cancel</button>
                  <button onClick={handleSubmit} disabled={convert.isPending} style={btnPrimary}>
                    {convert.isPending ? 'Converting…' : 'Convert'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
