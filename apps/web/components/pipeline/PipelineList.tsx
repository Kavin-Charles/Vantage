'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listRecords } from '@/lib/records';
import type { PipelineWithDetails, PipelineRecordWithValues } from '@vantage/types';

export function PipelineList({
  pipeline,
  search,
}: {
  pipeline: PipelineWithDetails;
  search: string;
}) {
  const getToken = useApiToken();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['records', pipeline.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: pipeline.id }),
  });

  const allRecords: PipelineRecordWithValues[] = data?.data ?? [];
  const stageMap = Object.fromEntries(pipeline.stages.map(s => [s.id, s]));
  const fields = pipeline.record_type?.fields ?? [];
  const valueField = fields.find(f => f.label.toLowerCase() === 'value');

  const filtered = search
    ? allRecords.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRecords;

  return (
    <>
      <div style={{ overflow: 'auto', height: '100%' }}>
        {filtered.map(record => {
          const stage = stageMap[record.stage_id];
          const fv = valueField ? record.field_values.find(v => v.field_id === valueField.id) : null;
          const val = fv
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(fv.value))
            : null;
          return (
            <div
              key={record.id}
              onClick={() => setSelectedId(record.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 24px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              {record.record_number && (
                <span style={{
                  fontSize: 11, color: 'var(--text3)', width: 80, flexShrink: 0,
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                  {record.record_number}
                </span>
              )}
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {record.name}
              </span>
              {stage && (
                <span style={{
                  padding: '3px 10px', borderRadius: 12,
                  background: `${stage.color ?? '#6366f1'}22`,
                  fontSize: 12, color: stage.color ?? 'var(--text)',
                  fontFamily: 'DM Sans, sans-serif', flexShrink: 0,
                }}>
                  {stage.name}
                </span>
              )}
              {val && (
                <span style={{
                  fontSize: 14, fontFamily: 'Instrument Serif, serif',
                  color: 'var(--text)', width: 100, textAlign: 'right', flexShrink: 0,
                }}>
                  {val}
                </span>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif', fontSize: 14,
          }}>
            No records found
          </div>
        )}
      </div>

      {/* TODO: replace with RecordDetailPanel in T7 */}
      {selectedId && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, padding: '10px 16px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Selected: {allRecords.find(r => r.id === selectedId)?.name}
          <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>
      )}
    </>
  );
}
