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
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.6px', color: 'var(--text3)',
  fontFamily: 'var(--font-sans)', marginBottom: 6, display: 'block',
};

function slugifyKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[0-9_]+/, '');
}

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '8px 12px',
    border: `1px solid ${focused ? 'var(--text2)' : 'var(--border)'}`,
    borderRadius: 10, fontSize: 13, fontFamily: 'var(--font-sans)',
    background: 'var(--surface)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  };
}

export function FieldsTab({ pipeline }: { pipeline: Pipeline }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('pipelines:field.edit');
  const canDelete = hasPermission('pipelines:field.delete');

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);
  const [optionInput, setOptionInput] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Add field form
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<{ label: string; value: string }[]>([]);
  const [addOptionInput, setAddOptionInput] = useState('');
  const [labelFocused, setLabelFocused] = useState(false);
  const [keyFocused, setKeyFocused] = useState(false);
  const [addOptFocused, setAddOptFocused] = useState(false);
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

  function openContextMenu(e: React.MouseEvent, field: PipelineField, idx: number) {
    const isOptionType = field.type === 'select' || field.type === 'multiselect';
    const items = [
      canEdit && {
        label: 'Rename Field', icon: 'pencil',
        onClick: () => { setEditingId(field.id); setEditingLabel(field.label); },
      },
      canEdit && isOptionType && {
        label: 'Edit Options', icon: 'list',
        onClick: () => setOptionsOpenId(optionsOpenId === field.id ? null : field.id),
      },
      canEdit && {
        label: field.required ? 'Mark Optional' : 'Mark Required',
        icon: 'asterisk',
        onClick: () => updateMut.mutate({ id: field.id, body: { required: !field.required } }),
      },
      canEdit && { label: 'Move Up', icon: 'arrow-up', disabled: idx === 0, onClick: () => handleReorder(field.id, 'up') },
      canEdit && { label: 'Move Down', icon: 'arrow-down', disabled: idx === sortedFields.length - 1, onClick: () => handleReorder(field.id, 'down') },
      canDelete && { type: 'separator' as const },
      canDelete && {
        label: 'Delete Field', icon: 'trash-2', danger: true,
        onClick: () => {
          if (confirm(`Delete "${field.label}"? Data will be lost.`)) deleteMut.mutate(field.id);
        },
      },
    ].filter(Boolean) as ContextMenuItem[];
    if (items.length) openMenu(e, items);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {sortedFields.map((field, idx) => {
          const isEditing = editingId === field.id;
          const isOptionType = field.type === 'select' || field.type === 'multiselect';
          const optionsOpen = optionsOpenId === field.id;
          const isHovered = hoveredId === field.id;

          return (
            <div
              key={field.id}
              style={{
                border: '1px solid var(--border)', borderRadius: 12,
                background: 'var(--surface)', overflow: 'hidden',
                boxShadow: isHovered ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
                transform: isHovered ? 'translateY(-1px)' : 'none',
                transition: 'box-shadow .15s ease, transform .15s ease',
              }}
              onMouseEnter={() => setHoveredId(field.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Row */}
              <div
                onContextMenu={e => openContextMenu(e, field, idx)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}
              >
                {/* Type badge */}
                <span style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
                  background: 'var(--surface2)', borderRadius: 6, padding: '3px 7px',
                  fontFamily: 'var(--font-sans)', textTransform: 'uppercase',
                  letterSpacing: '0.4px', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {FIELD_TYPE_META[field.type].label}
                </span>

                {/* Label / inline edit */}
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
                        padding: '4px 8px', border: '1px solid var(--text2)',
                        borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)',
                        color: 'var(--text)', background: 'var(--surface)',
                        outline: 'none', width: '100%', boxSizing: 'border-box',
                        transition: 'border-color .15s ease',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => canEdit && (setEditingId(field.id), setEditingLabel(field.label))}
                      style={{
                        fontSize: 13, fontFamily: 'var(--font-sans)',
                        color: 'var(--text)', fontWeight: 500,
                        cursor: canEdit ? 'text' : 'default',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', display: 'block',
                      }}
                    >
                      {field.label}
                    </span>
                  )}
                </div>

                {/* Key */}
                <span style={{
                  fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                  background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6,
                  flexShrink: 0,
                }}>
                  {field.key}
                </span>

                {/* Required badge */}
                {field.required && (
                  <span style={{
                    fontSize: 10, color: 'var(--amber, #92400e)',
                    background: 'var(--amber-bg, #fef3c7)',
                    padding: '2px 6px', borderRadius: 999,
                    fontFamily: 'var(--font-sans)', fontWeight: 600, flexShrink: 0,
                  }}>
                    REQ
                  </span>
                )}

                {/* Options toggle */}
                {isOptionType && canEdit && (
                  <button
                    onClick={() => setOptionsOpenId(optionsOpen ? null : field.id)}
                    style={{
                      fontSize: 11, color: optionsOpen ? 'var(--text2)' : 'var(--text3)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '2px 6px', fontFamily: 'var(--font-sans)',
                      flexShrink: 0, transition: 'color .15s ease',
                    }}
                  >
                    {optionsOpen ? '▲' : '▼'} {(field.options ?? []).length}
                  </button>
                )}

                {/* Reorder */}
                {canEdit && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    {(['up', 'down'] as const).map(dir => {
                      const disabled = dir === 'up' ? idx === 0 : idx === sortedFields.length - 1;
                      return (
                        <button
                          key={dir}
                          onClick={() => handleReorder(field.id, dir)}
                          disabled={disabled}
                          style={{
                            width: 20, height: 16, border: 'none', background: 'none',
                            cursor: disabled ? 'default' : 'pointer',
                            color: 'var(--text2)', fontSize: 9, padding: 0, lineHeight: 1,
                            opacity: disabled ? 0.25 : 1,
                            transition: 'opacity .15s ease',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {dir === 'up' ? '▲' : '▼'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Delete */}
                {canDelete && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${field.label}"? Data will be lost.`))
                        deleteMut.mutate(field.id);
                    }}
                    style={{
                      fontSize: 12, color: 'var(--red, #991b1b)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px 8px', borderRadius: 6,
                      fontFamily: 'var(--font-sans)', fontWeight: 500,
                      flexShrink: 0, transition: 'background .15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg, #fee2e2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Options panel */}
              {optionsOpen && isOptionType && (
                <div style={{
                  borderTop: '1px solid var(--border)', padding: '12px 16px',
                  background: 'var(--bg, #f7f6f2)',
                  animation: 'ctx-in .15s ease',
                }}>
                  {(field.options ?? []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {(field.options ?? []).map((opt, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 999, padding: '3px 6px 3px 10px',
                          fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--text)',
                        }}>
                          {opt.label}
                          <button
                            onClick={() => removeOptionFromField(field, i)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '0 2px', color: 'var(--text3)', fontSize: 14, lineHeight: 1,
                              transition: 'color .12s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--red, #991b1b)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={optionInput}
                      onChange={e => setOptionInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addOptionToField(field, optionInput);
                          setOptionInput('');
                        }
                      }}
                      placeholder="Add option (Enter to add)"
                      style={{
                        flex: 1, padding: '6px 10px',
                        border: '1px solid var(--border)', borderRadius: 8,
                        fontSize: 12, fontFamily: 'var(--font-sans)',
                        background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                        transition: 'border-color .15s ease',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--text2)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    />
                    <button
                      onClick={() => { addOptionToField(field, optionInput); setOptionInput(''); }}
                      disabled={!optionInput.trim()}
                      style={{
                        padding: '6px 12px', background: 'var(--surface2)',
                        border: '1px solid var(--border)', borderRadius: 8,
                        cursor: optionInput.trim() ? 'pointer' : 'not-allowed',
                        fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600,
                        color: optionInput.trim() ? 'var(--text2)' : 'var(--text3)',
                        whiteSpace: 'nowrap', transition: 'background .15s ease',
                      }}
                      onMouseEnter={e => { if (optionInput.trim()) e.currentTarget.style.background = 'var(--border)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {pipeline.fields.length === 0 && (
          <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
            No fields yet. Add one below.
          </p>
        )}
      </div>

      {/* Add field form */}
      <div style={{ border: '1px dashed var(--border)', borderRadius: 16, padding: '18px 20px' }}>
        <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 14px' }}>
          Add field
        </h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 2 }}>
            <label style={eyebrow}>Label</label>
            <input
              value={fieldLabel}
              onChange={e => {
                setFieldLabel(e.target.value);
                setAddFieldError(null);
                if (!fieldKey) setFieldKey(slugifyKey(e.target.value));
              }}
              onFocus={() => setLabelFocused(true)}
              onBlur={() => setLabelFocused(false)}
              placeholder="Field label"
              style={inputStyle(labelFocused)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={eyebrow}>Key</label>
            <input
              value={fieldKey}
              onChange={e => { setFieldKey(e.target.value); setAddFieldError(null); }}
              onFocus={() => setKeyFocused(true)}
              onBlur={() => setKeyFocused(false)}
              placeholder="field_key"
              style={{ ...inputStyle(keyFocused), fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: isAddOptionType ? 10 : 0 }}>
          <div style={{ flex: 1 }}>
            <label style={eyebrow}>Type</label>
            <select
              value={fieldType}
              onChange={e => { setFieldType(e.target.value as FieldType); setFieldOptions([]); setAddOptionInput(''); }}
              style={inputStyle(false)}
            >
              {FIELD_TYPES.map(t => <option key={t} value={t}>{FIELD_TYPE_META[t].label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
            <input
              type="checkbox" id="field-required-new"
              checked={fieldRequired} onChange={e => setFieldRequired(e.target.checked)}
              style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--text)' }}
            />
            <label htmlFor="field-required-new" style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text2)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
              Required
            </label>
          </div>
          <button
            onClick={submitAddField}
            disabled={!fieldLabel.trim() || createMut.isPending || (isAddOptionType && fieldOptions.length === 0)}
            style={{
              padding: '8px 18px',
              background: (!fieldLabel.trim() || (isAddOptionType && fieldOptions.length === 0)) ? 'var(--text3)' : 'var(--text)',
              color: '#fff', border: 'none', borderRadius: 10,
              cursor: (fieldLabel.trim() && (!isAddOptionType || fieldOptions.length > 0)) ? 'pointer' : 'not-allowed',
              fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 600,
              whiteSpace: 'nowrap', transition: 'background .15s ease',
            }}
          >
            {createMut.isPending ? 'Adding…' : 'Add field'}
          </button>
        </div>

        {addFieldError && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: 'var(--red-bg, #fee2e2)', color: 'var(--red, #991b1b)',
            fontSize: 12, fontFamily: 'var(--font-sans)',
          }}>
            {addFieldError}
          </div>
        )}

        {isAddOptionType && (
          <div>
            <label style={eyebrow}>Options</label>
            {fieldOptions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {fieldOptions.map((opt, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                    {opt.label}
                    <button onClick={() => setFieldOptions(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={addOptionInput}
                onChange={e => setAddOptionInput(e.target.value)}
                onFocus={() => setAddOptFocused(true)}
                onBlur={() => setAddOptFocused(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const trimmed = addOptionInput.trim();
                    if (!trimmed) return;
                    const val = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    setFieldOptions(prev => [...prev, { label: trimmed, value: val }]);
                    setAddOptionInput('');
                  }
                }}
                placeholder="Option label"
                style={inputStyle(addOptFocused)}
              />
              <button
                onClick={() => {
                  const trimmed = addOptionInput.trim();
                  if (!trimmed) return;
                  const val = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                  setFieldOptions(prev => [...prev, { label: trimmed, value: val }]);
                  setAddOptionInput('');
                }}
                disabled={!addOptionInput.trim()}
                style={{ padding: '8px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, cursor: addOptionInput.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, color: addOptionInput.trim() ? 'var(--text2)' : 'var(--text3)', whiteSpace: 'nowrap' }}
              >
                Add option
              </button>
            </div>
          </div>
        )}
      </div>

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
