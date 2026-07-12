'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listPipelines } from '@/modules/pipeline/lib/pipelines';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';
import { Badge } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';

export function PipelineWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data: pipelinesData, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'pipelines'],
    queryFn: async () => listPipelines(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const firstPipeline: Pipeline | undefined = pipelinesData?.[0];

  if (!firstPipeline) {
    return <EmptyState href="/crm/pipeline" label="Create your first pipeline" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 22, fontWeight: 700, color: 'var(--text)',
          fontFamily: 'var(--font-display)',
        }}>
          {firstPipeline.name}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          {firstPipeline.stages.length} stages
        </span>
      </div>
      <button
        onClick={() => router.push(`/crm/pipeline/${firstPipeline.id}`)}
        style={{
          padding: '8px 14px', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 8,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          fontSize: 13, color: 'var(--text)', textAlign: 'left',
        }}
      >
        View pipeline →
      </button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {firstPipeline.stages.map(s => (
          <Badge key={s.id} label={s.name} color="gray" />
        ))}
      </div>
    </div>
  );
}
