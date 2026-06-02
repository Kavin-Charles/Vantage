'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createRecord } from '@/modules/pipeline/lib/records';
import { apiFetch } from '@/modules/shared/lib/api';
import type { PipelineWithDetails, RecordTypeField } from '@vantage/types';

interface Props {
  pipeline: PipelineWithDetails;
  defaultStageId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RecordForm({ pipeline, defaultStageId, onClose, onSuccess }: Props) {
  const getToken = useApiToken();
  const [name, setName] = useState('');
  const [stageId, setStageId] = useState(defaultStageId);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: async () => apiFetch<{ data: { id: string; name: string } }>('/api/me', { token: await getToken() }),
  });

  const activeStages = pipeline.stages.filter(s => !s.is_won && !s.is_lost);
  const fields: RecordTypeField[] = pipeline.record_type?.fields ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ownerId = meData?.data?.id;
    if (!ownerId) {
      setError('Could not determine current user');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      await createRecord(token, {
        record_type_id: pipeline.record_type.id,
        pipeline_id: pipeline.id,
        stage_id: stageId,
        name: name.trim(),
        owner_id: ownerId,
        field_values: fieldValues,
      });
      onSuccess();
    } catch {
      setError('Failed to create record');
      setSubmitting(false);
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(26,24,20,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const modalStyle: React.CSSProperties = {
    width: 480, background: 'var(--surface)',
    borderRadius: 12, border: '1px solid var(--border)',
    boxShadow: '0 8px 40px rgba(26,24,20,0.12)',
    fontFamily: 'DM Sans, sans-serif',
    overflow: 'hidden',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    fontSize: 14, color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 7,
    padding: '8px 11px', background: 'var(--surface)',
    fontFamily: 'DM Sans, sans-serif', outline: 'none',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
            New {pipeline.record_type.name}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 20, lineHeight: 1,
            }}
          >×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 5 }}>
                Name <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={`${pipeline.record_type.name} name`}
                required
                style={inputStyle}
                autoFocus
              />
            </div>

            {/* Stage */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 5 }}>
                Stage
              </label>
              <select
                value={stageId}
                onChange={e => setStageId(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {activeStages.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Dynamic fields */}
            {fields.map(field => (
              <DynamicField
                key={field.id}
                field={field}
                value={fieldValues[field.id]}
                onChange={val => setFieldValues(prev => ({ ...prev, [field.id]: val }))}
                inputStyle={inputStyle}
              />
            ))}

            {error && (
              <div style={{
                fontSize: 13, color: 'var(--red)',
                background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                fontSize: 14, padding: '8px 18px',
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 7, cursor: 'pointer',
                color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              style={{
                fontSize: 14, padding: '8px 18px',
                background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 7,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
                opacity: submitting || !name.trim() ? 0.55 : 1,
              }}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
  inputStyle,
}: {
  field: RecordTypeField;
  value: unknown;
  onChange: (val: unknown) => void;
  inputStyle: React.CSSProperties;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 5 }}>
        {field.label}{field.is_required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>
      {field.field_type === 'boolean' ? (
        <input
          type="checkbox"
          checked={value === true || value === 'true'}
          onChange={e => onChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
      ) : field.field_type === 'select' && field.options ? (
        <select
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">—</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
          value={String(value ?? '')}
          required={field.is_required}
          onChange={e => {
            const v = field.field_type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
            onChange(v);
          }}
          style={inputStyle}
        />
      )}
    </div>
  );
}
