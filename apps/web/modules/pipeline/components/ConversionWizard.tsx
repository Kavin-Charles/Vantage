'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { convertRecord } from '@/modules/pipeline/lib/records';
import type { PipelineRecordWithValues, ConversionTemplateWithMappings, ConversionFieldMapping } from '@vantage/types';

type Step = 'select' | 'preview' | 'confirm';

export function ConversionWizard({
  record,
  templateId,
  templates,
  onClose,
  onSuccess,
}: {
  record: PipelineRecordWithValues;
  templateId: string;
  templates: ConversionTemplateWithMappings[];
  onClose: () => void;
  onSuccess: (targetId: string) => void;
}) {
  const getToken = useApiToken();
  const [step, setStep] = useState<Step>(templateId ? 'preview' : 'select');
  const [selectedId, setSelectedId] = useState(templateId);
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const template = templates.find(t => t.id === selectedId);

  const convertMut = useMutation({
    mutationFn: async () => convertRecord(await getToken(), record.id, {
      template_id: selectedId,
      field_overrides: overrides,
    }),
    onSuccess: res => onSuccess(res.data.target.id),
    onError: (e: Error) => setError(e.message),
  });

  function getSourceValue(mapping: ConversionFieldMapping): unknown {
    if (mapping.source_builtin) {
      return (record as unknown as Record<string, unknown>)[mapping.source_builtin] ?? '';
    }
    if (mapping.source_field_id) {
      const fv = record.field_values.find(v => v.field_id === mapping.source_field_id);
      return fv?.value ?? '';
    }
    return '';
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const modalStyle: React.CSSProperties = {
    background: 'var(--surface)', borderRadius: 14, width: 520,
    maxHeight: '80vh', overflow: 'auto',
    boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--text)', margin: 0 }}>
            Convert record
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', padding: '12px 24px', borderBottom: '1px solid var(--border)', gap: 4 }}>
          {(['select', 'preview', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--text3)', margin: '0 4px', fontSize: 12 }}>›</span>}
              <span style={{
                fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                color: step === s ? 'var(--text)' : 'var(--text3)',
                fontWeight: step === s ? 600 : 400,
              }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 24px' }}>
          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)',
              borderRadius: 8, fontSize: 13, marginBottom: 16, fontFamily: 'DM Sans, sans-serif',
            }}>{error}</div>
          )}

          {/* Step: select */}
          {step === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => { setSelectedId(t.id); setStep('preview'); }}
                  style={{
                    padding: '14px 16px', border: '1px solid var(--border)',
                    borderRadius: 10, cursor: 'pointer',
                    background: selectedId === t.id ? 'var(--surface2)' : 'var(--surface)',
                  }}
                >
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                    {t.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>
                Review pre-filled values. Edit any field before converting.
              </p>
              {template.field_mappings.filter(m => m.target_field_id || m.target_builtin).map((m, i) => {
                const targetKey = m.target_builtin ?? m.target_field_id ?? String(i);
                const sourceValue = getSourceValue(m);
                const currentValue = overrides[targetKey] !== undefined ? overrides[targetKey] : sourceValue;
                return (
                  <div key={i}>
                    <label style={{
                      display: 'block', fontSize: 12, fontWeight: 600,
                      color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 4,
                    }}>
                      {m.target_builtin ?? `Field ${i + 1}`}
                    </label>
                    <input
                      value={String(currentValue ?? '')}
                      onChange={e => setOverrides(prev => ({ ...prev, [targetKey]: e.target.value }))}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
                        borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Step: confirm */}
          {step === 'confirm' && template && (
            <div>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--text2)', marginTop: 0 }}>
                This will create a new record using template <strong>{template.name}</strong> from record <strong>{record.name}</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          {step !== 'select' && (
            <button
              onClick={() => setStep(step === 'confirm' ? 'preview' : 'select')}
              style={{
                padding: '8px 16px', background: 'none',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: 'pointer', fontSize: 14, color: 'var(--text2)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >Back</button>
          )}
          {step === 'preview' && (
            <button
              onClick={() => setStep('confirm')}
              style={{
                padding: '8px 20px', background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 14, fontFamily: 'DM Sans, sans-serif',
              }}
            >Continue</button>
          )}
          {step === 'confirm' && (
            <button
              onClick={() => convertMut.mutate()}
              disabled={convertMut.isPending}
              style={{
                padding: '8px 20px', background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 14, fontFamily: 'DM Sans, sans-serif',
              }}
            >{convertMut.isPending ? 'Converting…' : 'Convert'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
