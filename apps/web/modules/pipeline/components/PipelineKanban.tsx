'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listRecords, updateRecord } from '@/modules/pipeline/lib/records';
import { apiFetch } from '@/modules/shared/lib/api';
import { RecordCard } from './RecordCard';
import { RecordDetailPanel } from './RecordDetailPanel';
import { RecordForm } from './RecordForm';
import type { PipelineWithDetails, PipelineRecordWithValues, RecordTypeField } from '@vantage/types';

interface WorkspaceUser { id: string; name: string; }

export function PipelineKanban({
  pipeline,
  search,
  addTrigger,
}: {
  pipeline: PipelineWithDetails;
  search: string;
  addTrigger: number;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (addTrigger > 0) {
      const firstActive = pipeline.stages.find(s => !s.is_won && !s.is_lost);
      setCreateStageId(firstActive?.id ?? null);
    }
  }, [addTrigger, pipeline.stages]);

  const { data: recordsData } = useQuery({
    queryKey: ['records', pipeline.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: pipeline.id }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () => apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) =>
      updateRecord(await getToken(), id, { stage_id }),
    onMutate: async ({ id, stage_id }) => {
      await qc.cancelQueries({ queryKey: ['records', pipeline.id] });
      const prev = qc.getQueryData(['records', pipeline.id]);
      qc.setQueryData(['records', pipeline.id], (old: any) => old
        ? { ...old, data: old.data.map((r: PipelineRecordWithValues) => r.id === id ? { ...r, stage_id } : r) }
        : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      qc.setQueryData(['records', pipeline.id], ctx?.prev);
      setError('Failed to move record');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['records', pipeline.id] }),
  });

  const allRecords: PipelineRecordWithValues[] = recordsData?.data ?? [];
  const filtered = search
    ? allRecords.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRecords;

  const users = usersData?.data ?? [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  const fields: RecordTypeField[] = pipeline.record_type?.fields ?? [];
  const valueField = fields.find(f => f.label.toLowerCase() === 'value' && f.field_type === 'number');

  const activeStages = pipeline.stages.filter(s => !s.is_won && !s.is_lost);
  const closedStages = pipeline.stages.filter(s => s.is_won || s.is_lost);

  function stageTotal(stageId: string): string | null {
    if (!valueField) return null;
    const total = filtered
      .filter(r => r.stage_id === stageId)
      .reduce((sum, r) => {
        const fv = r.field_values.find(v => v.field_id === valueField.id);
        return sum + (fv ? Number(fv.value) : 0);
      }, 0);
    if (total === 0) return null;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total);
  }

  return (
    <>
      {error && (
        <div style={{
          margin: '12px 24px', padding: '10px 14px',
          background: 'var(--amber-bg)', color: 'var(--amber)',
          borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: 16 }}>×</button>
        </div>
      )}
      <div style={{
        display: 'flex', gap: 12, padding: '16px 24px',
        overflowX: 'auto', height: '100%', alignItems: 'flex-start',
        boxSizing: 'border-box',
      }}>
        {activeStages.map(stage => {
          const cards = filtered.filter(r => r.stage_id === stage.id);
          const total = stageTotal(stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== stage.id) {
                  moveMut.mutate({ id: dragId, stage_id: stage.id });
                }
                setDragId(null);
              }}
              style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px', marginBottom: 4 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: stage.color ?? '#6366f1', flexShrink: 0,
                }} />
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 600,
                  color: 'var(--text)', fontFamily: 'DM Sans, sans-serif',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{stage.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>
                  {cards.length}
                </span>
                {total && (
                  <span style={{ fontSize: 12, fontFamily: 'Instrument Serif, serif', color: 'var(--text2)' }}>
                    {total}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                {cards.map(record => (
                  <div
                    key={record.id}
                    draggable
                    onDragStart={() => setDragId(record.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <RecordCard
                      record={record}
                      fields={fields}
                      ownerName={userMap[record.owner_id]}
                      onClick={() => setSelectedId(record.id)}
                      dragging={dragId === record.id}
                    />
                  </div>
                ))}
              </div>

              {/* Add in column */}
              <button
                onClick={() => setCreateStageId(stage.id)}
                style={{
                  padding: '8px', background: 'none',
                  border: '1px dashed var(--border)', borderRadius: 8,
                  cursor: 'pointer', color: 'var(--text3)', fontSize: 13,
                  fontFamily: 'DM Sans, sans-serif', textAlign: 'left',
                }}
              >+ Add</button>
            </div>
          );
        })}

        {/* Won/Lost summary */}
        {closedStages.length > 0 && (
          <div style={{ flex: '0 0 160px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {closedStages.map(stage => {
              const cnt = filtered.filter(r => r.stage_id === stage.id).length;
              const total = stageTotal(stage.id);
              const isWon = stage.is_won;
              return (
                <div key={stage.id} style={{
                  padding: '12px 14px',
                  background: isWon ? 'var(--green-bg)' : 'var(--red-bg)',
                  borderRadius: 10,
                }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: isWon ? 'var(--green)' : 'var(--red)',
                    fontFamily: 'DM Sans, sans-serif', marginBottom: 4,
                  }}>{stage.name}</div>
                  <div style={{
                    fontSize: 20, fontFamily: 'Instrument Serif, serif',
                    color: isWon ? 'var(--green)' : 'var(--red)',
                  }}>{cnt}</div>
                  {total && (
                    <div style={{
                      fontSize: 12, color: isWon ? 'var(--green)' : 'var(--red)',
                      fontFamily: 'DM Sans, sans-serif', marginTop: 2,
                    }}>{total}</div>
                  )}
                </div>
              );
            })}
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

      {createStageId && (
        <RecordForm
          pipeline={pipeline}
          defaultStageId={createStageId}
          onClose={() => setCreateStageId(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['records', pipeline.id] });
            setCreateStageId(null);
          }}
        />
      )}
    </>
  );
}
