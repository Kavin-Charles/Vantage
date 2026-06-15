'use client';
import { useState, useEffect } from 'react';
import { FieldRenderer } from '@/modules/pipeline/components/fields/FieldRenderer';
import { FieldEditor } from '@/modules/pipeline/components/fields/FieldEditor';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
  onSave: (value: unknown) => void;
}

export function TableCell({ field, value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);

  // Sync draft when value prop changes (e.g. after server update)
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <td
        style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', minWidth: 160, verticalAlign: 'top' }}
        onKeyDown={e => {
          if (e.key === 'Enter' && field.type !== 'multiselect') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      >
        <FieldEditor field={field} value={draft} onChange={setDraft} />
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          <button
            onClick={commit}
            style={{
              fontSize: 11,
              padding: '3px 10px',
              border: 'none',
              borderRadius: 6,
              background: 'var(--text)',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              transition: 'all .15s ease',
            }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              fontSize: 11,
              padding: '3px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--surface)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all .15s ease',
              color: 'var(--text2)',
            }}
          >
            Cancel
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      onDoubleClick={() => { setDraft(value); setEditing(true); }}
      title="Double-click to edit"
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        minWidth: 140,
        cursor: 'text',
        verticalAlign: 'middle',
        position: 'relative',
      }}
    >
      <FieldRenderer field={field} value={value} />
    </td>
  );
}
