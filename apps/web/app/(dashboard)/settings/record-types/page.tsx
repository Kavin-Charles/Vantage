'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';

interface RecordType {
  id: string;
  name: string;
  icon: string;
  color: string;
  auto_number_enabled: boolean;
  auto_number_prefix: string;
  auto_number_format: string;
}

interface RecordTypeField {
  id: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  is_required: boolean;
  position: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed');
  return json.data;
}

function previewAutoNumber(prefix: string, format: string): string {
  const yy = String(new Date().getFullYear()).slice(-2);
  const yyyy = String(new Date().getFullYear());
  return format
    .replaceAll('PREFIX', prefix || 'PREFIX')
    .replaceAll('YYYY', yyyy)
    .replaceAll('YY', yy)
    .replaceAll('NNNNN', '00001')
    .replaceAll('NNNN', '0001')
    .replaceAll('NNN', '001');
}

export default function RecordTypesSettingsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<RecordType | null>(null);
  const { ask: askConfirm, el: confirmEl } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    icon: '📋',
    color: '#6b665c',
    auto_number_enabled: false,
    auto_number_prefix: '',
    auto_number_format: 'PREFIX-YY-NNN',
  });

  const { data: types = [] } = useQuery<RecordType[]>({
    queryKey: ['record-types'],
    queryFn: () => apiFetch('/record-types'),
  });

  const { data: fields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', selected?.id],
    queryFn: () => apiFetch(`/record-types/${selected!.id}/fields`),
    enabled: !!selected,
  });

  const createType = useMutation({
    mutationFn: (data: typeof createForm) =>
      apiFetch('/record-types', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['record-types'] });
      setShowCreate(false);
      setCreateForm({ name: '', icon: '📋', color: '#6b665c', auto_number_enabled: false, auto_number_prefix: '', auto_number_format: 'PREFIX-YY-NNN' });
    },
  });

  const deleteType = useMutation({
    mutationFn: (id: string) => apiFetch(`/record-types/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['record-types'] });
      setSelected(null);
    },
  });

  const createField = useMutation({
    mutationFn: ({ typeId, data }: { typeId: string; data: Partial<RecordTypeField> }) =>
      apiFetch(`/record-types/${typeId}/fields`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['record-type-fields', selected?.id] }),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: 0 }}>Record Types</h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: 'var(--text, #1a1814)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)' }}
        >
          + New Record Type
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* List */}
        <div style={{ width: 260, flexShrink: 0 }}>
          {types.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>No record types yet.</p>}
          {types.map(type => (
            <div
              key={type.id}
              onClick={() => setSelected(type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, marginBottom: 4,
                background: selected?.id === type.id ? 'var(--surface2, #f0ede6)' : 'transparent',
                cursor: 'pointer', border: '1px solid transparent',
              }}
            >
              <span style={{ fontSize: 18 }}>{type.icon}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{type.name}</span>
              <button
                onClick={e => {
                  e.stopPropagation();
                  askConfirm({ title: 'Delete record type', message: `Delete "${type.name}"? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger', onConfirm: () => deleteType.mutate(type.id) });
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: 2 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ flex: 1, background: 'var(--surface, #fff)', borderRadius: 12, border: '1px solid var(--border, #e4e0d8)', padding: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, margin: '0 0 20px' }}>
              {selected.icon} {selected.name}
            </h2>

            {/* Auto-number */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Auto-Numbering</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
                <input type="checkbox" checked={selected.auto_number_enabled} readOnly />
                Enable auto-numbering
              </label>
              {selected.auto_number_enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Prefix</label>
                    <input
                      defaultValue={selected.auto_number_prefix}
                      style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, width: 100 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
                      Format <span style={{ fontWeight: 400 }}>(PREFIX, YY, YYYY, NNN, NNNN, NNNNN)</span>
                    </label>
                    <input
                      defaultValue={selected.auto_number_format}
                      style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, width: 200 }}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
                    Preview: <strong>{previewAutoNumber(selected.auto_number_prefix, selected.auto_number_format)}</strong>
                  </p>
                </div>
              )}
            </div>

            {/* Fields */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Fields</p>
                <button
                  onClick={() => createField.mutate({ typeId: selected.id, data: { label: 'New Field', field_type: 'text', is_required: false, position: fields.length } })}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}
                >
                  + Add Field
                </button>
              </div>
              {fields.map(field => (
                <div key={field.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{field.label}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 11 }}>{field.field_type}</span>
                  {field.is_required && (
                    <span style={{ fontSize: 10, background: 'var(--amber-bg, #fef3c7)', color: 'var(--amber, #92400e)', borderRadius: 4, padding: '1px 5px' }}>Required</span>
                  )}
                </div>
              ))}
              {fields.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>No fields yet.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 400, fontFamily: 'var(--font-sans)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, margin: '0 0 20px' }}>New Record Type</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Name</label>
                <input
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Enquiry"
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Icon</label>
                  <input
                    value={createForm.icon}
                    onChange={e => setCreateForm(f => ({ ...f, icon: e.target.value }))}
                    style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px', fontSize: 18, width: 52, textAlign: 'center' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Color</label>
                  <input
                    type="color"
                    value={createForm.color}
                    onChange={e => setCreateForm(f => ({ ...f, color: e.target.value }))}
                    style={{ height: 34, width: 52, border: '1px solid var(--border)', borderRadius: 6, padding: 2, cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={() => createType.mutate(createForm)}
                disabled={!createForm.name || createType.isPending}
                style={{ background: 'var(--text, #1a1814)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
              >
                {createType.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmEl}
    </div>
  );
}
