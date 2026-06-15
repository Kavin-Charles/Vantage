'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  getPipeline,
  createStage,
  deleteStage,
  createField,
  deleteField,
  type PipelineField,
} from '@/modules/pipeline/lib/pipelines';
import { FIELD_TYPES, FIELD_TYPE_META } from '@/modules/pipeline/lib/field-types';
import Link from 'next/link';

const STAGE_COLORS = [
  '#6366f1', '#0ea5e9', '#f59e0b', '#10b981',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];

export default function PipelineConfigPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'stages' | 'fields'>('stages');

  // Stage form
  const [stageName, setStageName] = useState('');
  const [stageColor, setStageColor] = useState(STAGE_COLORS[0]!);
  const [stageNameFocused, setStageNameFocused] = useState(false);

  // Field form
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState<PipelineField['type']>('text');
  const [fieldLabelFocused, setFieldLabelFocused] = useState(false);
  const [fieldKeyFocused, setFieldKeyFocused] = useState(false);

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline', id],
    queryFn: async () => getPipeline(await getToken(), id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pipeline', id] });
    void qc.invalidateQueries({ queryKey: ['pipelines'] });
  };

  const createStageMut = useMutation({
    mutationFn: async () => createStage(await getToken(), id, { name: stageName.trim(), color: stageColor }),
    onSuccess: () => { invalidate(); setStageName(''); setStageColor(STAGE_COLORS[0]!); },
  });

  const deleteStageMut = useMutation({
    mutationFn: async (stageId: string) => deleteStage(await getToken(), id, stageId),
    onSuccess: invalidate,
  });

  const createFieldMut = useMutation({
    mutationFn: async () => {
      const key = fieldKey.trim() || fieldLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      return createField(await getToken(), id, {
        label: fieldLabel.trim(),
        key,
        type: fieldType,
        position: pipeline?.fields.length ?? 0,
        required: false,
        options: null,
      });
    },
    onSuccess: () => { invalidate(); setFieldLabel(''); setFieldKey(''); setFieldType('text'); },
  });

  const deleteFieldMut = useMutation({
    mutationFn: async (fieldId: string) => deleteField(await getToken(), id, fieldId),
    onSuccess: invalidate,
  });

  const eyebrow: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: 'var(--text3)',
    fontFamily: 'var(--font-sans)',
    marginBottom: 6,
    display: 'block',
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    background: 'var(--surface)',
    color: 'var(--text)',
    outline: 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
    boxSizing: 'border-box',
  };

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    ...inputBase,
    border: `1px solid ${focused ? 'var(--text2)' : 'var(--border)'}`,
    boxShadow: focused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
  });

  if (isLoading) return (
    <div style={{ padding: 48, color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
      Loading…
    </div>
  );

  if (!pipeline) return (
    <div style={{ padding: 48, color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
      Pipeline not found.
    </div>
  );

  return (
    <div style={{ maxWidth: 580, padding: '32px 0' }}>
      {/* Back link */}
      <Link
        href="/settings/pipelines"
        style={{
          fontSize: 12,
          color: 'var(--text3)',
          fontFamily: 'var(--font-sans)',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 20,
          transition: 'color .15s ease',
        }}
        onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'var(--text2)'; }}
        onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'var(--text3)'; }}
      >
        ← Pipelines
      </Link>

      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: '-0.4px',
        color: 'var(--text)',
        margin: '0 0 4px',
      }}>
        {pipeline.name}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', margin: '0 0 28px' }}>
        Configure stages and fields for this pipeline.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {(['stages', 'fields'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--text)' : 'var(--text3)',
              borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color .15s ease',
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span style={{
              marginLeft: 6,
              fontSize: 11,
              color: 'var(--text3)',
              background: 'var(--surface2)',
              borderRadius: 999,
              padding: '1px 6px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 400,
            }}>
              {t === 'stages' ? pipeline.stages.length : pipeline.fields.length}
            </span>
          </button>
        ))}
      </div>

      {/* Stages tab */}
      {tab === 'stages' && (
        <div>
          {/* Stage list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {pipeline.stages.map(s => {
              const color = s.is_won ? '#22c55e' : s.is_lost ? '#ef4444' : (s.color ?? '#6366f1');
              return (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  background: 'var(--surface)',
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text)', fontWeight: 500 }}>
                    {s.name}
                  </span>
                  <span style={{
                    background: color + '1a',
                    color: color,
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 999,
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: '0.3px',
                  }}>
                    {s.is_won ? 'WON' : s.is_lost ? 'LOST' : 'ACTIVE'}
                  </span>
                  {!s.is_won && !s.is_lost && (
                    <button
                      onClick={() => { if (confirm(`Delete stage "${s.name}"?`)) deleteStageMut.mutate(s.id); }}
                      style={{
                        fontSize: 12,
                        color: 'var(--red, #991b1b)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        transition: 'all .15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg, #fee2e2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            {pipeline.stages.length === 0 && (
              <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                No stages yet. Add one below.
              </p>
            )}
          </div>

          {/* Add stage form */}
          <div style={{
            border: '1px dashed var(--border)',
            borderRadius: 16,
            padding: '18px 20px',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              margin: '0 0 14px',
            }}>
              Add stage
            </h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={eyebrow}>Name</label>
                <input
                  value={stageName}
                  onChange={e => setStageName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && stageName.trim() && createStageMut.mutate()}
                  onFocus={() => setStageNameFocused(true)}
                  onBlur={() => setStageNameFocused(false)}
                  placeholder="Stage name"
                  style={inputStyle(stageNameFocused)}
                />
              </div>
              <div>
                <label style={eyebrow}>Color</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {STAGE_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setStageColor(c)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: c,
                        border: stageColor === c ? '2px solid var(--text)' : '2px solid transparent',
                        outline: stageColor === c ? '2px solid white' : 'none',
                        outlineOffset: -3,
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'border .15s ease',
                      }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={() => createStageMut.mutate()}
                disabled={!stageName.trim() || createStageMut.isPending}
                style={{
                  padding: '8px 18px',
                  background: !stageName.trim() ? 'var(--text3)' : 'var(--text)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  cursor: stageName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  transition: 'all .15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {createStageMut.isPending ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fields tab */}
      {tab === 'fields' && (
        <div>
          {/* Field list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {pipeline.fields.map(f => (
              <div key={f.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--surface)',
              }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text3)',
                  background: 'var(--surface2)',
                  borderRadius: 6,
                  padding: '3px 7px',
                  fontFamily: 'var(--font-sans)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  {FIELD_TYPE_META[f.type]?.label ?? f.type}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text)', fontWeight: 500 }}>
                  {f.label}
                </span>
                <span style={{
                  fontSize: 12,
                  color: 'var(--text3)',
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--surface2)',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}>
                  {f.key}
                </span>
                <button
                  onClick={() => { if (confirm(`Delete field "${f.label}"? Data will be lost.`)) deleteFieldMut.mutate(f.id); }}
                  style={{
                    fontSize: 12,
                    color: 'var(--red, #991b1b)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    transition: 'all .15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg, #fee2e2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                >
                  Remove
                </button>
              </div>
            ))}
            {pipeline.fields.length === 0 && (
              <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                No fields yet. Add one below.
              </p>
            )}
          </div>

          {/* Add field form */}
          <div style={{
            border: '1px dashed var(--border)',
            borderRadius: 16,
            padding: '18px 20px',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              margin: '0 0 14px',
            }}>
              Add field
            </h3>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 2 }}>
                <label style={eyebrow}>Label</label>
                <input
                  value={fieldLabel}
                  onChange={e => {
                    setFieldLabel(e.target.value);
                    if (!fieldKey) {
                      setFieldKey(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                    }
                  }}
                  onFocus={() => setFieldLabelFocused(true)}
                  onBlur={() => setFieldLabelFocused(false)}
                  placeholder="Field label"
                  style={inputStyle(fieldLabelFocused)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={eyebrow}>Key</label>
                <input
                  value={fieldKey}
                  onChange={e => setFieldKey(e.target.value)}
                  onFocus={() => setFieldKeyFocused(true)}
                  onBlur={() => setFieldKeyFocused(false)}
                  placeholder="field_key"
                  style={{ ...inputStyle(fieldKeyFocused), fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={eyebrow}>Type</label>
                <select
                  value={fieldType}
                  onChange={e => setFieldType(e.target.value as PipelineField['type'])}
                  style={inputStyle(false)}
                >
                  {FIELD_TYPES.map(t => (
                    <option key={t} value={t}>{FIELD_TYPE_META[t]?.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => createFieldMut.mutate()}
                disabled={!fieldLabel.trim() || createFieldMut.isPending}
                style={{
                  padding: '8px 18px',
                  background: !fieldLabel.trim() ? 'var(--text3)' : 'var(--text)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  cursor: fieldLabel.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  transition: 'all .15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {createFieldMut.isPending ? 'Adding…' : 'Add field'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
