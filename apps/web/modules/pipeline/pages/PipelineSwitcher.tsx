'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/lib/useApiToken';
import { listPipelines } from '@/lib/pipelines';

export function PipelineSwitcher({ currentId }: { currentId: string }) {
  const getToken = useApiToken();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });
  const pipelines = data?.data ?? [];
  const current = pipelines.find(p => p.id === currentId);

  if (pipelines.length <= 1) {
    return (
      <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--text)' }}>
        {current?.name ?? 'Pipeline'}
      </span>
    );
  }

  return (
    <select
      value={currentId}
      onChange={e => router.push(`/pipeline/${e.target.value}`)}
      style={{
        fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--text)',
        border: 'none', background: 'transparent', cursor: 'pointer',
        outline: 'none', padding: '0 4px',
      }}
    >
      {pipelines.map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
