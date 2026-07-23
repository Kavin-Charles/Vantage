'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listPipelines } from '@/modules/crm/pipeline/lib/pipelines';
import { EmptyState, FluidButton } from '@/modules/shared/fluid/ui';

/** Resolves to the workspace's default (or first) pipeline and redirects there —
 * mirrors the legacy (dashboard) pipeline index page's behavior. */
export function PipelineIndexScreen() {
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  useEffect(() => {
    if (!data) return;
    const def = data.find(p => p.is_default) ?? data[0];
    if (def) router.replace(`/crm/pipeline/${def.id}`);
  }, [data, router]);

  if (isLoading || (data && data.length > 0)) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)' }}>
        Loading…
      </div>
    );
  }

  return (
    <EmptyState
      icon="account_tree"
      title="No pipelines yet"
      message="Create your first pipeline in settings."
      action={<FluidButton onClick={() => router.push('/settings/pipelines')}>Go to pipeline settings</FluidButton>}
    />
  );
}
