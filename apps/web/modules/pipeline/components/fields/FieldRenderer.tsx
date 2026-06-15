'use client';
import { formatFieldValue } from '@/modules/pipeline/lib/field-types';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  field: PipelineField;
  value: unknown;
}

export function FieldRenderer({ field, value }: Props) {
  if (field.type === 'checkbox') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: 4,
        border: `1px solid ${value ? 'var(--text)' : 'var(--border)'}`,
        background: value ? 'var(--text)' : 'transparent',
        color: '#fff',
        fontSize: 10,
      }}>
        {value ? '✓' : ''}
      </span>
    );
  }

  if (field.type === 'url' && value && typeof value === 'string') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          color: 'var(--blue, #1e3a8a)',
          textDecoration: 'none',
          fontSize: 13,
          fontFamily: 'var(--font-sans)',
          transition: 'opacity .15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
      >
        {value}
      </a>
    );
  }

  if (field.type === 'select' || field.type === 'multiselect') {
    const vals =
      field.type === 'multiselect' && Array.isArray(value)
        ? (value as string[])
        : value
        ? [value as string]
        : [];
    if (vals.length === 0)
      return (
        <span style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text3)' }}>
          —
        </span>
      );
    return (
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {vals.map(v => {
          const opt = field.options?.find(o => o.value === v);
          return (
            <span
              key={v}
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--surface2)',
                color: 'var(--text2)',
              }}
            >
              {opt?.label ?? v}
            </span>
          );
        })}
      </span>
    );
  }

  const isEmpty = value === null || value === undefined || value === '';
  return (
    <span
      style={{
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
        color: isEmpty ? 'var(--text3)' : 'var(--text)',
      }}
    >
      {formatFieldValue(value, field.type, field.options ?? undefined)}
    </span>
  );
}
