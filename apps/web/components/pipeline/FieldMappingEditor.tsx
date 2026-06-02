'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listFields } from '@/lib/record-types';
import type { ConversionFieldMapping } from '@vantage/types';

type Mapping = Partial<ConversionFieldMapping>;
const BUILTINS = ['name', 'contact_id', 'company_id', 'owner_id'];

export function FieldMappingEditor({
  sourceTypeId, targetTypeId, value, onChange,
}: {
  sourceTypeId: string;
  targetTypeId: string;
  value: Mapping[];
  onChange: (m: Mapping[]) => void;
}) {
  const getToken = useApiToken();
  const { data: srcData } = useQuery({
    queryKey: ['record-type-fields', sourceTypeId],
    queryFn: async () => listFields(await getToken(), sourceTypeId),
    enabled: !!sourceTypeId,
  });
  const { data: tgtData } = useQuery({
    queryKey: ['record-type-fields', targetTypeId],
    queryFn: async () => listFields(await getToken(), targetTypeId),
    enabled: !!targetTypeId,
  });
  const srcFields = srcData?.data ?? [];
  const tgtFields = tgtData?.data ?? [];

  function update(i: number, patch: Partial<Mapping>) {
    onChange(value.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={m.source_builtin ?? m.source_field_id ?? ''}
            onChange={e => {
              const v = e.target.value;
              if (BUILTINS.includes(v)) update(i, { source_builtin: v, source_field_id: undefined });
              else update(i, { source_field_id: v, source_builtin: undefined });
            }}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">— Source —</option>
            <optgroup label="Built-in">
              {BUILTINS.map(b => <option key={b} value={b}>{b}</option>)}
            </optgroup>
            {srcFields.length > 0 && (
              <optgroup label="Custom">
                {srcFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </optgroup>
            )}
          </select>
          <span style={{ color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>→</span>
          <select
            value={m.target_builtin ?? m.target_field_id ?? ''}
            onChange={e => {
              const v = e.target.value;
              if (BUILTINS.includes(v)) update(i, { target_builtin: v, target_field_id: undefined });
              else update(i, { target_field_id: v, target_builtin: undefined });
            }}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">— Target —</option>
            <optgroup label="Built-in">
              {BUILTINS.map(b => <option key={b} value={b}>{b}</option>)}
            </optgroup>
            {tgtFields.length > 0 && (
              <optgroup label="Custom">
                {tgtFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </optgroup>
            )}
          </select>
          <button
            onClick={() => remove(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, {}])}
        style={{
          padding: '6px 12px', background: 'none',
          border: '1px dashed var(--border)', borderRadius: 8,
          cursor: 'pointer', color: 'var(--text2)', fontSize: 13,
          fontFamily: 'DM Sans, sans-serif', textAlign: 'left',
        }}
      >+ Add mapping</button>
    </div>
  );
}
