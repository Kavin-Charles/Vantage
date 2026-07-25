'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  createField, updateField, deleteField, reorderFields,
} from '@/modules/crm/pipeline/lib/pipelines';
import type { Pipeline, PipelineField } from '@/modules/crm/pipeline/lib/pipelines';
import { FIELD_TYPES, FIELD_TYPE_META } from '@/modules/crm/pipeline/lib/field-types';
import type { FieldType } from '@/modules/crm/pipeline/lib/field-types';
import { FluidInput, FluidButton, FluidSelect, MSIcon } from '@/modules/shared/fluid/ui';

function slugifyKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[0-9_]+/, '');
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 8, fontFamily: 'var(--fl-font-body)',
  fontSize: 13, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
};

export function FieldsTab({ pipeline }: { pipeline: Pipeline }) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);
  const [optionInput, setOptionInput] = useState('');

  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<{ label: string; value: string }[]>([]);
  const [addOptionInput, setAddOptionInput] = useState('');
  const [addFieldError, setAddFieldError] = useState<string | null>(null);
  const isAddOptionType = fieldType === 'select' || fieldType === 'multiselect';

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pipeline', pipeline.id] });
    void qc.invalidateQueries({ queryKey: ['pipelines'] });
  };

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<PipelineField> }) =>
      updateField(await getToken(), pipeline.id, id, body),
    onSuccess: () => { invalidate(); setEditingId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteField(await getToken(), pipeline.id, id),
    onSuccess: invalidate,
  });

  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => reorderFields(await getToken(), pipeline.id, ids),
    onSuccess: invalidate,
  });

  const createMut = useMutation({
    mutationFn: async (key: string) =>
      createField(await getToken(), pipeline.id, {
        label: fieldLabel.trim(), key,
        type: fieldType, position: pipeline.fields.length,
        required: fieldRequired,
        options: isAddOptionType ? fieldOptions : null,
      }),
    onSuccess: () => {
      invalidate();
      setFieldLabel(''); setFieldKey(''); setFieldType('text');
      setFieldRequired(false); setFieldOptions([]); setAddOptionInput('');
      setAddFieldError(null);
    },
    onError: (e: Error) => setAddFieldError(e.message || 'Failed to add field'),
  });

  function submitAddField() {
    const key = slugifyKey(fieldKey.trim() || fieldLabel);
    if (!key) {
      setAddFieldError('Key must contain at least one letter (a–z)');
      return;
    }
    if (pipeline.fields.some(f => f.key === key)) {
      setAddFieldError(`A field with key "${key}" already exists`);
      return;
    }
    setAddFieldError(null);
    createMut.mutate(key);
  }

  const sortedFields = [...pipeline.fields].sort((a, b) => a.position - b.position);

  function handleReorder(fieldId: string, direction: 'up' | 'down') {
    const idx = sortedFields.findIndex(f => f.id === fieldId);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sortedFields.length - 1) return;
    const next = [...sortedFields];
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    reorderMut.mutate(next.map(f => f.id));
  }

  function commitEditLabel(field: PipelineField) {
    const trimmed = editingLabel.trim();
    if (trimmed && trimmed !== field.label) {
      updateMut.mutate({ id: field.id, body: { label: trimmed } });
    } else {
      setEditingId(null);
    }
  }

  function addOptionToField(field: PipelineField, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const newOpts = [...(field.options ?? []), { label: trimmed, value }];
    updateMut.mutate({ id: field.id, body: { options: newOpts } });
  }

  function removeOptionFromField(field: PipelineField, i: number) {
    const newOpts = (field.options ?? []).filter((_, j) => j !== i);
    updateMut.mutate({ id: field.id, body: { options: newOpts } });
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {sortedFields.map((field, idx) => {
          const isEditing = editingId === field.id;
          const isOptionType = field.type === 'select' || field.type === 'multiselect';
          const optionsOpen = optionsOpenId === field.id;

          return (
            <div
              key={field.id}
              style={{
                border: '1px solid var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-input)',
                background: 'var(--fl-surface-container-lowest)', overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
                  background: 'var(--fl-surface-container)', borderRadius: 6, padding: '3px 7px',
                  fontFamily: 'var(--fl-font-body)', textTransform: 'uppercase',
                  letterSpacing: '0.4px', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {FIELD_TYPE_META[field.type].label}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={e => setEditingLabel(e.target.value)}
                      onBlur={() => commitEditLabel(field)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEditLabel(field);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      style={{
                        padding: '4px 8px', border: '1px solid var(--fl-primary)',
                        borderRadius: 6, fontSize: 13, fontFamily: 'var(--fl-font-body)',
                        color: 'var(--fl-on-surface)', background: 'var(--fl-surface-container-lowest)',
                        outline: 'none', width: '100%', boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingId(field.id); setEditingLabel(field.label); }}
                      style={{
                        fontSize: 13, fontFamily: 'var(--fl-font-body)',
                        color: 'var(--fl-on-surface)', fontWeight: 500, cursor: 'text',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', display: 'block',
                      }}
                    >
                      {field.label}
                    </span>
                  )}
                </div>

                <span style={{
                  fontSize: 12, color: 'var(--fl-on-surface-variant)', fontFamily: 'monospace',
                  background: 'var(--fl-surface-container)', padding: '2px 8px', borderRadius: 6,
                  flexShrink: 0,
                }}>
                  {field.key}
                </span>

                {field.required && (
                  <span style={{
                    fontSize: 10, color: 'var(--fl-on-error-container)',
                    background: 'var(--fl-error-container)',
                    padding: '2px 6px', borderRadius: 'var(--fl-radius-pill)',
                    fontFamily: 'var(--fl-font-body)', fontWeight: 600, flexShrink: 0,
                  }}>
                    REQ
                  </span>
                )}

                {isOptionType && (
                  <button
                    onClick={() => setOptionsOpenId(optionsOpen ? null : field.id)}
                    style={{
                      fontSize: 11, color: 'var(--fl-on-surface-variant)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '2px 6px', fontFamily: 'var(--fl-font-body)', flexShrink: 0,
                    }}
                  >
                    {optionsOpen ? '▲' : '▼'} {(field.options ?? []).length}
                  </button>
                )}

                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => handleReorder(field.id, 'up')}
                    disabled={idx === 0}
                    aria-label={`Move ${field.label} up`}
                    style={{
                      width: 24, height: 24, border: 'none', background: 'transparent',
                      cursor: idx === 0 ? 'default' : 'pointer', color: 'var(--fl-on-surface-variant)',
                      opacity: idx === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MSIcon name="arrow_upward" size={16} />
                  </button>
                  <button
                    onClick={() => handleReorder(field.id, 'down')}
                    disabled={idx === sortedFields.length - 1}
                    aria-label={`Move ${field.label} down`}
                    style={{
                      width: 24, height: 24, border: 'none', background: 'transparent',
                      cursor: idx === sortedFields.length - 1 ? 'default' : 'pointer',
                      color: 'var(--fl-on-surface-variant)',
                      opacity: idx === sortedFields.length - 1 ? 0.3 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MSIcon name="arrow_downward" size={16} />
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (confirm(`Delete "${field.label}"? Data will be lost.`))
                      deleteMut.mutate(field.id);
                  }}
                  style={{
                    fontSize: 12, color: 'var(--fl-error)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 8,
                    fontFamily: 'var(--fl-font-body)', fontWeight: 500, flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              </div>

              {optionsOpen && isOptionType && (
                <div style={{
                  borderTop: '1px solid var(--fl-outline-variant)', padding: '12px 16px',
                  background: 'var(--fl-surface-container-low)',
                }}>
                  {(field.options ?? []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {(field.options ?? []).map((opt, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: 'var(--fl-surface-container-lowest)', border: '1px solid var(--fl-outline-variant)',
                          borderRadius: 'var(--fl-radius-pill)', padding: '3px 6px 3px 10px',
                          fontSize: 12, fontFamily: 'var(--fl-font-body)', color: 'var(--fl-on-surface)',
                        }}>
                          {opt.label}
                          <button
                            onClick={() => removeOptionFromField(field, i)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '0 2px', color: 'var(--fl-on-surface-variant)', fontSize: 14, lineHeight: 1,
                            }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <FluidInput
                      value={optionInput}
                      onChange={setOptionInput}
                      placeholder="Add option"
                    />
                    <FluidButton
                      variant="ghost"
                      onClick={() => { addOptionToField(field, optionInput); setOptionInput(''); }}
                      disabled={!optionInput.trim()}
                    >
                      Add
                    </FluidButton>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {pipeline.fields.length === 0 && (
          <p style={{ color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)', fontSize: 13 }}>
            No fields yet. Add one below.
          </p>
        )}
      </div>

      <div style={{ border: '1px dashed var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-card)', padding: '18px 20px' }}>
        <h3 style={{ fontFamily: 'var(--fl-font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fl-on-surface)', margin: '0 0 14px' }}>
          Add field
        </h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <label style={labelStyle}>Label</label>
            <FluidInput
              value={fieldLabel}
              onChange={v => {
                setFieldLabel(v);
                setAddFieldError(null);
                if (!fieldKey) setFieldKey(slugifyKey(v));
              }}
              placeholder="Field label"
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={labelStyle}>Key</label>
            <FluidInput
              value={fieldKey}
              onChange={v => { setFieldKey(v); setAddFieldError(null); }}
              placeholder="field_key"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: isAddOptionType ? 10 : 0 }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>Type</label>
            <FluidSelect
              value={fieldType}
              onChange={v => { setFieldType(v as FieldType); setFieldOptions([]); setAddOptionInput(''); }}
              options={FIELD_TYPES.map(t => ({ label: FIELD_TYPE_META[t].label, value: t }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
            <input
              type="checkbox" id="field-required-new"
              checked={fieldRequired} onChange={e => setFieldRequired(e.target.checked)}
              style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--fl-primary)' }}
            />
            <label htmlFor="field-required-new" style={{ fontSize: 13, fontFamily: 'var(--fl-font-body)', color: 'var(--fl-on-surface-variant)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
              Required
            </label>
          </div>
          <FluidButton
            onClick={submitAddField}
            disabled={!fieldLabel.trim() || createMut.isPending || (isAddOptionType && fieldOptions.length === 0)}
            icon="add"
          >
            {createMut.isPending ? 'Adding…' : 'Add field'}
          </FluidButton>
        </div>

        {addFieldError && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: 'var(--fl-error-container)', color: 'var(--fl-on-error-container)',
            fontSize: 12, fontFamily: 'var(--fl-font-body)',
          }}>
            {addFieldError}
          </div>
        )}

        {isAddOptionType && (
          <div>
            <label style={labelStyle}>Options</label>
            {fieldOptions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {fieldOptions.map((opt, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--fl-surface-container)', border: '1px solid var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-pill)', padding: '3px 6px 3px 10px', fontSize: 12, fontFamily: 'var(--fl-font-body)', color: 'var(--fl-on-surface)' }}>
                    {opt.label}
                    <button onClick={() => setFieldOptions(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--fl-on-surface-variant)', fontSize: 14, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <FluidInput
                value={addOptionInput}
                onChange={setAddOptionInput}
                placeholder="Option label"
              />
              <FluidButton
                variant="ghost"
                onClick={() => {
                  const trimmed = addOptionInput.trim();
                  if (!trimmed) return;
                  const val = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                  setFieldOptions(prev => [...prev, { label: trimmed, value: val }]);
                  setAddOptionInput('');
                }}
                disabled={!addOptionInput.trim()}
              >
                Add option
              </FluidButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
