'use client';

import type { CustomField } from '@/modules/projects/lib/api';

interface Props {
  field: CustomField;
  value: string | null;
  onChange: (value: string | number | boolean | null) => void;
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13,
  padding: '6px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};

export function CustomFieldRenderer({ field, value, onChange }: Props) {
  if (field.field_type === 'CHECKBOX') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)' }}>
          {value === 'true' ? 'Yes' : 'No'}
        </span>
      </label>
    );
  }

  if (field.field_type === 'SELECT') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="">—</option>
        {(field.options ?? []).map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.field_type === 'NUMBER') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={inputStyle}
      />
    );
  }

  if (field.field_type === 'DATE') {
    return (
      <input
        type="date"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        style={inputStyle}
      />
    );
  }

  if (field.field_type === 'URL') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="url"
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          placeholder="https://…"
          style={inputStyle}
        />
        {value && (
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontFamily: 'DM Sans', fontSize: 12, flexShrink: 0 }}>
            Open
          </a>
        )}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      style={inputStyle}
    />
  );
}
