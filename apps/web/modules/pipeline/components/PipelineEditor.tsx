'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline, addStage, updateStage, deleteStage, reorderStages } from '@/modules/pipeline/lib/pipelines';
import type { PipelineStage } from '@vencore/types';

const COLORS = ['#6366f1','#8b5cf6','#a855f7','#ec4899','#22c55e','#ef4444','#f59e0b','#3b82f6'];

export function PipelineEditor({ pipelineId }: { pipelineId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });
  const stages = data?.data?.stages ?? [];

  const addMut = useMutation({
    mutationFn: async (name: string) => addStage(await getToken(), pipelineId, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
      setAdding(false);
      setNewName('');
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, color, ...body }: Partial<PipelineStage> & { id: string }) =>
      updateStage(await getToken(), pipelineId, id, {
        ...body,
        ...(color != null ? { color } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteStage(await getToken(), pipelineId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => reorderStages(await getToken(), pipelineId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', pipelineId] }),
  });

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = stages.map(s => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragId);
    reorderMut.mutate(reordered);
    setDragId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stages.map(stage => (
        <div
          key={stage.id}
          draggable
          onDragStart={() => setDragId(stage.id)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(stage.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 8, cursor: 'grab',
          }}
        >
          <span style={{ cursor: 'grab', color: 'var(--text3)', fontSize: 14 }}>⠿</span>
          <input
            defaultValue={stage.name}
            onBlur={e => { if (e.target.value !== stage.name) updateMut.mutate({ id: stage.id, name: e.target.value }); }}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--text)',
            }}
          />
          <div style={{ display: 'flex', gap: 3 }}>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => updateMut.mutate({ id: stage.id, color: c })}
                style={{
                  width: 14, height: 14, borderRadius: '50%', background: c,
                  border: stage.color === c ? '2px solid var(--text)' : '2px solid transparent',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
          <button
            onClick={() => updateMut.mutate({ id: stage.id, is_won: !stage.is_won, is_lost: false })}
            style={{
              padding: '2px 8px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
              background: stage.is_won ? 'var(--green-bg)' : 'var(--surface2)',
              color: stage.is_won ? 'var(--green)' : 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >Won</button>
          <button
            onClick={() => updateMut.mutate({ id: stage.id, is_lost: !stage.is_lost, is_won: false })}
            style={{
              padding: '2px 8px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
              background: stage.is_lost ? 'var(--red-bg)' : 'var(--surface2)',
              color: stage.is_lost ? 'var(--red)' : 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >Lost</button>
          <button
            onClick={() => { if (window.confirm(`Delete stage "${stage.name}"?`)) deleteMut.mutate(stage.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
          >×</button>
        </div>
      ))}
      {adding ? (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 12px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) addMut.mutate(newName.trim());
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="Stage name"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14,
            }}
          />
          <button
            onClick={() => { if (newName.trim()) addMut.mutate(newName.trim()); }}
            style={{
              padding: '4px 12px', background: 'var(--text)', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            }}
          >Add</button>
          <button
            onClick={() => setAdding(false)}
            style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}
          >×</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '8px 12px', background: 'none',
            border: '1px dashed var(--border)', borderRadius: 8,
            cursor: 'pointer', color: 'var(--text2)',
            fontFamily: 'DM Sans, sans-serif', fontSize: 14, textAlign: 'left',
          }}
        >+ Add stage</button>
      )}
    </div>
  );
}
