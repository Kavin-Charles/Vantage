'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { DealForm } from '@/components/deals/DealForm';
import { StagePill } from '@/components/deals/StagePill';
import { PipelineSwitcher } from '../PipelineSwitcher';
import { GroupTabs } from '../GroupTabs';
import { ItemModal } from '../ItemModal';
import { CsvImportExport } from '@/components/CsvImportExport';
import { RecordList } from '@/components/pipeline/RecordList';
import { RecordKanban } from '@/components/pipeline/RecordKanban';
import { DealKanban } from '@/components/pipeline/DealKanban';
import { listDeals } from '@/lib/deals';
import { getPipeline } from '@/lib/pipelines';
import { getItemGroup, listItems } from '@/lib/item-groups';
import { apiFetch } from '@/lib/api';
import { useApiToken } from '@/lib/useApiToken';
import type { Deal, PipelineStage, Item, GroupStage, ItemGroupWithStages } from '@vantage/types';

interface WorkspaceUser { id: string; name: string; }


function fmtValue(v: number | null | undefined) {
  if (!v) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function stageColor(stage: PipelineStage | GroupStage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

// ── View Toggle ──────────────────────────────────────────────────────────────

const VIEW_OPTS = [
  { id: 'list'  as const, label: 'List',  icon: 'tasks'    },
  { id: 'board' as const, label: 'Board', icon: 'pipeline' },
];

function ViewToggle({ value, onChange }: { value: 'list' | 'board'; onChange: (v: 'list' | 'board') => void }) {
  return (
    <div style={{
      display: 'inline-flex', gap: 0,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 2,
    }}>
      {VIEW_OPTS.map(opt => {
        const on = value === opt.id;
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8, border: 'none',
            background: on ? 'var(--surface)' : 'transparent',
            color: on ? 'var(--text)' : 'var(--text2)',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
            boxShadow: on ? '0 1px 2px rgba(0,0,0,.04)' : 'none',
            transition: 'all .15s',
          }}>
            <Icon name={opt.icon} size={14} /> {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Deals List ───────────────────────────────────────────────────────────────

function DealsList({ pipelineId, addTrigger, view }: { pipelineId: string; addTrigger?: number; view: 'list' | 'board' }) {
  const qc = useQueryClient();
  const getToken = useApiToken();
  const [createModal, setCreateModal] = useState(false);

  useEffect(() => {
    if (addTrigger && addTrigger > 0 && view !== 'board') setCreateModal(true);
  }, [addTrigger, view]);

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
    queryFn: async () => apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
  });

  const pipeline = pipelineData?.data;
  const stages = pipeline?.stages ?? [];
  const deals: Deal[] = dealsData?.data ?? [];
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]));
  const userMap = Object.fromEntries((usersData?.data ?? []).map(u => [u.id, u.name]));

  const activeDeals = deals.filter(d => {
    const s = d.stage_id ? stageMap[d.stage_id] : undefined;
    return s && !s.is_won && !s.is_lost;
  });
  const totalValue = activeDeals.reduce((s, d) => s + Number(d.value), 0);

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {deals.length} items · <strong style={{ color: 'var(--text)' }}>{fmtValue(totalValue)}</strong> in pipeline
        </div>
      </div>

      {deals.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, paddingTop: 24 }}>
          No items yet. Add your first item to get started.
        </div>
      ) : view === 'board' ? (
        <DealKanban pipelineId={pipelineId} addTrigger={addTrigger} />
      ) : (
        <DealGrid deals={deals} stageMap={stageMap} userMap={userMap} />
      )}

      {view !== 'board' && createModal && (
        <Modal title="Add item" onClose={() => setCreateModal(false)}>
          <DealForm
            pipelineId={pipelineId}
            stages={stages}
            defaultStageId={stages[0]?.id ?? null}
            onDone={() => { setCreateModal(false); void qc.invalidateQueries({ queryKey: ['deals', pipelineId] }); }}
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
    if (addTrigger && addTrigger > 0) setModal('create');
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
        <div style={{ color: 'var(--text3)', fontSize: 13, paddingTop: 24 }}>
          No items yet. Add your first item to get started.
        </div>
      ) : (
        <ItemGrid items={items} stageMap={stageMap} onEdit={item => setModal(item)} />
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
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [dealsAddTrigger, setDealsAddTrigger] = useState(0);
  const [itemsAddTrigger, setItemsAddTrigger] = useState(0);
  const [view, setView] = useState<'list' | 'board'>('list');

  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });

  const pipeline = pipelineData?.data;
  const stages = pipeline?.stages ?? [];
  const isRecordType = !!pipeline?.record_type_id;

  const topbarAction = activeGroupId === null ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <ViewToggle value={view} onChange={setView} />
      {!isRecordType && stages.length > 0 && (
        <>
          <CsvImportExport
            resource="deals"
            filename="items.csv"
            exportParams={{ pipeline_id: pipelineId }}
            importExtra={{ pipeline_id: pipelineId, stage_id: stages[0]?.id ?? '' }}
            templateHeaders={['name', 'value', 'probability', 'close_date']}
            onImported={() => void qc.invalidateQueries({ queryKey: ['deals', pipelineId] })}
          />
          <Button variant="primary" onClick={() => setDealsAddTrigger(n => n + 1)}>+ Add item</Button>
        </>
      )}
    </div>
  ) : activeGroupId !== null ? (
    <Button variant="primary" onClick={() => setItemsAddTrigger(n => n + 1)}>+ Add item</Button>
  ) : null;

  return (
    <>
      <Topbar left={<PipelineSwitcher currentId={pipelineId} />} action={topbarAction} />
      <div style={{ padding: 24 }}>
        {pipeline && (
          isRecordType ? (
            view === 'board' ? (
              <RecordKanban recordTypeId={pipeline.record_type_id!} pipelineId={pipeline.id} />
            ) : (
              <RecordList recordTypeId={pipeline.record_type_id!} pipelineId={pipeline.id} />
            )
          ) : (
            <>
              <GroupTabs pipelineId={pipelineId} activeGroupId={activeGroupId} onChange={setActiveGroupId} />
              {activeGroupId === null
                ? <DealsList pipelineId={pipelineId} addTrigger={dealsAddTrigger} view={view} />
                : <ItemsList groupId={activeGroupId} pipelineId={pipelineId} addTrigger={itemsAddTrigger} />
              }
            </>
          )
        )}
      </div>
    </>
  );
}

// ── Grid components ──────────────────────────────────────────────────────────

const DEAL_COLS = 'minmax(220px,2.2fr) .9fr .9fr .55fr .9fr 1fr';
const ITEM_COLS = '2fr 1.2fr 1fr';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

function DealGrid({ deals, stageMap, userMap }: {
  deals: Deal[];
  stageMap: Record<string, PipelineStage>;
  userMap: Record<string, string>;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'close_date', dir: 'asc' });

  const stageOrder = Object.fromEntries(Object.values(stageMap).map((s, i) => [s.id, i]));
  const sorted = [...deals].sort((a, b) => {
    const av = sort.key === 'stage_id'
      ? (stageOrder[a.stage_id ?? ''] ?? 99)
      : (a as Record<string, unknown>)[sort.key];
    const bv = sort.key === 'stage_id'
      ? (stageOrder[b.stage_id ?? ''] ?? 99)
      : (b as Record<string, unknown>)[sort.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const SortHead = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(k)} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      fontSize: 10, fontWeight: 600, color: 'var(--text3)',
      textTransform: 'uppercase', letterSpacing: 1.4,
      display: 'inline-flex', alignItems: 'center', gap: 4, textAlign: 'left',
    }}>
      {children}
      {sort.key === k && (
        <span style={{ color: 'var(--text2)', transform: sort.dir === 'asc' ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}>
          <Icon name="chevron" size={11} />
        </span>
      )}
    </button>
  );

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: DEAL_COLS, gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <SortHead k="name">Name</SortHead>
        <SortHead k="value">Value</SortHead>
        <SortHead k="stage_id">Stage</SortHead>
        <SortHead k="probability">%</SortHead>
        <SortHead k="close_date">Close</SortHead>
        <span style={eyebrow}>Owner</span>
      </div>
      {sorted.map((deal, i) => (
        <DealRow key={deal.id} deal={deal} stageMap={stageMap} userMap={userMap} last={i === sorted.length - 1} />
      ))}
    </div>
  );
}

function DealRow({ deal, stageMap, userMap, last }: {
  deal: Deal; stageMap: Record<string, PipelineStage>; userMap: Record<string, string>; last: boolean;
}) {
  const [hover, setHover] = useState(false);
  const stage = deal.stage_id ? stageMap[deal.stage_id] : undefined;
  const ownerName = deal.owner_id ? (userMap[deal.owner_id] ?? '—') : '—';
  const ownerInitial = ownerName !== '—' ? ownerName[0]?.toUpperCase() : '?';
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: DEAL_COLS,
        gap: 14, alignItems: 'center',
        padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
        fontSize: 13,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.name}</span>
      </span>
      <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtValue(deal.value)}</span>
      <span><StagePill stage={stage} /></span>
      <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
        {deal.probability != null ? `${deal.probability}%` : '—'}
      </span>
      <span style={{ color: 'var(--text2)' }}>
        {deal.close_date ? new Date(deal.close_date + 'T00:00:00').toLocaleDateString() : '—'}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 999,
          background: 'var(--surface2)', color: 'var(--text2)',
          border: '1px solid var(--border)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}>{ownerInitial}</span>
        <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ownerName}</span>
      </span>
    </div>
  );
}

function ItemGrid({ items, stageMap, onEdit }: {
  items: Item[];
  stageMap: Record<string, GroupStage>;
  onEdit: (item: Item) => void;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: ITEM_COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
        {['Title', 'Stage', 'Value'].map(h => (
          <span key={h} style={eyebrow}>{h}</span>
        ))}
      </div>
      {items.map((item, i) => (
        <ItemGridRow key={item.id} item={item} stageMap={stageMap} last={i === items.length - 1} onEdit={() => onEdit(item)} />
      ))}
    </div>
  );
}

function ItemGridRow({ item, stageMap, last, onEdit }: {
  item: Item; stageMap: Record<string, GroupStage>; last: boolean; onEdit: () => void;
}) {
  const [hover, setHover] = useState(false);
  const stage = stageMap[item.stage_id ?? ''];
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onEdit}
      style={{
        display: 'grid', gridTemplateColumns: ITEM_COLS,
        gap: 14, alignItems: 'center',
        padding: '11px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
        cursor: 'pointer', fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{item.title}</span>
      <StagePill stage={stage} />
      <span style={{ color: 'var(--text2)' }}>
        {item.value != null ? fmtValue(item.value) : '—'}
      </span>
    </div>
  );
}
