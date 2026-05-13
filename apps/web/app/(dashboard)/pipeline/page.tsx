'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DealForm } from '@/components/deals/DealForm';
import { PipelineSwitcher } from './PipelineSwitcher';
import { GroupTabs } from './GroupTabs';
import { ItemModal } from './ItemModal';
import { listDeals, updateDeal } from '@/lib/deals';
import { getPipeline } from '@/lib/pipelines';
import { useApiToken } from '@/lib/useApiToken';
import { getItemGroup, listItems, updateItem } from '@/lib/item-groups';
import type { Deal, PipelineStage, Item, GroupStage, ItemGroupWithStages } from '@vantage/types';

function fmtValue(v: number | null | undefined) {
  if (!v) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function stageColor(stage: PipelineStage | GroupStage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

// ── Deals kanban ────────────────────────────────────────────────────────────────

function DealsKanban({ pipelineId, addTrigger }: { pipelineId: string; addTrigger?: number }) {
  const qc = useQueryClient();
  const getToken = useApiToken();
  const [modal, setModal] = useState<'create' | Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (addTrigger && addTrigger > 0) setModal('create');
  }, [addTrigger]);

  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });

  const { data: dealsData } = useQuery({
    queryKey: ['deals', pipelineId],
    queryFn: () => listDeals(pipelineId),
  });

  const stageMut = useMutation({
    mutationFn: ({ id, stage_id }: { id: string; stage_id: string }) => updateDeal(id, { stage_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals', pipelineId] }),
  });

  const pipeline = pipelineData?.data;
  const stages = pipeline?.stages ?? [];
  const deals: Deal[] = dealsData?.data ?? [];

  const byStage = useCallback(
    (stageId: string) => deals.filter(d => d.stage_id === stageId),
    [deals],
  );

  const activeDeals = deals.filter(d => {
    const s = stages.find(st => st.id === d.stage_id);
    return s && !s.is_won && !s.is_lost;
  });
  const totalValue = activeDeals.reduce((s, d) => s + d.value, 0);

  return (
    <>
      {deals.length > 0 && (
        <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--text2)' }}>
          {deals.length} deals · <strong style={{ color: 'var(--text)' }}>{fmtValue(totalValue)}</strong> in pipeline
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: color + '1a', color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{stage.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{col.length}</span>
                </div>
                <button onClick={() => { setDefaultStageId(stage.id); setModal('create'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>+</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>{fmtValue(col.reduce((s, d) => s + d.value, 0))}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                {col.map(deal => (
                  <div key={deal.id} draggable onDragStart={() => setDragId(deal.id)} onClick={() => setModal(deal)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', cursor: 'grab' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{deal.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13 }}>{fmtValue(deal.value)}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{deal.probability}%</span>
                    </div>
                    {deal.close_date && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                        Close {new Date(deal.close_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'Add deal' : 'Edit deal'} onClose={() => setModal(null)}>
          <DealForm
            deal={modal === 'create' ? undefined : (modal as Deal)}
            pipelineId={pipelineId}
            stages={stages}
            defaultStageId={defaultStageId ?? stages[0]?.id ?? null}
            onDone={() => { setModal(null); void qc.invalidateQueries({ queryKey: ['deals', pipelineId] }); }}
          />
        </Modal>
      )}
    </>
  );
}

// ── Items kanban ────────────────────────────────────────────────────────────────

function ItemsKanban({ groupId, pipelineId, addTrigger }: { groupId: string; pipelineId: string; addTrigger?: number }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | Item | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (addTrigger && addTrigger > 0) { setDefaultStageId(null); setModal('create'); }
  }, [addTrigger]);

  const { data: groupData } = useQuery({
    queryKey: ['item-group', groupId],
    queryFn: async () => getItemGroup(await getToken(), groupId),
    refetchOnMount: true,
  });

  const { data: itemsData } = useQuery({
    queryKey: ['items', groupId],
    queryFn: async () => listItems(await getToken(), groupId),
  });

  const stageMut = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => updateItem(await getToken(), id, { stage_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items', groupId] }),
  });

  const group: ItemGroupWithStages | undefined = groupData?.data;
  const stages = group?.stages ?? [];
  const items: Item[] = itemsData?.data ?? [];

  const byStage = useCallback(
    (stageId: string) => items.filter(i => i.stage_id === stageId),
    [items],
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
        {stages.map(stage => {
          const col = byStage(stage.id);
          const color = stageColor(stage);
          return (
            <div key={stage.id} style={{ minWidth: 220, flexShrink: 0 }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragId) stageMut.mutate({ id: dragId, stage_id: stage.id }); setDragId(null); }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: color + '1a', color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{stage.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{col.length}</span>
                </div>
                <button onClick={() => { setDefaultStageId(stage.id); setModal('create'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                {col.map(item => (
                  <div key={item.id} draggable onDragStart={() => setDragId(item.id)} onClick={() => setModal(item)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', cursor: 'grab' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{item.title}</div>
                    {item.value != null && (
                      <div style={{ fontSize: 13 }}>{fmtValue(item.value)}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modal && group && (
        <Modal title={modal === 'create' ? `Add ${group.name.replace(/s$/, '')}` : 'Edit item'} onClose={() => setModal(null)}>
          <ItemModal
            item={modal === 'create' ? undefined : (modal as Item)}
            group={group}
            pipelineId={pipelineId}
            defaultStageId={defaultStageId ?? stages[0]?.id ?? null}
            onDone={() => { setModal(null); void qc.invalidateQueries({ queryKey: ['items', groupId] }); }}
          />
        </Modal>
      )}
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const getToken = useApiToken();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [dealsAddTrigger, setDealsAddTrigger] = useState(0);
  const [itemsAddTrigger, setItemsAddTrigger] = useState(0);

  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId!),
    enabled: !!pipelineId,
  });

  const pipeline = pipelineData?.data;
  const stages = pipeline?.stages ?? [];

  return (
    <>
      <Topbar
        left={<PipelineSwitcher value={pipelineId} onChange={id => { setPipelineId(id); setActiveGroupId(null); }} />}
        action={
          activeGroupId === null && stages.length > 0 ? (
            <Button variant="primary" onClick={() => setDealsAddTrigger(n => n + 1)}>+ Add Deal</Button>
          ) : activeGroupId !== null ? (
            <Button variant="primary" onClick={() => setItemsAddTrigger(n => n + 1)}>+ Add item</Button>
          ) : null
        }
      />
      <div style={{ padding: 24 }}>
        {pipelineId && (
          <>
            <GroupTabs pipelineId={pipelineId} activeGroupId={activeGroupId} onChange={setActiveGroupId} />
            {activeGroupId === null
              ? <DealsKanban pipelineId={pipelineId} addTrigger={dealsAddTrigger} />
              : <ItemsKanban groupId={activeGroupId} pipelineId={pipelineId} addTrigger={itemsAddTrigger} />
            }
          </>
        )}
      </div>
    </>
  );
}
