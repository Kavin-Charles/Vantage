'use client';
import { useState } from 'react';
import { FieldRenderer } from '@/modules/crm/pipeline/components/fields/FieldRenderer';
import { FieldEditor } from '@/modules/crm/pipeline/components/fields/FieldEditor';
import type { PipelineField } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
  onSave: (value: unknown) => void;
}

export function ItemDetailField({ field, value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);
  const [hovered, setHovered] = useState(false);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        color: 'var(--text3)',
        fontFamily: 'var(--font-sans)',
        marginBottom: 6,
      }}>
        {field.label}
      </div>

      {editing ? (
        <div>
          <FieldEditor field={field} value={draft} onChange={setDraft} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={commit}
              style={{
                fontSize: 12,
                padding: '5px 14px',
                border: 'none',
                borderRadius: 8,
                background: 'var(--text)',
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                transition: 'all .15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1a2244'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--text)'; }}
            >
              Save
            </button>
            <button
              onClick={() => { setDraft(value); setEditing(false); }}
              style={{
                fontSize: 12,
                padding: '5px 14px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text2)',
                transition: 'all .15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => { setDraft(value); setEditing(true); }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            cursor: 'text',
            minHeight: 32,
            border: `1px solid ${hovered ? 'var(--border)' : 'transparent'}`,
            background: hovered ? 'var(--surface2)' : 'transparent',
            transition: 'all .15s ease',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <FieldRenderer field={field} value={value} />
        </div>
      )}
    </div>
  );
}
