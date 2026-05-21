'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordDetail } from './RecordDetail';

interface PipelineRecord {
  id: string;
  name: string;
  record_number: string | null;
  stage_id: string;
  owner_id: string;
  created_at: string;
}

interface Stage { id: string; name: string; color: string | null; is_won: boolean; is_lost: boolean; }
interface PipelineWithStages { id: string; stages: Stage[]; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json();
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

export function RecordList({
  recordTypeId,
  pipelineId,
}: {
  recordTypeId: string;
  pipelineId: string;
}) {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const { data: pipelineData } = useQuery<PipelineWithStages>({
    queryKey: ['pipeline', pipelineId],
    queryFn: () => apiFetch(`/pipelines/${pipelineId}`),
  });

  const { data: records = [], isError } = useQuery<PipelineRecord[]>({
    queryKey: ['records', pipelineId, recordTypeId],
    queryFn: () => apiFetch(`/records?pipeline_id=${pipelineId}&record_type_id=${recordTypeId}`),
  });

  const stageMap = new Map((pipelineData?.stages ?? []).map(s => [s.id, s]));

  // Sort created_at desc (API already returns desc; sort defensively)
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
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
        {sorted.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No records
          </div>
        )}
        {sorted.map(record => {
          const stage = stageMap.get(record.stage_id);
          const color = stage ? stageColor(stage) : '#6366f1';
          return (
            <div
              key={record.id}
              onClick={() => setSelectedRecordId(record.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
            >
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
          );
        })}
      </div>
      {selectedRecordId && (
        <RecordDetail recordId={selectedRecordId} onClose={() => setSelectedRecordId(null)} />
      )}
    </>
  );
}
