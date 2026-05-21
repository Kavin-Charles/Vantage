'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listPipelines } from '@/lib/pipelines';
import { useApiToken } from '@/lib/useApiToken';
import type { Pipeline } from '@vantage/types';

interface RecordType { id: string; name: string; icon: string; }

interface Props {
  value: string | null;
  onChange: (id: string) => void;
}

export function PipelineSwitcher({ value, onChange }: Props) {
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const { data: rtData } = useQuery<RecordType[]>({
    queryKey: ['record-types'],
    queryFn: async () => {
      const res = await fetch('/api/record-types');
      const json = await res.json() as { data: RecordType[] };
      return json.data;
    },
  });

  const pipelines: Pipeline[] = data?.data ?? [];
  const recordTypes: RecordType[] = rtData ?? [];

  // Map record_type_id → slug (name lowercased, spaces → hyphens)
  const rtSlugMap = Object.fromEntries(
    recordTypes.map(rt => [rt.id, rt.name.toLowerCase().replace(/\s+/g, '-')])
  );

  // Auto-select first pipeline when loaded (must be in effect, not render)
  useEffect(() => {
    if (!isLoading && pipelines.length > 0 && !value) {
      const first = pipelines[0]!;
      if (first.record_type_id && rtSlugMap[first.record_type_id]) {
        router.push(`/pipeline/${rtSlugMap[first.record_type_id]}`);
      } else {
        onChange(first.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, pipelines.length, value]);

  if (isLoading || pipelines.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text3)', padding: '4px 0' }}>
        {isLoading ? 'Loading…' : 'No pipelines'}
      </div>
    );
  }

  const current = pipelines.find(p => p.id === value) ?? pipelines[0]!;

  function handleChange(id: string) {
    const pip = pipelines.find(p => p.id === id);
    if (pip?.record_type_id && rtSlugMap[pip.record_type_id]) {
      router.push(`/pipeline/${rtSlugMap[pip.record_type_id]}`);
    } else {
      onChange(id);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        value={current.id}
        onChange={e => handleChange(e.target.value)}
        style={{
          appearance: 'none',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '5px 28px 5px 10px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text)',
          cursor: 'pointer',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          minWidth: 140,
        }}
      >
        {pipelines.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.is_default ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
