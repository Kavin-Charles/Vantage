// apps/web/components/pipeline/RecordDetail.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAlert } from '@/modules/shared/components/ui/ConfirmDialog';
import { ConversionModal } from './ConversionModal';
import { getRecordConversions, listTemplates, type EnrichedConversion } from '@/modules/pipeline/lib/conversions';

interface PipelineRecord {
  id: string;
  name: string;
  record_number: string | null;
  record_type_id: string;
  pipeline_id: string;
  stage_id: string;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  const json = await res.json() as { data: T; error: { message: string } | null };
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

export function RecordDetail({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [showConvert, setShowConvert] = useState(false);
  const { show: showAlert, el: alertEl } = useAlert();
  const [editName, setEditName] = useState<string | null>(null);

  const { data: record } = useQuery<PipelineRecord>({
    queryKey: ['record', recordId],
    queryFn: () => apiFetch(`/records/${recordId}`),
  });

  const { data: conversions = [] } = useQuery<EnrichedConversion[]>({
    queryKey: ['record-conversions', recordId],
    queryFn: () => getRecordConversions(recordId),
    enabled: !!record,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['conversion-templates', record?.record_type_id],
    queryFn: () => listTemplates({ source_type_id: record!.record_type_id }),
    enabled: !!record,
  });

  const updateRecord = useMutation({
    mutationFn: (data: Partial<PipelineRecord>) =>
      apiFetch(`/records/${recordId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['record', recordId] }); setEditName(null); },
  });

  if (!record) return null;

  const isAdmin = true; // TODO: wire to auth context when available

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 900 }} onClick={onClose} />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
        zIndex: 950, display: 'flex', flexDirection: 'column',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {/* Header */}
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {record.record_number && (
              <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 4px', fontFamily: 'monospace' }}>
                {record.record_number}
              </p>
            )}
            {editName !== null ? (
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => updateRecord.mutate({ name: editName })}
                onKeyDown={e => {
                  if (e.key === 'Enter') updateRecord.mutate({ name: editName });
                  if (e.key === 'Escape') setEditName(null);
                }}
                autoFocus
                style={{
                  fontFamily: 'Instrument Serif, serif', fontSize: 20, fontWeight: 400,
                  border: 'none', borderBottom: '2px solid var(--text)', outline: 'none',
                  width: '100%', padding: 0, background: 'transparent',
                }}
              />
            ) : (
              <h2
                onClick={() => setEditName(record.name)}
                style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, fontWeight: 400, margin: 0, cursor: 'text' }}
              >
                {record.name}
              </h2>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 22, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Convert section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
              Conversions
            </h3>
            {templates.length > 0 ? (
              <button
                onClick={() => setShowConvert(true)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
                }}
              >
                Convert…
              </button>
            ) : (
              <p style={{ color: 'var(--text3)', fontSize: 13, margin: 0 }}>
                No conversions configured.
                {isAdmin && (
                  <>
                    {' '}
                    <a href="/settings/conversions" style={{ color: 'var(--text2)', textDecoration: 'underline', fontSize: 13 }}>
                      Set up in Settings
                    </a>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Conversion history */}
          {conversions.length > 0 && (
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                Conversion History
              </h3>
              {conversions.map(conv => {
                const isSource = conv.source_record_id === recordId;
                const otherName = isSource
                  ? (conv.target_record_name ?? conv.target_record_id.slice(0, 8) + '…')
                  : (conv.source_record_name ?? conv.source_record_id.slice(0, 8) + '…');
                const otherNumber = isSource ? conv.target_record_number : conv.source_record_number;
                return (
                  <div key={conv.id} style={{ fontSize: 13, color: 'var(--text2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    {isSource ? '→' : '←'}{' '}
                    {otherNumber && (
                      <code style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', marginRight: 6 }}>
                        {otherNumber}
                      </code>
                    )}
                    {otherName}
                    <span style={{ color: 'var(--text3)', marginLeft: 8, fontSize: 11 }}>
                      {new Date(conv.converted_at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showConvert && (
        <ConversionModal
          recordId={recordId}
          recordTypeId={record.record_type_id}
          onClose={() => setShowConvert(false)}
          onConverted={newId => {
            setShowConvert(false);
            void qc.invalidateQueries({ queryKey: ['record-conversions', recordId] });
            void qc.invalidateQueries({ queryKey: ['records'] });
            showAlert(`New record created: ${newId}`, { title: 'Converted!', variant: 'success' });
          }}
        />
      )}
      {alertEl}
    </>
  );
}
