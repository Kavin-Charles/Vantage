'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  createStage, updateStage, deleteStage, reorderStages,
} from '@/modules/crm/pipeline/lib/pipelines';
import type { Pipeline, PipelineStage } from '@/modules/crm/pipeline/lib/pipelines';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';

const STAGE_COLORS = [
  '#6366f1', '#0ea5e9', '#f59e0b', '#10b981',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.6px', color: 'var(--text3)',
  fontFamily: 'var(--font-sans)', marginBottom: 6, display: 'block',
};

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '7px 10px',
    border: `1px solid ${focused ? 'var(--text2)' : 'var(--border)'}`,
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-sans)',
    background: 'var(--surface)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  };
}

function stageDisplayColor(stage: PipelineStage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

export function StagesTab({ pipeline }: { pipeline: Pipeline }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('pipelines:stage.edit');
  const canDelete = hasPermission('pipelines:stage.delete');

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [colorOpenId, setColorOpenId] = useState<string | null>(null);

  const [stageName, setStageName] = useState('');
  const [stageColor, setStageColor] = useState(STAGE_COLORS[0]!);
  const [stageNameFocused, setStageNameFocused] = useState(false);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
    setColorOpenId(null);
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

  function openContextMenu(e: React.MouseEvent, stage: PipelineStage) {
    const isTerminal = stage.is_won || stage.is_lost;
    const idx = activeStages.findIndex(s => s.id === stage.id);
    const items = [
      canEdit && { label: 'Rename Stage', icon: 'pencil', onClick: () => startEdit(stage) },
      canEdit && { label: 'Change Color', icon: 'palette', onClick: () => setColorOpenId(stage.id) },
      canEdit && !isTerminal && {
        label: 'Move Up', icon: 'arrow-up',
        disabled: idx === 0,
        onClick: () => handleReorder(stage.id, 'up'),
      },
      canEdit && !isTerminal && {
        label: 'Move Down', icon: 'arrow-down',
        disabled: idx === activeStages.length - 1,
        onClick: () => handleReorder(stage.id, 'down'),
      },
      !isTerminal && canDelete && { type: 'separator' as const },
      !isTerminal && canDelete && {
        label: 'Delete Stage', icon: 'trash-2', danger: true,
        onClick: () => {
          if (confirm(`Delete "${stage.name}"?`)) deleteMut.mutate(stage.id);
        },
      },
    ].filter(Boolean) as ContextMenuItem[];
    if (items.length) openMenu(e, items);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {allStages.map(stage => {
          const color = stageDisplayColor(stage);
          const isTerminal = stage.is_won || stage.is_lost;
          const idx = activeStages.findIndex(s => s.id === stage.id);
          const isEditing = editingId === stage.id;
          const isHovered = hoveredId === stage.id;

          return (
            <div
              key={stage.id}
              onContextMenu={e => openContextMenu(e, stage)}
              onMouseEnter={() => setHoveredId(stage.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderLeft: isTerminal ? `3px solid ${color}` : undefined,
                borderRadius: 12,
                background: 'var(--surface)',
                boxShadow: isHovered ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
                transform: isHovered ? 'translateY(-1px)' : 'none',
                transition: 'box-shadow .15s ease, transform .15s ease',
                cursor: 'default',
              }}
            >
              {/* Color dot / picker */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    if (!canEdit) return;
                    setColorOpenId(colorOpenId === stage.id ? null : stage.id);
                    setEditingId(null);
                  }}
                  title="Change color"
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: color, border: '2px solid transparent',
                    cursor: canEdit ? 'pointer' : 'default', padding: 0,
                    transform: colorOpenId === stage.id ? 'scale(1.2)' : 'scale(1)',
                    transition: 'transform .15s ease',
                    outline: 'none',
                  }}
                />
                {colorOpenId === stage.id && (
                  <div style={{
                    position: 'absolute', top: 22, left: -4, zIndex: 100,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: 8, display: 'flex', gap: 6,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    animation: 'ctx-in .12s ease',
                  }}>
                    {STAGE_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          updateMut.mutate({ id: stage.id, body: { color: c } });
                          setColorOpenId(null);
                        }}
                        style={{
                          width: 20, height: 20, borderRadius: '50%', background: c,
                          border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                          outline: color === c ? '2px solid white' : 'none',
                          outlineOffset: -3, cursor: 'pointer', padding: 0,
                          transform: 'scale(1)',
                          transition: 'transform .12s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        title={c}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Name / inline edit */}
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
                    style={inputStyle(true)}
                  />
                ) : (
                  <span
                    onClick={() => canEdit && startEdit(stage)}
                    style={{
                      fontSize: 13, fontFamily: 'var(--font-sans)',
                      color: 'var(--text)', fontWeight: 500,
                      cursor: canEdit ? 'text' : 'default',
                      display: 'block', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {stage.name}
                  </span>
                )}
              </div>

              {/* Badge */}
              <span style={{
                background: color + '1a', color,
                fontSize: 10, fontWeight: 600, padding: '2px 7px',
                borderRadius: 999, fontFamily: 'var(--font-sans)',
                letterSpacing: '0.3px', flexShrink: 0,
              }}>
                {stage.is_won ? 'WON' : stage.is_lost ? 'LOST' : 'ACTIVE'}
              </span>

              {/* Reorder buttons (active only) */}
              {!isTerminal && canEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                  {(['up', 'down'] as const).map(dir => {
                    const disabled = dir === 'up' ? idx === 0 : idx === activeStages.length - 1;
                    return (
                      <button
                        key={dir}
                        onClick={() => handleReorder(stage.id, dir)}
                        disabled={disabled}
                        title={`Move ${dir}`}
                        style={{
                          width: 20, height: 16, border: 'none', background: 'none',
                          cursor: disabled ? 'default' : 'pointer',
                          color: disabled ? 'var(--text3)' : 'var(--text2)',
                          fontSize: 9, padding: 0, lineHeight: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: disabled ? 0.3 : 1,
                          transition: 'opacity .15s ease, color .15s ease',
                        }}
                        onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = disabled ? 'var(--text3)' : 'var(--text2)'; }}
                      >
                        {dir === 'up' ? '▲' : '▼'}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Delete (active only) */}
              {!isTerminal && canDelete && (
                <button
                  onClick={() => {
                    if (confirm(`Delete "${stage.name}"?`)) deleteMut.mutate(stage.id);
                  }}
                  style={{
                    fontSize: 12, color: 'var(--red, #991b1b)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 6,
                    fontFamily: 'var(--font-sans)', fontWeight: 500,
                    transition: 'background .15s ease, color .15s ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg, #fee2e2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}

        {pipeline.stages.length === 0 && (
          <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
            No stages yet. Add one below.
          </p>
        )}
      </div>

      {/* Add stage form */}
      <div style={{ border: '1px dashed var(--border)', borderRadius: 16, padding: '18px 20px' }}>
        <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 14px' }}>
          Add stage
        </h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={eyebrow}>Name</label>
            <input
              value={stageName}
              onChange={e => setStageName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && stageName.trim() && createMut.mutate()}
              onFocus={() => setStageNameFocused(true)}
              onBlur={() => setStageNameFocused(false)}
              placeholder="Stage name"
              style={inputStyle(stageNameFocused)}
            />
          </div>
          <div>
            <label style={eyebrow}>Color</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {STAGE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setStageColor(c)}
                  title={c}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', background: c,
                    border: stageColor === c ? '2px solid var(--text)' : '2px solid transparent',
                    outline: stageColor === c ? '2px solid white' : 'none',
                    outlineOffset: -3, cursor: 'pointer', padding: 0,
                    transform: stageColor === c ? 'scale(1.15)' : 'scale(1)',
                    transition: 'transform .12s ease, border .12s ease',
                  }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => createMut.mutate()}
            disabled={!stageName.trim() || createMut.isPending}
            style={{
              padding: '8px 18px',
              background: stageName.trim() ? 'var(--text)' : 'var(--text3)',
              color: '#fff', border: 'none', borderRadius: 10,
              cursor: stageName.trim() ? 'pointer' : 'not-allowed',
              fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 600,
              whiteSpace: 'nowrap', transition: 'background .15s ease',
            }}
          >
            {createMut.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
