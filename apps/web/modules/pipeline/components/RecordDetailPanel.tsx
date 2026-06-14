'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRecord, updateRecord, deleteRecord } from '@/modules/pipeline/lib/records';
import { listConversions } from '@/modules/pipeline/lib/record-types';
import { ConversionWizard } from './ConversionWizard';
import { PluginPanelSlot } from '@/modules/shared/components/PluginPanelSlot';
import type { PipelineWithDetails, PipelineRecordWithValues, RecordTypeField } from '@vencore/types';

interface Props {
  recordId: string;
  pipeline: PipelineWithDetails;
  onClose: () => void;
}

export function RecordDetailPanel({ recordId, pipeline, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['record', recordId],
    queryFn: async () => getRecord(await getToken(), recordId),
  });

  const record: PipelineRecordWithValues | undefined = data?.data;

  const { data: conversionsData } = useQuery({
    queryKey: ['conversions', pipeline.record_type?.id],
    queryFn: async () => listConversions(await getToken(), pipeline.record_type!.id),
    enabled: !!pipeline.record_type,
  });

  const conversions = conversionsData?.data ?? [];
  const fields: RecordTypeField[] = pipeline.record_type?.fields ?? [];

  const [name, setName] = useState('');
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (record) setName(record.name);
  }, [record]);

  const saveMut = useMutation({
    mutationFn: async (body: Parameters<typeof updateRecord>[2]) =>
      updateRecord(await getToken(), recordId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record', recordId] });
      qc.invalidateQueries({ queryKey: ['records', pipeline.id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => deleteRecord(await getToken(), recordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records', pipeline.id] });
      onClose();
    },
  });

  function getFieldValue(fieldId: string): string {
    if (!record) return '';
    const fv = record.field_values.find(v => v.field_id === fieldId);
    return fv ? String(fv.value ?? '') : '';
  }

  function handleFieldBlur(fieldId: string, value: unknown) {
    saveMut.mutate({ field_values: { [fieldId]: value } });
  }

  if (!record) return null;

  const backdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(26,24,20,0.25)',
  };

  const panelStyle: React.CSSProperties = {
    position: 'fixed', top: 0, right: 0, bottom: 0,
    width: 480, zIndex: 101,
    background: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-sans)',
    boxShadow: '-4px 0 24px rgba(26,24,20,0.08)',
  };

  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      {wizardTemplateId && record && (
        <ConversionWizard
          record={record}
          templateId={wizardTemplateId}
          templates={conversions}
          onClose={() => setWizardTemplateId(null)}
          onSuccess={() => {
            setWizardTemplateId(null);
            qc.invalidateQueries({ queryKey: ['records'] });
            onClose();
          }}
        />
      )}
      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => { if (name !== record.name) saveMut.mutate({ name }); }}
              style={{
                flex: 1, fontSize: 18, fontFamily: 'var(--font-display)',
                fontWeight: 400, color: 'var(--text)',
                border: 'none', outline: 'none', background: 'transparent',
                padding: 0, lineHeight: 1.3,
              }}
            />
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', fontSize: 20, lineHeight: 1,
                padding: '0 0 0 4px', flexShrink: 0,
              }}
            >×</button>
          </div>

          {/* Stage selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', width: 80, flexShrink: 0 }}>Stage</span>
            <select
              value={record.stage_id}
              onChange={e => saveMut.mutate({ stage_id: e.target.value })}
              style={{
                fontSize: 13, color: 'var(--text)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 8px', background: 'var(--surface)',
                fontFamily: 'var(--font-sans)', cursor: 'pointer',
              }}
            >
              {pipeline.stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Fields */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(field => (
            <FieldRow key={field.id} field={field} value={getFieldValue(field.id)} onBlur={handleFieldBlur} />
          ))}
          {pipeline.record_type && (
            <PluginPanelSlot
              recordType={pipeline.record_type.name.toLowerCase()}
              recordId={recordId}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {conversions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {conversions.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => setWizardTemplateId(tpl.id)}
                  style={{
                    fontSize: 13, padding: '6px 14px',
                    background: 'var(--blue-bg)', color: 'var(--blue)',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', fontWeight: 500,
                  }}
                >
                  Convert → {tpl.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              if (window.confirm('Delete this record? This cannot be undone.')) {
                deleteMut.mutate();
              }
            }}
            style={{
              fontSize: 13, padding: '6px 14px',
              background: 'var(--red-bg)', color: 'var(--red)',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontWeight: 500,
              alignSelf: 'flex-start',
            }}
          >
            Delete record
          </button>
        </div>
      </div>
    </>
  );
}

function FieldRow({
  field,
  value,
  onBlur,
}: {
  field: RecordTypeField;
  value: string;
  onBlur: (fieldId: string, value: unknown) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--text3)',
    width: 80, flexShrink: 0, paddingTop: 2,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, fontSize: 13, color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 6,
    padding: '5px 9px', background: 'var(--surface)',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={labelStyle}>{field.label}</span>
      {field.field_type === 'boolean' ? (
        <input
          type="checkbox"
          checked={local === 'true'}
          onChange={e => {
            const v = String(e.target.checked);
            setLocal(v);
            onBlur(field.id, e.target.checked);
          }}
          style={{ marginTop: 3, cursor: 'pointer' }}
        />
      ) : field.field_type === 'select' && field.options ? (
        <select
          value={local}
          onChange={e => {
            setLocal(e.target.value);
            onBlur(field.id, e.target.value);
          }}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">—</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => {
            const val = field.field_type === 'number' ? Number(local) : local;
            onBlur(field.id, val);
          }}
          style={inputStyle}
        />
      )}
    </div>
  );
}
