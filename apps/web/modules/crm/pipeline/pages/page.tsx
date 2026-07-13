'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listPipelines } from '@/modules/crm/pipeline/lib/pipelines';

export default function PipelinePage() {
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  useEffect(() => {
    if (!data) return;
    const pipelines = data;
    const def = pipelines.find(p => p.is_default) ?? pipelines[0];
    if (def) router.replace(`/crm/pipeline/${def.id}`);
  }, [data, router]);

  if (isLoading) {
    return (
      <div style={{ padding: 40, color: 'var(--text2)', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)', marginBottom: 12 }}>
        No pipelines yet
      </h2>
      <p style={{ color: 'var(--text2)', fontFamily: 'var(--font-sans)', marginBottom: 24, fontSize: 15 }}>
        Create your first pipeline in settings.
      </p>
      <a
        href="/settings/pipelines"
        style={{
          padding: '10px 20px', background: 'var(--text)', color: '#fff',
          borderRadius: 8, textDecoration: 'none',
          fontFamily: 'var(--font-sans)', fontSize: 14,
        }}
      >Go to pipeline settings</a>
    </div>
  );
}
