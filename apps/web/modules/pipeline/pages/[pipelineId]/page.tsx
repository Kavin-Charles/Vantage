'use client';
import { useState, useEffect, ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline } from '@/modules/pipeline/lib/pipelines';
import { ViewSwitcher } from '@/modules/pipeline/components/ViewSwitcher';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { PipelineSwitcher } from '../PipelineSwitcher';
import type { PipelineWithDetails } from '@vencore/types';

type View = 'kanban' | 'table' | 'list';

interface KanbanProps { pipeline: PipelineWithDetails; search: string; addTrigger: number }
interface TableProps  { pipeline: PipelineWithDetails; search: string; addTrigger: number }
interface ListProps   { pipeline: PipelineWithDetails; search: string }

// Lazy imports — components built in later tasks
const PipelineKanban = dynamic(
  () => import('@/modules/pipeline/components/PipelineKanban').then(m => ({ default: m.PipelineKanban })),
  { ssr: false }
) as ComponentType<KanbanProps>;

const PipelineTable = dynamic(
  () => import('@/modules/pipeline/components/PipelineTable').then(m => ({ default: m.PipelineTable })),
  { ssr: false }
) as ComponentType<TableProps>;

const PipelineList = dynamic(
  () => import('@/modules/pipeline/components/PipelineList').then(m => ({ default: m.PipelineList })),
  { ssr: false }
) as ComponentType<ListProps>;

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
  const pipeline = data?.data;

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
            borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans, sans-serif', width: 200,
          }}
        />
        {pipeline && (
          <ViewSwitcher pipelineId={pipelineId} current={view} onChange={setView} />
        )}
        <Link
          href="/settings/pipelines"
          title="Pipeline settings"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text2)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Icon name="settings" size={16} />
        </Link>
        <button
          onClick={() => setAddTrigger(n => n + 1)}
          style={{
            padding: '8px 16px', background: 'var(--text)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          }}
        >+ Add record</button>
      </div>

      {/* View content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {!pipeline && (
          <div style={{ padding: 40, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>Loading…</div>
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
