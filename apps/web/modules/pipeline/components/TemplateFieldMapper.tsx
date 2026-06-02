// apps/web/components/pipeline/TemplateFieldMapper.tsx
'use client';

import { useState } from 'react';
import type { RawFieldMapping } from '@/lib/conversions';

export interface MappableField {
  id: string;
  label: string;
  isBuiltin?: boolean;
}

interface Props {
  sourceFields: MappableField[];
  targetFields: MappableField[];
  mappings: RawFieldMapping[];
  onChange: (mappings: RawFieldMapping[]) => void;
}

const SOURCE_BUILTINS: MappableField[] = [
  { id: '__name', label: 'Name', isBuiltin: true },
  { id: '__contact_id', label: 'Contact', isBuiltin: true },
  { id: '__company_id', label: 'Company', isBuiltin: true },
  { id: '__owner_id', label: 'Owner', isBuiltin: true },
];

const TARGET_BUILTINS: MappableField[] = [
  { id: '__name', label: 'Name', isBuiltin: true },
  { id: '__contact_id', label: 'Contact', isBuiltin: true },
  { id: '__company_id', label: 'Company', isBuiltin: true },
  { id: '__owner_id', label: 'Owner', isBuiltin: true },
];

function fieldKey(f: MappableField): string {
  return f.isBuiltin ? `builtin:${f.id.replace('__', '')}` : `field:${f.id}`;
}

function mappingKey(m: RawFieldMapping): string {
  const src = m.source_builtin ? `builtin:${m.source_builtin}` : `field:${m.source_field_id}`;
  const tgt = m.target_builtin ? `builtin:${m.target_builtin}` : `field:${m.target_field_id}`;
  return `${src}→${tgt}`;
}

function isMapped(m: RawFieldMapping, field: MappableField, side: 'source' | 'target'): boolean {
  if (side === 'source') {
    if (field.isBuiltin) return m.source_builtin === field.id.replace('__', '');
    return m.source_field_id === field.id;
  }
  if (field.isBuiltin) return m.target_builtin === field.id.replace('__', '');
  return m.target_field_id === field.id;
}

export function TemplateFieldMapper({ sourceFields, targetFields, mappings, onChange }: Props) {
  const [pendingSourceKey, setPendingSourceKey] = useState<string | null>(null);

  const allSources = [...SOURCE_BUILTINS, ...sourceFields];
  const allTargets = [...TARGET_BUILTINS, ...targetFields];

  function handleSourceClick(field: MappableField) {
    const key = fieldKey(field);
    setPendingSourceKey(prev => (prev === key ? null : key));
  }

  function handleTargetClick(targetField: MappableField) {
    if (!pendingSourceKey) return;

    const sourceField = allSources.find(f => fieldKey(f) === pendingSourceKey);
    if (!sourceField) return;

    const newMapping: RawFieldMapping = {
      source_field_id: sourceField.isBuiltin ? null : sourceField.id,
      source_builtin: sourceField.isBuiltin ? sourceField.id.replace('__', '') : null,
      target_field_id: targetField.isBuiltin ? null : targetField.id,
      target_builtin: targetField.isBuiltin ? targetField.id.replace('__', '') : null,
    };

    // Prevent duplicate target mappings (each target can only be mapped once)
    const filtered = mappings.filter(m => !isMapped(m, targetField, 'target'));
    onChange([...filtered, newMapping]);
    setPendingSourceKey(null);
  }

  function removeMapping(idx: number) {
    onChange(mappings.filter((_, i) => i !== idx));
  }

  function fieldLabel(m: RawFieldMapping, side: 'source' | 'target'): string {
    if (side === 'source') {
      if (m.source_builtin) {
        return SOURCE_BUILTINS.find(f => f.id === `__${m.source_builtin}`)?.label ?? m.source_builtin;
      }
      return sourceFields.find(f => f.id === m.source_field_id)?.label ?? (m.source_field_id ?? '');
    }
    if (m.target_builtin) {
      return TARGET_BUILTINS.find(f => f.id === `__${m.target_builtin}`)?.label ?? m.target_builtin;
    }
    return targetFields.find(f => f.id === m.target_field_id)?.label ?? (m.target_field_id ?? '');
  }

  const colStyle: React.CSSProperties = {
    flex: 1, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
  };
  const cellStyle = (active: boolean, mapped: boolean): React.CSSProperties => ({
    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    background: active ? 'var(--blue-bg, #dbeafe)' : mapped ? 'var(--surface2)' : 'transparent',
    color: active ? 'var(--blue, #1e3a8a)' : 'var(--text)',
    userSelect: 'none',
  });

  return (
    <div>
      {pendingSourceKey && (
        <p style={{ fontSize: 12, color: 'var(--blue, #1e3a8a)', marginBottom: 8 }}>
          Select a target field to map to ↓
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {/* Source fields */}
        <div style={colStyle}>
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            Source Fields
          </div>
          {allSources.map(f => {
            const key = fieldKey(f);
            const active = pendingSourceKey === key;
            const mapped = mappings.some(m => isMapped(m, f, 'source'));
            return (
              <div
                key={key}
                onClick={() => handleSourceClick(f)}
                style={cellStyle(active, mapped)}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = active ? 'var(--blue-bg, #dbeafe)' : mapped ? 'var(--surface2)' : 'transparent'; }}
              >
                {f.isBuiltin && <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 4 }}>built-in</span>}
                {f.label}
              </div>
            );
          })}
        </div>

        {/* Target fields */}
        <div style={colStyle}>
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            Target Fields
          </div>
          {allTargets.map(f => {
            const key = fieldKey(f);
            const mapped = mappings.some(m => isMapped(m, f, 'target'));
            return (
              <div
                key={key}
                onClick={() => pendingSourceKey && handleTargetClick(f)}
                style={{
                  ...cellStyle(false, mapped),
                  cursor: pendingSourceKey ? 'pointer' : 'default',
                  opacity: pendingSourceKey && mapped ? 0.5 : 1,
                }}
              >
                {f.isBuiltin && <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 4 }}>built-in</span>}
                {f.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mapping pairs */}
      {mappings.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Mapped pairs
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mappings.map((m, i) => (
              <div key={mappingKey(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}>
                <span style={{ flex: 1 }}>{fieldLabel(m, 'source')}</span>
                <span style={{ color: 'var(--text3)' }}>→</span>
                <span style={{ flex: 1 }}>{fieldLabel(m, 'target')}</span>
                <button
                  onClick={() => removeMapping(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mappings.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
          Click a source field, then a target field to create a mapping.
        </p>
      )}
    </div>
  );
}
