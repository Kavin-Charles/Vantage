'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { PipelineSwitcher } from '../PipelineSwitcher';
import { RecordTable } from '@/components/pipeline/RecordTable';
import { RecordList } from '@/components/pipeline/RecordList';
import { useApiToken } from '@/lib/useApiToken';
import { listPipelines } from '@/lib/pipelines';

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
  const getToken = useApiToken();
  const router = useRouter();

  const { data: types = [] } = useQuery<RecordType[]>({
    queryKey: ['record-types'],
    queryFn: () => apiFetch('/record-types'),
  });

  const activeType = types.find(t =>
    t.id === typeSlug || t.name.toLowerCase().replace(/\s+/g, '-') === typeSlug
  );

  const { data: pipelinesResp } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
    enabled: !!activeType,
  });
  const allPipelines: Pipeline[] = (pipelinesResp?.data ?? []) as unknown as Pipeline[];

  const pipelines = allPipelines.filter(p => p.record_type_id === activeType?.id);
  const pipeline = pipelines.find(p => p.id === (activePipelineId ?? pipelines[0]?.id));

  // The switcher value: use the current pipeline's ID so it appears selected
  const switcherValue = pipeline?.id ?? null;

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
            <PipelineSwitcher
              value={switcherValue}
              onChange={id => {
                // Non-record-type pipeline selected — go to main pipeline page
                router.push(`/pipeline?id=${id}`);
              }}
            />
            {/* If this record type has multiple pipelines, show a sub-selector */}
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
        ) : (
          <RecordList recordTypeId={activeType.id} pipelineId={pipeline.id} />
        )}
      </div>
    </>
  );
}
