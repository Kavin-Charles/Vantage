'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DealForm } from '@/components/deals/DealForm';
import { PipelineSwitcher } from './PipelineSwitcher';
import { GroupTabs } from './GroupTabs';
import { ItemModal } from './ItemModal';
import { CsvImportExport } from '@/components/CsvImportExport';
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

// ── Deals List ───────────────────────────────────────────────────────────────

function DealsList({ pipelineId, addTrigger }: { pipelineId: string; addTrigger?: number }) {
  const qc = useQueryClient();
  const getToken = useApiToken();
  const [modal, setModal] = useState<'create' | Deal | null>(null);

  useEffect(() => {
    if (addTrigger && addTrigger > 0) setModal('create');
  }, [addTrigger]);

  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });

  const { data: dealsData } = useQuery({
    queryKey: ['deals', pipelineId],
    queryFn: async () => listDeals(await getToken(), pipelineId),
  });

  const pipeline = pipelineData?.data;
  const stages = pipeline?.stages ?? [];
  const deals: Deal[] = dealsData?.data ?? [];

  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]));

  const activeDeals = deals.filter(d => {
    const s = stageMap[d.stage_id];
    return s && !s.is_won && !s.is_lost;
  });
  const totalValue = activeDeals.reduce((s, d) => s + Number(d.value), 0);

  return (
    <>
      {deals.length > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
          {deals.length} items · <strong style={{ color: 'var(--text)' }}>{fmtValue(totalValue)}</strong> in pipeline
        </div>
      )}

      {deals.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', paddingTop: 24 }}>
          No items yet. Add your first item to get started.
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Stage', 'Value', 'Owner', 'Close Date'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map((deal, i) => {
                const stage = stageMap[deal.stage_id];
                return (
                  <tr
                    key={deal.id}
                    onClick={() => setModal(deal)}
                    style={{
                      borderBottom: i < deals.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>{deal.name}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {stage ? (
                        <span style={{
                          background: stageColor(stage) + '1a',
                          color: stageColor(stage),
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                        }}>{stage.name}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{fmtValue(deal.value)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{deal.owner_id ? '—' : '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>
                      {deal.close_date
                        ? new Date(deal.close_date + 'T00:00:00').toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? 'Add item' : 'Edit item'} onClose={() => setModal(null)}>
          <DealForm
            deal={modal === 'create' ? undefined : (modal as Deal)}
            pipelineId={pipelineId}
            stages={stages}
            defaultStageId={stages[0]?.id ?? null}
            onDone={() => { setModal(null); void qc.invalidateQueries({ queryKey: ['deals', pipelineId] }); }}
          />
        </Modal>
      )}
    </>
  );
}

// ── Items List ───────────────────────────────────────────────────────────────

function ItemsList({ groupId, pipelineId, addTrigger }: { groupId: string; pipelineId: string; addTrigger?: number }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | Item | null>(null);

  useEffect(() => {
    if (addTrigger && addTrigger > 0) { setModal('create'); }
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

  const group: ItemGroupWithStages | undefined = groupData?.data;
  const stages = group?.stages ?? [];
  const items: Item[] = itemsData?.data ?? [];

  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]));

  return (
    <>
      {items.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', paddingTop: 24 }}>
          No items yet. Add your first item to get started.
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Title', 'Stage', 'Value'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const stage = stageMap[item.stage_id ?? ''];
                return (
                  <tr
                    key={item.id}
                    onClick={() => setModal(item)}
                    style={{
                      borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>{item.title}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {stage ? (
                        <span style={{
                          background: stageColor(stage) + '1a',
                          color: stageColor(stage),
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                        }}>{stage.name}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>
                      {item.value != null ? fmtValue(item.value) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && group && (
        <Modal title={modal === 'create' ? `Add ${group.name.replace(/s$/, '')}` : 'Edit item'} onClose={() => setModal(null)}>
          <ItemModal
            item={modal === 'create' ? undefined : (modal as Item)}
            group={group}
            pipelineId={pipelineId}
            defaultStageId={stages[0]?.id ?? null}
            onDone={() => { setModal(null); void qc.invalidateQueries({ queryKey: ['items', groupId] }); }}
          />
        </Modal>
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [pipelineId, setPipelineId] = useState<string | null>(searchParams.get('id'));
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
          pipelineId && activeGroupId === null && stages.length > 0 ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/deals/export?pipeline_id=${pipelineId}`;
                }}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)',
                }}
              >
                Export CSV
              </button>
              <CsvImportExport
                resource="deals"
                filename="items.csv"
                exportParams={{ pipeline_id: pipelineId }}
                importExtra={{ pipeline_id: pipelineId, stage_id: stages[0]?.id ?? '' }}
                templateHeaders={['name', 'value', 'probability', 'close_date']}
                onImported={() => void qc.invalidateQueries({ queryKey: ['deals', pipelineId] })}
              />
              <Button variant="primary" onClick={() => setDealsAddTrigger(n => n + 1)}>+ Add item</Button>
            </div>
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
              ? <DealsList pipelineId={pipelineId} addTrigger={dealsAddTrigger} />
              : <ItemsList groupId={activeGroupId} pipelineId={pipelineId} addTrigger={itemsAddTrigger} />
            }
          </>
        )}
      </div>
    </>
  );
}
