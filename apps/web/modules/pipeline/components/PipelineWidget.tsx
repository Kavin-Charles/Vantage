'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listPipelines } from '@/modules/pipeline/lib/pipelines';
import { listRecords } from '@/modules/pipeline/lib/records';
import { Badge } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { PipelineWithDetails, PipelineRecordWithValues } from '@vencore/types';

export function PipelineWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data: pipelinesData, isLoading: pipelinesLoading, isError: pipelinesError } = useQuery({
    queryKey: ['widget', 'pipelines'],
    queryFn: async () => listPipelines(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('pipelines'),
  });

  const firstPipeline: PipelineWithDetails | undefined = pipelinesData?.data?.[0];

  const { data: recordsData, isLoading: recordsLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'records', firstPipeline?.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: firstPipeline!.id, per_page: 5 }),
    staleTime: 60_000,
    enabled: !!firstPipeline && isEnabled('pipelines'),
  });

  if (!isEnabled('pipelines')) return null;
  if (pipelinesLoading || recordsLoading) return <WidgetSkeleton />;
  if (pipelinesError || isError) return <WidgetError onRetry={() => void refetch()} />;

  if (!firstPipeline) {
    return <EmptyState href="/pipeline" label="Create your first pipeline" />;
  }

  const stageMap = new Map(firstPipeline.stages.map(s => [s.id, s]));
  const records: PipelineRecordWithValues[] = recordsData?.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 22, fontWeight: 700, color: 'var(--text)',
          fontFamily: 'var(--font-display, "Instrument Serif", serif)',
        }}>
          {firstPipeline.name}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          {records.length} record{records.length !== 1 ? 's' : ''}
        </span>
      </div>

      {records.length === 0 ? (
        <EmptyState href={`/pipeline/${firstPipeline.id}`} label="Add your first record" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {records.map((r: PipelineRecordWithValues, i: number) => {
            const stage = stageMap.get(r.stage_id);
            return (
              <button
                key={r.id}
                onClick={() => router.push(`/pipeline/${r.pipeline_id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 4px',
                  border: 'none',
                  borderBottom: i < records.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  borderRadius: 4,
                  background: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                  {r.name}
                </span>
                {stage && <Badge label={stage.name} color="gray" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
