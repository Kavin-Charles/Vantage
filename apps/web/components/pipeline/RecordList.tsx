'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConversionModal } from './ConversionModal';
import { getRecordConversions, listTemplates, type EnrichedConversion } from '@/lib/conversions';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PipelineRecord {
  id: string;
  name: string;
  record_number: string | null;
  stage_id: string;
  owner_id: string;
  record_type_id: string;
  pipeline_id: string;
  contact_id: string | null;
  company_id: string | null;
  created_at: string;
  field_values?: FieldValue[];
}

interface FieldValue {
  id: string;
  record_id: string;
  field_id: string;
  value: unknown;
}

interface RecordTypeField {
  id: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options: string[] | null;
  is_required: boolean;
}

interface Stage {
  id: string;
  name: string;
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
}

interface PipelineWithStages {
  id: string;
  stages: Stage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  const json = await res.json() as { data: T; error: { message: string } | null };
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

function stageColor(stage: Stage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

function displayValue(val: unknown, fieldType: string): string {
  if (val == null || val === '') return '—';
  const s = String(val).replace(/^"|"$/g, ''); // strip JSON string quotes
  if (fieldType === 'date' && s) {
    try { return new Date(s + 'T00:00:00').toLocaleDateString(); } catch { return s; }
  }
  if (fieldType === 'boolean') return s === 'true' ? 'Yes' : 'No';
  return s || '—';
}

// ── Inline Card ───────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 6,
  padding: '6px 10px', fontSize: 13, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif',
  background: 'var(--surface)',
};

function RecordCard({
  record,
  stages,
  fields,
  onClose,
}: {
  record: PipelineRecord;
  stages: Stage[];
  fields: RecordTypeField[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [editName, setEditName] = useState(record.name);
  const [editStageId, setEditStageId] = useState(record.stage_id);
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [showConvert, setShowConvert] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch full record with field_values
  const { data: fullRecord } = useQuery<PipelineRecord>({
    queryKey: ['record', record.id],
    queryFn: () => apiFetch(`/records/${record.id}`),
  });

  // Conversion templates + history
  const { data: templates = [] } = useQuery({
    queryKey: ['conversion-templates', record.record_type_id],
    queryFn: () => listTemplates({ source_type_id: record.record_type_id }),
  });

  const { data: conversions = [] } = useQuery<EnrichedConversion[]>({
    queryKey: ['record-conversions', record.id],
    queryFn: () => getRecordConversions(record.id),
  });

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/records/${record.id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['record', record.id] });
      void qc.invalidateQueries({ queryKey: ['records'] });
      onClose();
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  const fieldValues = fullRecord?.field_values ?? record.field_values ?? [];
  const fvMap = new Map(fieldValues.map(fv => [fv.field_id, fv.value]));

  function getFieldDisplay(f: RecordTypeField): string {
    if (fieldEdits[f.id] !== undefined) return fieldEdits[f.id]!;
    const raw = fvMap.get(f.id);
    if (raw == null) return '';
    // node-postgres parses jsonb → JS value; strip stray JSON quotes if returned as string
    return String(raw).replace(/^"|"$/g, '');
  }

  function handleSave() {
    setSaveError(null);
    const patch: Record<string, unknown> = {};
    if (editName.trim() !== record.name) patch['name'] = editName.trim();
    if (editStageId !== record.stage_id) patch['stage_id'] = editStageId;
    if (Object.keys(fieldEdits).length > 0) patch['field_values'] = fieldEdits;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    updateMut.mutate(patch);
  }

  const currentStage = stages.find(s => s.id === editStageId);

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    margin: '0 0 10px',
  };

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg)',
      padding: '20px 20px 20px 24px',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Left: core fields + custom fields */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Record number */}
          {record.record_number && (
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 6px', fontFamily: 'monospace' }}>
              {record.record_number}
            </p>
          )}

          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label style={LABEL_STYLE}>Name</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              style={INPUT_STYLE}
            />
          </div>

          {/* Stage */}
          <div style={{ marginBottom: 20 }}>
            <label style={LABEL_STYLE}>Stage</label>
            <select
              value={editStageId}
              onChange={e => setEditStageId(e.target.value)}
              style={{ ...INPUT_STYLE, cursor: 'pointer', color: currentStage ? stageColor(currentStage) : 'inherit', fontWeight: 600 }}
            >
              {stages.map(s => (
                <option key={s.id} value={s.id} style={{ color: 'inherit', fontWeight: 'normal' }}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Custom fields */}
          {fields.length > 0 && (
            <>
              <p style={sectionLabel}>Details</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 16px', marginBottom: 20 }}>
                {fields.map(f => {
                  const val = getFieldDisplay(f);
                  return (
                    <div key={f.id}>
                      <label style={LABEL_STYLE}>{f.label}</label>
                      {f.field_type === 'select' && Array.isArray(f.options) ? (
                        <select
                          value={val}
                          onChange={e => setFieldEdits(prev => ({ ...prev, [f.id]: e.target.value }))}
                          style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                        >
                          <option value="">— select —</option>
                          {(f.options as string[]).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : f.field_type === 'boolean' ? (
                        <select
                          value={val}
                          onChange={e => setFieldEdits(prev => ({ ...prev, [f.id]: e.target.value }))}
                          style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                        >
                          <option value="">—</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                          value={val}
                          onChange={e => setFieldEdits(prev => ({ ...prev, [f.id]: e.target.value }))}
                          style={INPUT_STYLE}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Error */}
          {saveError && (
            <div style={{
              marginBottom: 10, padding: '6px 10px',
              background: 'var(--red-bg, #fee2e2)', color: 'var(--red, #991b1b)',
              borderRadius: 6, fontSize: 12,
            }}>
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              style={{
                background: 'var(--text, #1a1814)', color: '#fff',
                border: 'none', borderRadius: 7, padding: '7px 16px',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                opacity: updateMut.isPending ? 0.6 : 1,
              }}
            >
              {updateMut.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              disabled={updateMut.isPending}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 7, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                opacity: updateMut.isPending ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Right: conversions */}
        <div style={{ width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
          <p style={sectionLabel}>Convert</p>

          {templates.length > 0 ? (
            <button
              onClick={() => setShowConvert(true)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 12px', fontSize: 13,
                cursor: 'pointer', marginBottom: 16, color: 'var(--text)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'; }}
            >
              Convert…
            </button>
          ) : (
            <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 16 }}>
              No conversions configured.{' '}
              <a href="/settings/pipelines/conversions" style={{ color: 'var(--text2)', textDecoration: 'underline', fontSize: 12 }}>
                Set up in Settings
              </a>
            </p>
          )}

          {conversions.length > 0 && (
            <>
              <p style={{ ...sectionLabel, marginTop: 0 }}>History</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conversions.map(conv => {
                  const isSource = conv.source_record_id === record.id;
                  const otherName = isSource
                    ? (conv.target_record_name ?? conv.target_record_id.slice(0, 8) + '…')
                    : (conv.source_record_name ?? conv.source_record_id.slice(0, 8) + '…');
                  const otherNum = isSource ? conv.target_record_number : conv.source_record_number;
                  return (
                    <div key={conv.id} style={{ fontSize: 12, color: 'var(--text2)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      {isSource ? '→' : '←'}{' '}
                      {otherNum && <code style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', marginRight: 4 }}>{otherNum}</code>}
                      {otherName}
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text3)' }}>
                        {new Date(conv.converted_at).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {showConvert && (
        <ConversionModal
          recordId={record.id}
          recordTypeId={record.record_type_id}
          onClose={() => setShowConvert(false)}
          onConverted={newId => {
            setShowConvert(false);
            void qc.invalidateQueries({ queryKey: ['record-conversions', record.id] });
            void qc.invalidateQueries({ queryKey: ['records'] });
            alert(`Converted! New record ID: ${newId}`);
          }}
        />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RecordList({
  recordTypeId,
  pipelineId,
}: {
  recordTypeId: string;
  pipelineId: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: pipelineData } = useQuery<PipelineWithStages>({
    queryKey: ['pipeline', pipelineId],
    queryFn: () => apiFetch(`/pipelines/${pipelineId}`),
  });

  const { data: records = [], isError } = useQuery<PipelineRecord[]>({
    queryKey: ['records', pipelineId, recordTypeId],
    queryFn: () => apiFetch(`/records?pipeline_id=${pipelineId}&record_type_id=${recordTypeId}`),
  });

  const { data: fields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', recordTypeId],
    queryFn: () => apiFetch(`/record-types/${recordTypeId}/fields`),
  });

  const stages = pipelineData?.stages ?? [];
  const stageMap = new Map(stages.map(s => [s.id, s]));

  const sorted = [...records].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (isError) {
    return (
      <div style={{ padding: '10px 14px', background: 'var(--amber-bg, #fef3c7)', color: 'var(--amber, #92400e)', borderRadius: 8, fontSize: 13 }}>
        Failed to load records.
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
      {sorted.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No records
        </div>
      )}

      {sorted.map((record, i) => {
        const stage = stageMap.get(record.stage_id);
        const color = stage ? stageColor(stage) : '#6366f1';
        const isExpanded = expandedId === record.id;
        const isLast = i === sorted.length - 1;

        return (
          <div key={record.id} style={{ borderBottom: isLast && !isExpanded ? 'none' : '1px solid var(--border)' }}>
            {/* Row */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : record.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', cursor: 'pointer',
                background: isExpanded ? 'var(--bg)' : '',
              }}
              onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = ''; }}
            >
              {/* Chevron */}
              <span style={{
                fontSize: 10, color: 'var(--text3)', flexShrink: 0,
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
                display: 'inline-block',
              }}>▶</span>

              {record.record_number && (
                <code style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', minWidth: 60, flexShrink: 0 }}>
                  {record.record_number}
                </code>
              )}
              <span style={{ flex: 1, fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>
                {record.name}
              </span>
              {stage && (
                <span style={{ background: `${color}1a`, color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {stage.name}
                </span>
              )}

              {/* Field preview — show up to 2 filled fields inline */}
              {fields.slice(0, 2).map(f => {
                const fvs = (record as PipelineRecord & { field_values?: FieldValue[] }).field_values;
                const raw = fvs?.find(v => v.field_id === f.id)?.value;
                if (!raw) return null;
                const display = displayValue(raw, f.field_type);
                if (display === '—') return null;
                return (
                  <span key={f.id} style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', display: 'none' }}>
                    {f.label}: {display}
                  </span>
                );
              })}

              <span style={{
                background: 'var(--surface2)', borderRadius: '50%', width: 24, height: 24,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
              }}>
                {record.owner_id[0]?.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 70, textAlign: 'right', flexShrink: 0 }}>
                {relDate(record.created_at)}
              </span>
            </div>

            {/* Inline card */}
            {isExpanded && (
              <RecordCard
                record={record}
                stages={stages}
                fields={fields}
                onClose={() => setExpandedId(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
