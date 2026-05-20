'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { RecordKanban } from '@/components/pipeline/RecordKanban';
import { RecordTable } from '@/components/pipeline/RecordTable';
import { RecordList } from '@/components/pipeline/RecordList';

interface RecordType { id: string; name: string; icon: string; color: string; }
interface Pipeline {
  id: string;
  name: string;
  record_type_id: string | null;
  view: string | null;
  table_columns: string[] | null;
}

const DEFAULT_TABLE_COLUMNS = ['record_number', 'name', 'stage', 'owner_id', 'created_at'];

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

export default function RecordTypePipelinePage() {
  const { typeSlug } = useParams<{ typeSlug: string }>();
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  const { data: types = [] } = useQuery<RecordType[]>({
    queryKey: ['record-types'],
    queryFn: () => apiFetch('/record-types'),
  });

  const activeType = types.find(t =>
    t.id === typeSlug || t.name.toLowerCase().replace(/\s+/g, '-') === typeSlug
  );

  const { data: allPipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: () => apiFetch('/pipelines'),
    enabled: !!activeType,
  });

  const pipelines = allPipelines.filter(p => p.record_type_id === activeType?.id);
  const pipeline = pipelines.find(p => p.id === (activePipelineId ?? pipelines[0]?.id));

  if (!activeType) {
    return (
      <>
        <Topbar />
        <div style={{ padding: 32, color: 'var(--text3)', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
          Record type not found.
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>{activeType.icon}</span>
            <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--text)' }}>
              {activeType.name}
            </span>
            {pipelines.length > 1 && (
              <select
                value={pipeline?.id ?? ''}
                onChange={e => setActivePipelineId(e.target.value)}
                style={{
                  border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px',
                  fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  background: 'var(--surface)', color: 'var(--text)',
                }}
              >
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
        }
      />
      <div style={{ padding: 24 }}>
        {!pipeline ? (
          <p style={{ color: 'var(--text3)', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
            No pipeline found for this record type.
          </p>
        ) : pipeline.view === 'table' ? (
          <RecordTable
            recordTypeId={activeType.id}
            pipelineId={pipeline.id}
            columns={pipeline.table_columns ?? DEFAULT_TABLE_COLUMNS}
          />
        ) : pipeline.view === 'list' ? (
          <RecordList recordTypeId={activeType.id} pipelineId={pipeline.id} />
        ) : (
          <RecordKanban recordTypeId={activeType.id} pipelineId={pipeline.id} />
        )}
      </div>
    </>
  );
}
