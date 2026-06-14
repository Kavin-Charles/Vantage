'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { updatePipeline } from '@/modules/pipeline/lib/pipelines';

type View = 'kanban' | 'table' | 'list';

const VIEWS: { id: View; icon: string; label: string }[] = [
  { id: 'kanban', icon: '⬛', label: 'Kanban' },
  { id: 'table', icon: '☰', label: 'Table' },
  { id: 'list', icon: '≡', label: 'List' },
];

export function ViewSwitcher({
  pipelineId, current, onChange,
}: { pipelineId: string; current: View; onChange: (v: View) => void }) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async (view: View) => updatePipeline(await getToken(), pipelineId, { view }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  return (
    <div style={{
      display: 'flex', gap: 2,
      background: 'var(--surface2)', borderRadius: 8, padding: 3,
    }}>
      {VIEWS.map(v => (
        <button
          key={v.id}
          onClick={() => { onChange(v.id); mut.mutate(v.id); }}
          title={v.label}
          style={{
            padding: '5px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
            background: current === v.id ? 'var(--surface)' : 'transparent',
            color: current === v.id ? 'var(--text)' : 'var(--text2)',
            fontSize: 13, fontFamily: 'var(--font-sans)',
            boxShadow: current === v.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.1s',
          }}
        >{v.icon} {v.label}</button>
      ))}
    </div>
  );
}
