'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { DealDetailCard } from '@/components/deals/DealDetailCard';
import { DealForm } from '@/components/deals/DealForm';
import { getPipeline } from '@/lib/pipelines';
import { listDeals, updateDeal } from '@/lib/deals';
import { apiFetch } from '@/lib/api';
import { useApiToken } from '@/lib/useApiToken';
import type { Deal, PipelineStage, StageField } from '@vantage/types';

type StageWithFields = PipelineStage & { fields: StageField[] };
interface WorkspaceUser { id: string; name: string; }

function fmtValue(v: number | null | undefined) {
  if (!v) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

function stageColor(stage: PipelineStage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

export function DealKanban({
  pipelineId,
  addTrigger,
}: {
  pipelineId: string;
  addTrigger?: number;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  useEffect(() => {
    if (addTrigger && addTrigger > 0) setCreateModal(true);
  }, [addTrigger]);

  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });

  const { data: dealsData } = useQuery({
    queryKey: ['deals', pipelineId],
    queryFn: async () => listDeals(await getToken(), pipelineId),
  });

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () =>
      apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
  });

  const stageMut = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) =>
      updateDeal(await getToken(), id, { stage_id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['deals', pipelineId] }),
    onError: (err: Error) => setStageError(err.message ?? 'Failed to move deal'),
  });

  const pipeline = pipelineData?.data;
  const stages = (pipeline?.stages ?? []) as StageWithFields[];
  const activeStages = stages.filter(s => !s.is_won && !s.is_lost);
  const deals: Deal[] = dealsData?.data ?? [];
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]));
  const userMap = Object.fromEntries((usersData?.data ?? []).map(u => [u.id, u.name]));
  const selectedDeal = selectedDealId ? deals.find(d => d.id === selectedDealId) : null;

  return (
    <>
      {stageError && (
        <div style={{
          marginBottom: 12, padding: '10px 14px',
          background: 'var(--amber-bg)', color: 'var(--amber)',
          borderRadius: 8, fontSize: 13,
        }}>
          {stageError}
          <button
            onClick={() => setStageError(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)' }}
          >✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
        {activeStages.map(stage => {
          const col = deals.filter(d => d.stage_id === stage.id);
          const colValue = col.reduce((s, d) => s + Number(d.value), 0);
          const color = stageColor(stage);

          return (
            <div
              key={stage.id}
              style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 8 }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragId) stageMut.mutate({ id: dragId, stage_id: stage.id });
                setDragId(null);
              }}
            >
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', flex: 1 }}>{stage.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{col.length}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', paddingLeft: 16, marginTop: -6 }}>
                {fmtValue(colValue)}
              </div>

              {/* Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 60 }}>
                {col.length === 0 && (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                    Empty
                  </div>
                )}
                {col.map(deal => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => setDragId(deal.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setSelectedDealId(deal.id)}
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '12px 14px',
                      cursor: 'grab', transition: 'box-shadow .15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
                      {deal.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtValue(deal.value)}
                    </div>
                    {deal.close_date && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                        Close {new Date(deal.close_date + 'T00:00:00').toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Deal detail modal */}
      {selectedDeal && (
        <Modal title={selectedDeal.name} onClose={() => setSelectedDealId(null)}>
          <DealDetailCard
            deal={selectedDeal}
            stages={stages}
            stageMap={stageMap}
            userMap={userMap}
            pipelineId={pipelineId}
            contactId={selectedDeal.contact_id ?? undefined}
            onDone={() => {
              setSelectedDealId(null);
              void qc.invalidateQueries({ queryKey: ['deals', pipelineId] });
            }}
          />
        </Modal>
      )}

      {/* Create modal */}
      {createModal && (
        <Modal title="Add item" onClose={() => setCreateModal(false)}>
          <DealForm
            pipelineId={pipelineId}
            stages={stages}
            defaultStageId={activeStages[0]?.id ?? null}
            onDone={() => {
              setCreateModal(false);
              void qc.invalidateQueries({ queryKey: ['deals', pipelineId] });
            }}
          />
        </Modal>
      )}
    </>
  );
}
