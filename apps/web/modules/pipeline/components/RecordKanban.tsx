'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RecordDetail } from './RecordDetail';

interface PipelineRecord { id: string; name: string; record_number: string | null; stage_id: string; }
interface Stage { id: string; name: string; color: string | null; is_won: boolean; is_lost: boolean; position: number; }
interface PipelineWithStages { id: string; name: string; stages: Stage[]; }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

function stageColor(stage: Stage) {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

export function RecordKanban({ recordTypeId, pipelineId }: { recordTypeId: string; pipelineId: string }) {
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);

  const { data: pipelineData } = useQuery<{ data: PipelineWithStages }>({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/pipelines/${pipelineId}`, { headers: { 'Content-Type': 'application/json' } });
      return res.json() as Promise<{ data: PipelineWithStages }>;
    },
  });

  const { data: records = [] } = useQuery<PipelineRecord[]>({
    queryKey: ['records', pipelineId, recordTypeId],
    queryFn: () => apiFetch(`/records?pipeline_id=${pipelineId}&record_type_id=${recordTypeId}`),
  });

  const stageMut = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      const res = await fetch(`/api/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id }),
      });
      const json = await res.json();
      if (res.status === 422) { setStageError(json?.error?.message ?? 'Required fields missing'); return null; }
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
      return json.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['records', pipelineId, recordTypeId] }),
  });

  const stages = pipelineData?.data?.stages ?? [];
  const byStage = useCallback((sid: string) => records.filter(r => r.stage_id === sid), [records]);

  return (
    <>
      {stageError && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--amber-bg, #fef3c7)', color: 'var(--amber, #92400e)', borderRadius: 8, fontSize: 13 }}>
          {stageError}
          <button onClick={() => setStageError(null)} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)' }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
        {stages.map(stage => {
          const col = byStage(stage.id);
          const color = stageColor(stage);
          return (
            <div key={stage.id} style={{ minWidth: 220, flexShrink: 0 }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragId) stageMut.mutate({ id: dragId, stage_id: stage.id }); setDragId(null); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ background: color + '1a', color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{stage.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{col.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                {col.map(record => (
                  <div key={record.id} draggable onDragStart={() => setDragId(record.id)} onClick={() => setSelectedRecordId(record.id)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', cursor: 'grab', fontFamily: 'DM Sans, sans-serif' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                    {record.record_number && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', marginBottom: 4 }}>{record.record_number}</div>
                    )}
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{record.name}</div>
                  </div>
                ))}
                {col.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
      {selectedRecordId && <RecordDetail recordId={selectedRecordId} onClose={() => setSelectedRecordId(null)} />}
    </>
  );
}
