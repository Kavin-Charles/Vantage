'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listRecords } from '@/modules/pipeline/lib/records';
import { RecordDetailPanel } from './RecordDetailPanel';
import type { PipelineWithDetails, PipelineRecordWithValues } from '@vencore/types';

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

      {selectedId && (
        <RecordDetailPanel
          recordId={selectedId}
          pipeline={pipeline}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
