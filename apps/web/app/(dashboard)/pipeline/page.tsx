'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listPipelines } from '@/lib/pipelines';
import { useApiToken } from '@/lib/useApiToken';
import { ModuleGuard } from '@/components/ModuleGuard';

export default function PipelinePage() {
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  useEffect(() => {
    if (!isLoading && data?.data) {
      const pipelines = data.data;
      const target = pipelines.find(p => p.is_default) ?? pipelines[0];
      if (target) router.replace(`/pipeline/${target.id}`);
    }
  }, [isLoading, data, router]);

  return (
    <ModuleGuard moduleId="pipelines">
      <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
        Loading…
      </div>
    </ModuleGuard>
  );
}
