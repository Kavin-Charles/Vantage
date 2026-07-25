'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  createStage, updateStage, deleteStage, reorderStages,
} from '@/modules/crm/pipeline/lib/pipelines';
import type { Pipeline, PipelineStage } from '@/modules/crm/pipeline/lib/pipelines';
import { FluidInput, FluidButton, MSIcon } from '@/modules/shared/fluid/ui';

const STAGE_COLORS = [
  '#0048ce', '#0ea5e9', '#f59e0b', '#10b981',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];

function stageDisplayColor(stage: PipelineStage): string {
  if (stage.is_won) return '#2e7d32';
  if (stage.is_lost) return 'var(--fl-error)';
  return stage.color || 'var(--fl-primary)';
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 8, fontFamily: 'var(--fl-font-body)',
  fontSize: 13, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
};

export function StagesTab({ pipeline }: { pipeline: Pipeline }) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [stageName, setStageName] = useState('');
  const [stageColor, setStageColor] = useState(STAGE_COLORS[0]!);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pipeline', pipeline.id] });
    void qc.invalidateQueries({ queryKey: ['pipelines'] });
  };

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<PipelineStage> }) =>
      updateStage(await getToken(), pipeline.id, id, body),
    onSuccess: () => { invalidate(); setEditingId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteStage(await getToken(), pipeline.id, id),
    onSuccess: invalidate,
  });

  const createMut = useMutation({
    mutationFn: async () =>
      createStage(await getToken(), pipeline.id, { name: stageName.trim(), color: stageColor }),
    onSuccess: () => { invalidate(); setStageName(''); setStageColor(STAGE_COLORS[0]!); },
  });

  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => reorderStages(await getToken(), pipeline.id, ids),
    onSuccess: invalidate,
  });

  const activeStages = pipeline.stages
    .filter(s => !s.is_won && !s.is_lost)
    .sort((a, b) => a.position - b.position);
  const terminalStages = pipeline.stages.filter(s => s.is_won || s.is_lost);
  const allStages = [...activeStages, ...terminalStages];

  function startEdit(stage: PipelineStage) {
    setEditingId(stage.id);
    setEditingName(stage.name);
  }

  function commitEdit(stage: PipelineStage) {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== stage.name) {
      updateMut.mutate({ id: stage.id, body: { name: trimmed } });
    } else {
      setEditingId(null);
    }
  }

  function handleReorder(stageId: string, direction: 'up' | 'down') {
    const idx = activeStages.findIndex(s => s.id === stageId);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === activeStages.length - 1) return;
    const next = [...activeStages];
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    reorderMut.mutate([...next.map(s => s.id), ...terminalStages.map(s => s.id)]);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {allStages.map(stage => {
          const color = stageDisplayColor(stage);
          const isTerminal = stage.is_won || stage.is_lost;
          const idx = activeStages.findIndex(s => s.id === stage.id);
          const isEditing = editingId === stage.id;

          return (
            <div
              key={stage.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                border: '1px solid var(--fl-outline-variant)',
                borderRadius: 'var(--fl-radius-input)',
                background: 'var(--fl-surface-container-lowest)',
              }}
            >
              <span style={{
                width: 12, height: 12, borderRadius: 'var(--fl-radius-pill)',
                background: color, flexShrink: 0,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => commitEdit(stage)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitEdit(stage);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    style={{
                      width: '100%', padding: '4px 8px',
                      border: '1px solid var(--fl-primary)', borderRadius: 8,
                      fontSize: 13, fontFamily: 'var(--fl-font-body)',
                      color: 'var(--fl-on-surface)', background: 'var(--fl-surface-container-lowest)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <span
                    onClick={() => startEdit(stage)}
                    style={{
                      fontSize: 13, fontFamily: 'var(--fl-font-body)',
                      color: 'var(--fl-on-surface)', fontWeight: 500, cursor: 'text',
                      display: 'block', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {stage.name}
                  </span>
                )}
              </div>

              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px',
                borderRadius: 'var(--fl-radius-pill)', fontFamily: 'var(--fl-font-body)',
                letterSpacing: '0.3px', flexShrink: 0,
                color: isTerminal ? '#fff' : 'var(--fl-on-surface-variant)',
                background: isTerminal ? color : 'var(--fl-surface-container)',
              }}>
                {stage.is_won ? 'WON' : stage.is_lost ? 'LOST' : 'ACTIVE'}
              </span>

              {!isTerminal && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => handleReorder(stage.id, 'up')}
                    disabled={idx === 0}
                    aria-label={`Move ${stage.name} up`}
                    style={{
                      width: 24, height: 24, border: 'none', background: 'transparent',
                      cursor: idx === 0 ? 'default' : 'pointer',
                      color: 'var(--fl-on-surface-variant)', opacity: idx === 0 ? 0.3 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MSIcon name="arrow_upward" size={16} />
                  </button>
                  <button
                    onClick={() => handleReorder(stage.id, 'down')}
                    disabled={idx === activeStages.length - 1}
                    aria-label={`Move ${stage.name} down`}
                    style={{
                      width: 24, height: 24, border: 'none', background: 'transparent',
                      cursor: idx === activeStages.length - 1 ? 'default' : 'pointer',
                      color: 'var(--fl-on-surface-variant)',
                      opacity: idx === activeStages.length - 1 ? 0.3 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MSIcon name="arrow_downward" size={16} />
                  </button>
                </div>
              )}

              {!isTerminal && (
                <button
                  onClick={() => {
                    if (confirm(`Delete "${stage.name}"?`)) deleteMut.mutate(stage.id);
                  }}
                  style={{
                    fontSize: 12, color: 'var(--fl-error)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 8,
                    fontFamily: 'var(--fl-font-body)', fontWeight: 500, flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}

        {pipeline.stages.length === 0 && (
          <p style={{ color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)', fontSize: 13 }}>
            No stages yet. Add one below.
          </p>
        )}
      </div>

      <div style={{ border: '1px dashed var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-card)', padding: '18px 20px' }}>
        <h3 style={{ fontFamily: 'var(--fl-font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fl-on-surface)', margin: '0 0 14px' }}>
          Add stage
        </h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Name</label>
            <FluidInput
              value={stageName}
              onChange={setStageName}
              placeholder="Stage name"
            />
          </div>
          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', gap: 6, padding: '10px 0' }}>
              {STAGE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setStageColor(c)}
                  title={c}
                  style={{
                    width: 22, height: 22, borderRadius: 'var(--fl-radius-pill)', background: c,
                    border: stageColor === c ? '2px solid var(--fl-on-surface)' : '2px solid transparent',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
          <FluidButton
            onClick={() => createMut.mutate()}
            disabled={!stageName.trim() || createMut.isPending}
            icon="add"
          >
            {createMut.isPending ? 'Adding…' : 'Add stage'}
          </FluidButton>
        </div>
      </div>
    </div>
  );
}
