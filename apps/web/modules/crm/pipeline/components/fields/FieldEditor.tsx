'use client';
import { useState } from 'react';
import type { PipelineField } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
  onChange: (value: unknown) => void;
  users?: { id: string; name: string }[];
}

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 10,
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease',
};

function focusedStyle(): React.CSSProperties {
  return { border: '1px solid var(--text2)', boxShadow: '0 0 0 3px rgba(11,19,48,0.06)' };
}

function blurredStyle(): React.CSSProperties {
  return { border: '1px solid var(--border)', boxShadow: 'none' };
}

export function FieldEditor({ field, value, onChange, users = [] }: Props) {
  const [focused, setFocused] = useState(false);

  const inputStyle: React.CSSProperties = {
    ...baseInputStyle,
    ...(focused ? focusedStyle() : blurredStyle()),
  };

  const focusProps = {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          {...focusProps}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          style={inputStyle}
          {...focusProps}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onChange={e => onChange(e.target.value || null)}
          style={inputStyle}
          {...focusProps}
        />
      );

    case 'url':
      return (
        <input
          type="url"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          placeholder="https://"
          style={inputStyle}
          {...focusProps}
        />
      );

    case 'checkbox':
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--text)' }}
          />
          <span style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text2)' }}>
            {value ? 'Yes' : 'No'}
          </span>
        </label>
      );

    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value || null)}
          style={inputStyle}
          {...focusProps}
        >
          <option value="">— none —</option>
          {(field.options ?? []).map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'multiselect': {
      const options = field.options ?? [];
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map(opt => {
            const on = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: `1px solid ${on ? 'var(--text)' : 'var(--border)'}`,
                  background: on ? 'var(--text)' : 'var(--surface)',
                  color: on ? '#fff' : 'var(--text2)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: on ? 600 : 400,
                  transition: 'all .15s ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }

    case 'user':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value || null)}
          style={inputStyle}
          {...focusProps}
        >
          <option value="">— unassigned —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      );

    default:
      return null;
  }
}
