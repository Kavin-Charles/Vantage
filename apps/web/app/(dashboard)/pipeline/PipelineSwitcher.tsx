'use client';

import { useQuery } from '@tanstack/react-query';
import { listPipelines } from '@/lib/pipelines';
import type { Pipeline } from '@vantage/types';

interface Props {
  value: string | null;
  onChange: (id: string) => void;
}

export function PipelineSwitcher({ value, onChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: listPipelines,
  });

  const pipelines: Pipeline[] = data?.data ?? [];

  // Auto-select first pipeline when loaded
  if (!isLoading && pipelines.length > 0 && !value) {
    onChange(pipelines[0]!.id);
  }

  if (isLoading || pipelines.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text3)', padding: '4px 0' }}>
        {isLoading ? 'Loading…' : 'No pipelines'}
      </div>
    );
  }

  const current = pipelines.find(p => p.id === value) ?? pipelines[0]!;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        value={current.id}
        onChange={e => onChange(e.target.value)}
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
