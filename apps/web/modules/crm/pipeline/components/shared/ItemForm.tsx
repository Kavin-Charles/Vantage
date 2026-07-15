'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createItem } from '@/modules/crm/pipeline/lib/items';
import { FieldEditor } from '@/modules/crm/pipeline/components/fields/FieldEditor';
import type { PipelineField, PipelineStage } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  pipelineId: string;
  stages: PipelineStage[];
  fields: PipelineField[];
  defaultStageId?: string;
  onClose: () => void;
}

export function ItemForm({ pipelineId, stages, fields, defaultStageId, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [stageId, setStageId] = useState(defaultStageId ?? stages[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [stageFocused, setStageFocused] = useState(false);
  const [primaryHovered, setPrimaryHovered] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createItem(token, pipelineId, { stage_id: stageId, field_values: values });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items', pipelineId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: 'var(--text3)',
    fontFamily: 'var(--font-sans)',
    marginBottom: 6,
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${stageFocused ? 'var(--text2)' : 'var(--border)'}`,
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    background: 'var(--surface)',
    color: 'var(--text)',
    outline: 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
    boxShadow: stageFocused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(11,19,48,0.25)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: 20,
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        border: '1px solid var(--border)',
        width: 480,
        maxWidth: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
        animation: 'none',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.4px',
            color: 'var(--text)',
            margin: 0,
          }}>
            New item
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text3)',
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
              borderRadius: 6,
              transition: 'all .15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text3)'; }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px' }}>
          {/* Stage selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Stage</label>
            <select
              value={stageId}
              onChange={e => setStageId(e.target.value)}
              style={selectStyle}
              onFocus={() => setStageFocused(true)}
              onBlur={() => setStageFocused(false)}
            >
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Dynamic fields */}
          {fields.map(field => (
            <div key={field.id} style={{ marginBottom: 18 }}>
              <label style={labelStyle}>
                {field.label}
                {field.required && <span style={{ color: 'var(--red, #991b1b)', marginLeft: 2 }}>*</span>}
              </label>
              <FieldEditor
                field={field}
                value={values[field.key]}
                onChange={v => setValues(prev => ({ ...prev, [field.key]: v }))}
              />
            </div>
          ))}

          {fields.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', margin: '0 0 16px' }}>
              No fields configured for this pipeline. Add fields in Settings → Pipelines.
            </p>
          )}

          {error && (
            <div style={{
              background: 'var(--red-bg, #fee2e2)',
              color: 'var(--red, #991b1b)',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              padding: '10px 14px',
              borderRadius: 10,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 20px',
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              color: 'var(--text2)',
              fontWeight: 500,
              transition: 'all .15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text2)'; }}
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !stageId}
            onMouseEnter={() => setPrimaryHovered(true)}
            onMouseLeave={() => setPrimaryHovered(false)}
            style={{
              padding: '9px 20px',
              border: 'none',
              borderRadius: 12,
              background: mutation.isPending || !stageId ? 'var(--text3)' : primaryHovered ? '#1a2244' : 'var(--text)',
              color: '#fff',
              cursor: mutation.isPending || !stageId ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              transition: 'all .15s ease',
              opacity: mutation.isPending ? 0.7 : 1,
            }}
          >
            {mutation.isPending ? 'Creating…' : 'Create item'}
          </button>
        </div>
      </div>
    </div>
  );
}
