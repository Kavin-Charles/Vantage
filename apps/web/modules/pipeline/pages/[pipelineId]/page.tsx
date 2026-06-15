'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline } from '@/modules/pipeline/lib/pipelines';
import { ViewSwitcher } from '@/modules/pipeline/components/ViewSwitcher';
import { PipelineSwitcher } from '@/modules/pipeline/components/shared/PipelineSwitcher';
import type { ComponentType } from 'react';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';

type View = 'kanban' | 'table';

interface ViewProps {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}

const KanbanBoard = dynamic(
  () => import('@/modules/pipeline/components/kanban/KanbanBoard').then(m => ({ default: m.KanbanBoard })),
  { ssr: false }
) as ComponentType<ViewProps>;

const PipelineTable = dynamic(
  () => import('@/modules/pipeline/components/table/PipelineTable').then(m => ({ default: m.PipelineTable })),
  { ssr: false }
) as ComponentType<ViewProps>;

export default function PipelineViewPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const getToken = useApiToken();
  const [view, setView] = useState<View>('kanban');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [addTrigger, setAddTrigger] = useState(0);
  const [addHovered, setAddHovered] = useState(false);

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
    enabled: !!pipelineId,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        minHeight: 56,
      }}>
        <PipelineSwitcher currentId={pipelineId} />
        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text3)',
            fontSize: 14,
            pointerEvents: 'none',
          }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              padding: '7px 12px 7px 30px',
              border: `1px solid ${searchFocused ? 'var(--text2)' : 'var(--border)'}`,
              borderRadius: 10,
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              width: 200,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              transition: 'border-color .15s ease, box-shadow .15s ease',
              boxShadow: searchFocused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
            }}
          />
        </div>

        <ViewSwitcher current={view} onChange={setView} />

        <button
          onClick={() => setAddTrigger(n => n + 1)}
          onMouseEnter={() => setAddHovered(true)}
          onMouseLeave={() => setAddHovered(false)}
          style={{
            padding: '8px 18px',
            background: addHovered ? '#1a2244' : 'var(--text)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            transition: 'all .15s ease',
            letterSpacing: '0.1px',
          }}
        >
          + New item
        </button>
      </div>

      {/* Stats bar */}
      {pipeline && (
        <div style={{
          padding: '8px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
          fontSize: 13,
          color: 'var(--text3)',
          fontFamily: 'var(--font-sans)',
        }}>
          <span style={{ fontWeight: 500, color: 'var(--text2)' }}>{pipeline.name}</span>
          {' · '}
          {pipeline.stages.length} stage{pipeline.stages.length !== 1 ? 's' : ''}
          {pipeline.fields.length > 0 && ` · ${pipeline.fields.length} field${pipeline.fields.length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* View */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isLoading && (
          <div style={{
            padding: 48,
            textAlign: 'center',
            color: 'var(--text3)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
          }}>
            Loading pipeline…
          </div>
        )}

        {pipeline && view === 'kanban' && (
          <KanbanBoard pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'table' && (
          <PipelineTable pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
      </div>
    </div>
  );
}
