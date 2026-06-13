'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { listFields, addField, updateField, deleteField, reorderFields } from '@/modules/pipeline/lib/record-types';
import type { RecordTypeField } from '@vencore/types';

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

export function RecordTypeEditor({ recordTypeId }: { recordTypeId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { ask: askConfirm, el: confirmEl } = useConfirm();
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<typeof FIELD_TYPES[number]>('text');
  const [dragId, setDragId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['record-type-fields', recordTypeId],
    queryFn: async () => listFields(await getToken(), recordTypeId),
  });
  const fields = data?.data ?? [];

  const addMut = useMutation({
    mutationFn: async () => addField(await getToken(), recordTypeId, {
      label: newLabel.trim(), field_type: newType, position: fields.length,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] });
      setAdding(false);
      setNewLabel('');
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, options, ...body }: Partial<RecordTypeField> & { id: string }) =>
      updateField(await getToken(), recordTypeId, id, {
        ...body,
        ...(options != null ? { options } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteField(await getToken(), recordTypeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] }),
  });

  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => reorderFields(await getToken(), recordTypeId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-type-fields', recordTypeId] }),
  });

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = fields.map(f => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const r = [...ids];
    r.splice(from, 1);
    r.splice(to, 0, dragId);
    reorderMut.mutate(r);
    setDragId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {fields.map(field => (
        <div
          key={field.id}
          draggable
          onDragStart={() => setDragId(field.id)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(field.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 8,
          }}
        >
          <span style={{ cursor: 'grab', color: 'var(--text3)' }}>⠿</span>
          <input
            defaultValue={field.label}
            onBlur={e => { if (e.target.value !== field.label) updateMut.mutate({ id: field.id, label: e.target.value }); }}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--text)',
            }}
          />
          <span style={{
            fontSize: 11, padding: '2px 8px', background: 'var(--surface2)',
            borderRadius: 10, color: 'var(--text2)', border: '1px solid var(--border)',
          }}>
            {field.field_type}
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={field.is_required}
              onChange={e => updateMut.mutate({ id: field.id, is_required: e.target.checked })}
            />
            Required
          </label>
          <button
            onClick={() => askConfirm({ title: 'Delete field', message: `Delete field "${field.label}"? Existing values will be lost.`, confirmLabel: 'Delete', variant: 'danger', onConfirm: () => deleteMut.mutate(field.id) })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
          >×</button>
        </div>
      ))}
      {adding ? (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 12px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <input
            autoFocus
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newLabel.trim()) addMut.mutate();
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="Field label"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14,
            }}
          />
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as typeof FIELD_TYPES[number])}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
          >
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => { if (newLabel.trim()) addMut.mutate(); }}
            style={{
              padding: '4px 12px', background: 'var(--text)', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            }}
          >Add</button>
          <button
            onClick={() => setAdding(false)}
            style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}
          >×</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '8px 12px', background: 'none',
            border: '1px dashed var(--border)', borderRadius: 8,
            cursor: 'pointer', color: 'var(--text2)',
            fontFamily: 'DM Sans, sans-serif', fontSize: 14, textAlign: 'left',
          }}
        >+ Add field</button>
      )}
      {confirmEl}
    </div>
  );
}
