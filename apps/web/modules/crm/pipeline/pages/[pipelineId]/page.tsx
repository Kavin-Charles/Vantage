'use client';
import { useState, useEffect, ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { ViewSwitcher } from '@/modules/crm/pipeline/components/ViewSwitcher';
import { PipelineSwitcher } from '@/modules/crm/pipeline/components/shared/PipelineSwitcher';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';

type View = 'kanban' | 'table' | 'list';

interface KanbanProps { pipeline: Pipeline; search: string; addTrigger: number }
interface TableProps  { pipeline: Pipeline; search: string; addTrigger: number }
interface ListProps   { pipeline: Pipeline; search: string }

// Lazy imports — cast each resolved component to the page's prop shape.
const PipelineKanban = dynamic(
  () => import('@/modules/crm/pipeline/components/PipelineKanban').then(m => ({ default: m.PipelineKanban as ComponentType<KanbanProps> })),
  { ssr: false }
);

const PipelineTable = dynamic(
  () => import('@/modules/crm/pipeline/components/PipelineTable').then(m => ({ default: m.PipelineTable as unknown as ComponentType<TableProps> })),
  { ssr: false }
);

const PipelineList = dynamic(
  () => import('@/modules/crm/pipeline/components/PipelineList').then(m => ({ default: m.PipelineList as unknown as ComponentType<ListProps> })),
  { ssr: false }
);

export default function PipelineViewPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const getToken = useApiToken();
  const [view, setView] = useState<View>('kanban');
  const [addTrigger, setAddTrigger] = useState(0);
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });
  const pipeline = data;
  const noStages = !!pipeline && pipeline.stages.length === 0;

  useEffect(() => {
    if (pipeline?.view && ['kanban', 'table', 'list'].includes(pipeline.view)) {
      setView(pipeline.view as View);
    }
  }, [pipeline?.view]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <PipelineSwitcher currentId={pipelineId} />
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search records…"
          style={{
            padding: '6px 12px', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-sans)', width: 200,
          }}
        />
        {pipeline && (
          <ViewSwitcher current={view} onChange={setView} />
        )}
        <button
          onClick={() => { if (!noStages) setAddTrigger(n => n + 1); }}
          disabled={noStages}
          title={noStages ? 'No stages configured. Create a stage in Settings → Pipelines first.' : undefined}
          style={{
            padding: '8px 16px',
            background: noStages ? 'var(--text3)' : 'var(--text)',
            color: '#fff',
            border: 'none', borderRadius: 8,
            cursor: noStages ? 'not-allowed' : 'pointer',
            fontSize: 13, fontFamily: 'var(--font-sans)',
          }}
        >+ Add record</button>
      </div>

      {/* View content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {noStages && (
          <div style={{
            margin: '16px 24px', padding: '12px 16px', borderRadius: 12,
            background: 'var(--amber-bg, #fef3c7)', border: '1px solid var(--amber, #92400e)',
            fontSize: 13, color: 'var(--amber, #92400e)', fontFamily: 'var(--font-sans)',
          }}>
            <strong>No stages configured.</strong> Create at least one stage in{' '}
            <a href={`/settings/pipelines/${pipelineId}`} style={{ color: 'inherit', fontWeight: 600 }}>
              Settings → Pipelines
            </a>{' '}
            before adding records.
          </div>
        )}
        {!pipeline && (
          <div style={{ padding: 40, color: 'var(--text2)', fontFamily: 'var(--font-sans)' }}>Loading…</div>
        )}
        {pipeline && view === 'kanban' && (
          <PipelineKanban pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'table' && (
          <PipelineTable pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'list' && (
          <PipelineList pipeline={pipeline} search={search} />
        )}
      </div>
    </div>
  );
}
