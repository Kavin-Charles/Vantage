'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type CustomField } from '@/modules/projects/lib/api';
import { Icon } from '@/modules/shared/components/ui/Icon';

const FIELD_TYPES: CustomField['field_type'][] = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'URL'];

const inputStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13,
  padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};

interface Props {
  projectId: string;
}

export function CustomFieldsManager({ projectId }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: async () => pmApi.listCustomFields(await getToken(), projectId),
  });
  const fields: CustomField[] = data?.data ?? [];

  const [name, setName] = useState('');
  const [type, setType] = useState<CustomField['field_type']>('TEXT');
  const [optionsText, setOptionsText] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const options = type === 'SELECT'
        ? optionsText.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;
      return pmApi.createCustomField(token, projectId, { name: name.trim(), field_type: type, options });
    },
    onSuccess: () => {
      setName('');
      setOptionsText('');
      void qc.invalidateQueries({ queryKey: ['custom-fields', projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const token = await getToken();
      return pmApi.deleteCustomField(token, projectId, fieldId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['custom-fields', projectId] }),
  });

  const canCreate = name.trim().length > 0 && fields.length < 20 &&
    (type !== 'SELECT' || optionsText.trim().length > 0);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 16 }}>
      <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
        Custom Fields
      </p>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
        Track extra task data — budget codes, ticket IDs, anything specific to this project. {fields.length}/20 fields.
      </p>

      {fields.length === 0 && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 16, fontStyle: 'italic' }}>
          No custom fields yet.
        </div>
      )}

      {fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {fields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{f.name}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text2)' }}>
                {f.field_type}
              </span>
              <button
                onClick={() => deleteMutation.mutate(f.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: '0 2px', opacity: 0.7 }}
                title="Delete field"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Field name…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <select value={type} onChange={e => setType(e.target.value as CustomField['field_type'])} style={{ ...inputStyle, width: 120, cursor: 'pointer' }}>
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {type === 'SELECT' && (
          <input
            value={optionsText}
            onChange={e => setOptionsText(e.target.value)}
            placeholder="Options, comma-separated…"
            style={inputStyle}
          />
        )}
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={!canCreate || createMutation.isPending}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
            opacity: !canCreate ? 0.5 : 1, alignSelf: 'flex-start',
          }}
        >
          {createMutation.isPending ? '…' : 'Add Field'}
        </button>
      </div>
      {createMutation.isError && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: '8px 0 0' }}>Failed to create field.</p>
      )}
    </div>
  );
}
