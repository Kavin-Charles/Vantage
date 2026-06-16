# Pipeline Settings Redesign — Plan 2: Frontend UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the pipeline settings sidebar, build a rich 3-tab pipeline config page (General/Stages/Fields) with inline editing, smooth animations, and context menus on all pipeline surfaces.

**Architecture:** `layout.tsx` deleted. Config page split into focused tab components under `modules/pipeline/components/settings/`. Pipeline list page and kanban board each get their own context menu wired via the existing `useContextMenu` hook from `@/modules/shared/components/ui/ContextMenu`. All interactive elements use CSS transitions for a polished feel.

**Tech Stack:** Next.js App Router, React, TanStack Query, existing `ContextMenu` + `useContextMenu` from `modules/shared/components/ui/ContextMenu.tsx`.

**Prerequisite:** Plan 1 (`2026-06-16-pipeline-settings-foundations.md`) must be complete — `hasPermission()`, `updatePipeline`, and `Pipeline.description` must exist.

**Spec:** `docs/superpowers/specs/2026-06-16-pipeline-settings-redesign-design.md`

---

## Shared style constants (reference throughout all tasks)

Every component uses these inline style helpers — copy them into each file rather than sharing (YAGNI: no shared style module needed yet).

```typescript
const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
  letterSpacing: '0.6px', color: 'var(--text3)',
  fontFamily: 'var(--font-sans)', marginBottom: 6, display: 'block',
};

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '8px 12px',
    border: `1px solid ${focused ? 'var(--text2)' : 'var(--border)'}`,
    borderRadius: 10, fontSize: 13, fontFamily: 'var(--font-sans)',
    background: 'var(--surface)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box' as const,
    boxShadow: focused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  };
}
```

---

### Task 1: Delete pipeline settings layout

**Files:**
- Delete: `apps/web/app/(dashboard)/settings/pipelines/layout.tsx`

- [ ] **Step 1: Delete the file**

```bash
cd D:/Projects/VencoreRepos/Vencore
rm "apps/web/app/(dashboard)/settings/pipelines/layout.tsx"
```

- [ ] **Step 2: Verify pages still load (no broken import)**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk next build --filter web 2>&1 | grep -E "error|Error" | head -10
```

Expected: no errors referencing `layout.tsx`.

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add -A
git commit -m "feat(settings): remove pipeline settings sidebar layout"
```

---

### Task 2: Create GeneralTab component

**Files:**
- Create: `apps/web/modules/pipeline/components/settings/GeneralTab.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { updatePipeline, deletePipeline } from '@/modules/pipeline/lib/pipelines';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';
import { useAuth } from '@/modules/shared/lib/AuthContext';

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.6px', color: 'var(--text3)',
  fontFamily: 'var(--font-sans)', marginBottom: 6, display: 'block',
};

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '8px 12px',
    border: `1px solid ${focused ? 'var(--text2)' : 'var(--border)'}`,
    borderRadius: 10, fontSize: 13, fontFamily: 'var(--font-sans)',
    background: 'var(--surface)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  };
}

export function GeneralTab({ pipeline }: { pipeline: Pipeline }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canConfig = hasPermission('pipelines:config');
  const canDelete = hasPermission('pipelines:delete');

  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? '');
  const [nameFocused, setNameFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [saved, setSaved] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pipeline', pipeline.id] });
    void qc.invalidateQueries({ queryKey: ['pipelines'] });
  };

  const updateMut = useMutation({
    mutationFn: async (body: { name?: string; description?: string; is_default?: boolean }) =>
      updatePipeline(await getToken(), pipeline.id, body),
    onSuccess: () => {
      invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => deletePipeline(await getToken(), pipeline.id),
    onSuccess: () => router.push('/settings/pipelines'),
  });

  function saveName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== pipeline.name) updateMut.mutate({ name: trimmed });
  }

  function saveDescription() {
    if (description !== (pipeline.description ?? '')) updateMut.mutate({ description });
  }

  return (
    <div style={{ maxWidth: 480 }}>
      {/* Name */}
      <div style={{ marginBottom: 20 }}>
        <label style={eyebrow}>Pipeline name</label>
        <input
          value={name}
          disabled={!canConfig}
          onChange={e => setName(e.target.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => { setNameFocused(false); saveName(); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ ...inputStyle(nameFocused), opacity: canConfig ? 1 : 0.6 }}
        />
      </div>

      {/* Description */}
      <div style={{ marginBottom: 20 }}>
        <label style={eyebrow}>Description</label>
        <textarea
          value={description}
          disabled={!canConfig}
          onChange={e => setDescription(e.target.value)}
          onFocus={() => setDescFocused(true)}
          onBlur={() => { setDescFocused(false); saveDescription(); }}
          rows={3}
          placeholder="What is this pipeline used for?"
          style={{
            ...inputStyle(descFocused),
            resize: 'vertical',
            opacity: canConfig ? 1 : 0.6,
          }}
        />
      </div>

      {/* Default pipeline */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 18px',
        border: '1px solid var(--border)', borderRadius: 14,
        background: 'var(--surface)',
        marginBottom: 24,
        transition: 'box-shadow .15s ease',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--text)', marginBottom: 2 }}>
            Default pipeline
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
            New workspaces start with this pipeline active
          </div>
        </div>
        <button
          disabled={!canConfig || pipeline.is_default || updateMut.isPending}
          onClick={() => updateMut.mutate({ is_default: true })}
          style={{
            padding: '7px 16px', borderRadius: 10, fontSize: 12,
            fontFamily: 'var(--font-sans)', fontWeight: 600,
            cursor: pipeline.is_default || !canConfig ? 'default' : 'pointer',
            border: pipeline.is_default ? '1px solid var(--border)' : 'none',
            background: pipeline.is_default ? 'var(--surface2)' : (canConfig ? 'var(--text)' : 'var(--surface2)'),
            color: pipeline.is_default ? 'var(--text3)' : '#fff',
            opacity: !canConfig ? 0.5 : 1,
            transition: 'all .15s ease',
          }}
        >
          {pipeline.is_default ? '✓ Default' : 'Set as default'}
        </button>
      </div>

      {/* Saved indicator */}
      <div style={{
        fontSize: 12, color: 'var(--green, #2d6a4f)',
        fontFamily: 'var(--font-sans)', marginBottom: 16,
        opacity: saved ? 1 : 0,
        transform: saved ? 'translateY(0)' : 'translateY(-4px)',
        transition: 'opacity .2s ease, transform .2s ease',
        height: 20,
      }}>
        ✓ Saved
      </div>

      {/* Danger zone */}
      {canDelete && (
        <div style={{
          border: '1px solid var(--red-bg, #fee2e2)',
          borderRadius: 14, padding: '18px 20px',
          transition: 'border-color .15s ease',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red, #991b1b)', fontFamily: 'var(--font-sans)', marginBottom: 6 }}>
            Danger zone
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)', marginBottom: 14, lineHeight: 1.5 }}>
            Permanently deletes this pipeline, all its stages, fields, and items. Cannot be undone.
          </div>
          <button
            onClick={() => {
              if (confirm(`Delete "${pipeline.name}"? All data will be permanently deleted.`))
                deleteMut.mutate();
            }}
            disabled={deleteMut.isPending}
            style={{
              padding: '7px 16px', background: 'none',
              border: '1px solid var(--red, #991b1b)',
              color: 'var(--red, #991b1b)', borderRadius: 10,
              cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-sans)', fontWeight: 600,
              transition: 'all .15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--red-bg, #fee2e2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none';
            }}
          >
            {deleteMut.isPending ? 'Deleting…' : 'Delete pipeline'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | grep "GeneralTab" | head -10
```

Expected: no errors mentioning `GeneralTab`.

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/web/modules/pipeline/components/settings/GeneralTab.tsx
git commit -m "feat(pipeline): add GeneralTab component for pipeline config"
```

---

### Task 3: Create StagesTab component

**Files:**
- Create: `apps/web/modules/pipeline/components/settings/StagesTab.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  createStage, updateStage, deleteStage, reorderStages,
} from '@/modules/pipeline/lib/pipelines';
import type { Pipeline, PipelineStage } from '@/modules/pipeline/lib/pipelines';
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
                border: isTerminal
                  ? `1px solid var(--border)`
                  : '1px solid var(--border)',
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | grep "StagesTab" | head -10
```

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/web/modules/pipeline/components/settings/StagesTab.tsx
git commit -m "feat(pipeline): add StagesTab with inline editing, reorder, color picker, context menu"
```

---

### Task 4: Create FieldsTab component

**Files:**
- Create: `apps/web/modules/pipeline/components/settings/FieldsTab.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  createField, updateField, deleteField, reorderFields,
} from '@/modules/pipeline/lib/pipelines';
import type { Pipeline, PipelineField } from '@/modules/pipeline/lib/pipelines';
import { FIELD_TYPES, FIELD_TYPE_META } from '@/modules/pipeline/lib/field-types';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.6px', color: 'var(--text3)',
  fontFamily: 'var(--font-sans)', marginBottom: 6, display: 'block',
};

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '8px 12px',
    border: `1px solid ${focused ? 'var(--text2)' : 'var(--border)'}`,
    borderRadius: 10, fontSize: 13, fontFamily: 'var(--font-sans)',
    background: 'var(--surface)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  };
}

export function FieldsTab({ pipeline }: { pipeline: Pipeline }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('pipelines:field.edit');
  const canDelete = hasPermission('pipelines:field.delete');

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);
  const [optionInput, setOptionInput] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Add field form
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState<PipelineField['type']>('text');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<{ label: string; value: string }[]>([]);
  const [addOptionInput, setAddOptionInput] = useState('');
  const [labelFocused, setLabelFocused] = useState(false);
  const [keyFocused, setKeyFocused] = useState(false);
  const [addOptFocused, setAddOptFocused] = useState(false);
  const isAddOptionType = fieldType === 'select' || fieldType === 'multiselect';

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pipeline', pipeline.id] });
    void qc.invalidateQueries({ queryKey: ['pipelines'] });
  };

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<PipelineField> }) =>
      updateField(await getToken(), pipeline.id, id, body),
    onSuccess: () => { invalidate(); setEditingId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteField(await getToken(), pipeline.id, id),
    onSuccess: invalidate,
  });

  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => reorderFields(await getToken(), pipeline.id, ids),
    onSuccess: invalidate,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const key = fieldKey.trim() ||
        fieldLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      return createField(await getToken(), pipeline.id, {
        label: fieldLabel.trim(), key,
        type: fieldType, position: pipeline.fields.length,
        required: fieldRequired,
        options: isAddOptionType ? fieldOptions : null,
      });
    },
    onSuccess: () => {
      invalidate();
      setFieldLabel(''); setFieldKey(''); setFieldType('text');
      setFieldRequired(false); setFieldOptions([]); setAddOptionInput('');
    },
  });

  const sortedFields = [...pipeline.fields].sort((a, b) => a.position - b.position);

  function handleReorder(fieldId: string, direction: 'up' | 'down') {
    const idx = sortedFields.findIndex(f => f.id === fieldId);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sortedFields.length - 1) return;
    const next = [...sortedFields];
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    reorderMut.mutate(next.map(f => f.id));
  }

  function commitEditLabel(field: PipelineField) {
    const trimmed = editingLabel.trim();
    if (trimmed && trimmed !== field.label) {
      updateMut.mutate({ id: field.id, body: { label: trimmed } });
    } else {
      setEditingId(null);
    }
  }

  function addOptionToField(field: PipelineField, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const newOpts = [...(field.options ?? []), { label: trimmed, value }];
    updateMut.mutate({ id: field.id, body: { options: newOpts } });
  }

  function removeOptionFromField(field: PipelineField, i: number) {
    const newOpts = (field.options ?? []).filter((_, j) => j !== i);
    updateMut.mutate({ id: field.id, body: { options: newOpts } });
  }

  function openContextMenu(e: React.MouseEvent, field: PipelineField, idx: number) {
    const isOptionType = field.type === 'select' || field.type === 'multiselect';
    const items = [
      canEdit && {
        label: 'Rename Field', icon: 'pencil',
        onClick: () => { setEditingId(field.id); setEditingLabel(field.label); },
      },
      canEdit && isOptionType && {
        label: 'Edit Options', icon: 'list',
        onClick: () => setOptionsOpenId(optionsOpenId === field.id ? null : field.id),
      },
      canEdit && {
        label: field.required ? 'Mark Optional' : 'Mark Required',
        icon: 'asterisk',
        onClick: () => updateMut.mutate({ id: field.id, body: { required: !field.required } }),
      },
      canEdit && { label: 'Move Up', icon: 'arrow-up', disabled: idx === 0, onClick: () => handleReorder(field.id, 'up') },
      canEdit && { label: 'Move Down', icon: 'arrow-down', disabled: idx === sortedFields.length - 1, onClick: () => handleReorder(field.id, 'down') },
      canDelete && { type: 'separator' as const },
      canDelete && {
        label: 'Delete Field', icon: 'trash-2', danger: true,
        onClick: () => {
          if (confirm(`Delete "${field.label}"? Data will be lost.`)) deleteMut.mutate(field.id);
        },
      },
    ].filter(Boolean) as ContextMenuItem[];
    if (items.length) openMenu(e, items);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {sortedFields.map((field, idx) => {
          const isEditing = editingId === field.id;
          const isOptionType = field.type === 'select' || field.type === 'multiselect';
          const optionsOpen = optionsOpenId === field.id;
          const isHovered = hoveredId === field.id;

          return (
            <div
              key={field.id}
              style={{
                border: '1px solid var(--border)', borderRadius: 12,
                background: 'var(--surface)', overflow: 'hidden',
                boxShadow: isHovered ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
                transform: isHovered ? 'translateY(-1px)' : 'none',
                transition: 'box-shadow .15s ease, transform .15s ease',
              }}
              onMouseEnter={() => setHoveredId(field.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Row */}
              <div
                onContextMenu={e => openContextMenu(e, field, idx)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}
              >
                {/* Type badge */}
                <span style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
                  background: 'var(--surface2)', borderRadius: 6, padding: '3px 7px',
                  fontFamily: 'var(--font-sans)', textTransform: 'uppercase',
                  letterSpacing: '0.4px', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {FIELD_TYPE_META[field.type]?.label ?? field.type}
                </span>

                {/* Label / inline edit */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={e => setEditingLabel(e.target.value)}
                      onBlur={() => commitEditLabel(field)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEditLabel(field);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      style={{
                        padding: '4px 8px', border: '1px solid var(--text2)',
                        borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)',
                        color: 'var(--text)', background: 'var(--surface)',
                        outline: 'none', width: '100%', boxSizing: 'border-box',
                        transition: 'border-color .15s ease',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => canEdit && (setEditingId(field.id), setEditingLabel(field.label))}
                      style={{
                        fontSize: 13, fontFamily: 'var(--font-sans)',
                        color: 'var(--text)', fontWeight: 500,
                        cursor: canEdit ? 'text' : 'default',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', display: 'block',
                      }}
                    >
                      {field.label}
                    </span>
                  )}
                </div>

                {/* Key */}
                <span style={{
                  fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                  background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6,
                  flexShrink: 0,
                }}>
                  {field.key}
                </span>

                {/* Required badge */}
                {field.required && (
                  <span style={{
                    fontSize: 10, color: 'var(--amber, #92400e)',
                    background: 'var(--amber-bg, #fef3c7)',
                    padding: '2px 6px', borderRadius: 999,
                    fontFamily: 'var(--font-sans)', fontWeight: 600, flexShrink: 0,
                  }}>
                    REQ
                  </span>
                )}

                {/* Options toggle */}
                {isOptionType && canEdit && (
                  <button
                    onClick={() => setOptionsOpenId(optionsOpen ? null : field.id)}
                    style={{
                      fontSize: 11, color: optionsOpen ? 'var(--text2)' : 'var(--text3)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '2px 6px', fontFamily: 'var(--font-sans)',
                      flexShrink: 0, transition: 'color .15s ease',
                    }}
                  >
                    {optionsOpen ? '▲' : '▼'} {(field.options ?? []).length}
                  </button>
                )}

                {/* Reorder */}
                {canEdit && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    {(['up', 'down'] as const).map(dir => {
                      const disabled = dir === 'up' ? idx === 0 : idx === sortedFields.length - 1;
                      return (
                        <button
                          key={dir}
                          onClick={() => handleReorder(field.id, dir)}
                          disabled={disabled}
                          style={{
                            width: 20, height: 16, border: 'none', background: 'none',
                            cursor: disabled ? 'default' : 'pointer',
                            color: 'var(--text2)', fontSize: 9, padding: 0, lineHeight: 1,
                            opacity: disabled ? 0.25 : 1,
                            transition: 'opacity .15s ease',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {dir === 'up' ? '▲' : '▼'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Delete */}
                {canDelete && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${field.label}"? Data will be lost.`))
                        deleteMut.mutate(field.id);
                    }}
                    style={{
                      fontSize: 12, color: 'var(--red, #991b1b)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px 8px', borderRadius: 6,
                      fontFamily: 'var(--font-sans)', fontWeight: 500,
                      flexShrink: 0, transition: 'background .15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg, #fee2e2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Options panel */}
              {optionsOpen && isOptionType && (
                <div style={{
                  borderTop: '1px solid var(--border)', padding: '12px 16px',
                  background: 'var(--bg, #f7f6f2)',
                  animation: 'ctx-in .15s ease',
                }}>
                  {(field.options ?? []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {(field.options ?? []).map((opt, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 999, padding: '3px 6px 3px 10px',
                          fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--text)',
                        }}>
                          {opt.label}
                          <button
                            onClick={() => removeOptionFromField(field, i)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '0 2px', color: 'var(--text3)', fontSize: 14, lineHeight: 1,
                              transition: 'color .12s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--red, #991b1b)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={optionInput}
                      onChange={e => setOptionInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addOptionToField(field, optionInput);
                          setOptionInput('');
                        }
                      }}
                      placeholder="Add option (Enter to add)"
                      style={{
                        flex: 1, padding: '6px 10px',
                        border: '1px solid var(--border)', borderRadius: 8,
                        fontSize: 12, fontFamily: 'var(--font-sans)',
                        background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                        transition: 'border-color .15s ease',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--text2)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    />
                    <button
                      onClick={() => { addOptionToField(field, optionInput); setOptionInput(''); }}
                      disabled={!optionInput.trim()}
                      style={{
                        padding: '6px 12px', background: 'var(--surface2)',
                        border: '1px solid var(--border)', borderRadius: 8,
                        cursor: optionInput.trim() ? 'pointer' : 'not-allowed',
                        fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600,
                        color: optionInput.trim() ? 'var(--text2)' : 'var(--text3)',
                        whiteSpace: 'nowrap', transition: 'background .15s ease',
                      }}
                      onMouseEnter={e => { if (optionInput.trim()) e.currentTarget.style.background = 'var(--border)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {pipeline.fields.length === 0 && (
          <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
            No fields yet. Add one below.
          </p>
        )}
      </div>

      {/* Add field form */}
      <div style={{ border: '1px dashed var(--border)', borderRadius: 16, padding: '18px 20px' }}>
        <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 14px' }}>
          Add field
        </h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 2 }}>
            <label style={eyebrow}>Label</label>
            <input
              value={fieldLabel}
              onChange={e => {
                setFieldLabel(e.target.value);
                if (!fieldKey)
                  setFieldKey(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
              }}
              onFocus={() => setLabelFocused(true)}
              onBlur={() => setLabelFocused(false)}
              placeholder="Field label"
              style={inputStyle(labelFocused)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={eyebrow}>Key</label>
            <input
              value={fieldKey}
              onChange={e => setFieldKey(e.target.value)}
              onFocus={() => setKeyFocused(true)}
              onBlur={() => setKeyFocused(false)}
              placeholder="field_key"
              style={{ ...inputStyle(keyFocused), fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: isAddOptionType ? 10 : 0 }}>
          <div style={{ flex: 1 }}>
            <label style={eyebrow}>Type</label>
            <select
              value={fieldType}
              onChange={e => { setFieldType(e.target.value as PipelineField['type']); setFieldOptions([]); setAddOptionInput(''); }}
              style={inputStyle(false)}
            >
              {FIELD_TYPES.map(t => <option key={t} value={t}>{FIELD_TYPE_META[t]?.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
            <input
              type="checkbox" id="field-required-new"
              checked={fieldRequired} onChange={e => setFieldRequired(e.target.checked)}
              style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--text)' }}
            />
            <label htmlFor="field-required-new" style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text2)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
              Required
            </label>
          </div>
          <button
            onClick={() => createMut.mutate()}
            disabled={!fieldLabel.trim() || createMut.isPending || (isAddOptionType && fieldOptions.length === 0)}
            style={{
              padding: '8px 18px',
              background: (!fieldLabel.trim() || (isAddOptionType && fieldOptions.length === 0)) ? 'var(--text3)' : 'var(--text)',
              color: '#fff', border: 'none', borderRadius: 10,
              cursor: (fieldLabel.trim() && (!isAddOptionType || fieldOptions.length > 0)) ? 'pointer' : 'not-allowed',
              fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 600,
              whiteSpace: 'nowrap', transition: 'background .15s ease',
            }}
          >
            {createMut.isPending ? 'Adding…' : 'Add field'}
          </button>
        </div>

        {isAddOptionType && (
          <div>
            <label style={eyebrow}>Options</label>
            {fieldOptions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {fieldOptions.map((opt, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                    {opt.label}
                    <button onClick={() => setFieldOptions(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={addOptionInput}
                onChange={e => setAddOptionInput(e.target.value)}
                onFocus={() => setAddOptFocused(true)}
                onBlur={() => setAddOptFocused(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const trimmed = addOptionInput.trim();
                    if (!trimmed) return;
                    const val = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    setFieldOptions(prev => [...prev, { label: trimmed, value: val }]);
                    setAddOptionInput('');
                  }
                }}
                placeholder="Option label"
                style={inputStyle(addOptFocused)}
              />
              <button
                onClick={() => {
                  const trimmed = addOptionInput.trim();
                  if (!trimmed) return;
                  const val = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                  setFieldOptions(prev => [...prev, { label: trimmed, value: val }]);
                  setAddOptionInput('');
                }}
                disabled={!addOptionInput.trim()}
                style={{ padding: '8px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, cursor: addOptionInput.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, color: addOptionInput.trim() ? 'var(--text2)' : 'var(--text3)', whiteSpace: 'nowrap' }}
              >
                Add option
              </button>
            </div>
          </div>
        )}
      </div>

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | grep "FieldsTab" | head -10
```

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/web/modules/pipeline/components/settings/FieldsTab.tsx
git commit -m "feat(pipeline): add FieldsTab with inline editing, options editor, reorder, context menu"
```

---

### Task 5: Rewrite pipeline config page

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/pipelines/[id]/page.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline } from '@/modules/pipeline/lib/pipelines';
import { GeneralTab } from '@/modules/pipeline/components/settings/GeneralTab';
import { StagesTab } from '@/modules/pipeline/components/settings/StagesTab';
import { FieldsTab } from '@/modules/pipeline/components/settings/FieldsTab';

type Tab = 'general' | 'stages' | 'fields';

const TABS: { key: Tab; label: string; badge?: (stageCount: number, fieldCount: number) => number }[] = [
  { key: 'general', label: 'General' },
  { key: 'stages', label: 'Stages', badge: (s) => s },
  { key: 'fields', label: 'Fields', badge: (_, f) => f },
];

export default function PipelineConfigPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const [tab, setTab] = useState<Tab>('general');

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline', id],
    queryFn: async () => getPipeline(await getToken(), id),
  });

  if (isLoading) {
    return (
      <div style={{ padding: 48, color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div style={{ padding: 48, color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        Pipeline not found.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, padding: '32px 0' }}>
      {/* Back link */}
      <Link
        href="/settings/pipelines"
        style={{
          fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)',
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
          gap: 4, marginBottom: 20, transition: 'color .15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; }}
      >
        ← Pipelines
      </Link>

      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
        letterSpacing: '-0.4px', color: 'var(--text)', margin: '0 0 4px',
      }}>
        {pipeline.name}
      </h1>
      {pipeline.description && (
        <p style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', margin: '0 0 4px', lineHeight: 1.5 }}>
          {pipeline.description}
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', margin: '0 0 28px' }}>
        Configure stages, fields, and settings for this pipeline.
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {TABS.map(t => {
          const badgeCount = t.badge?.(pipeline.stages.length, pipeline.fields.length);
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-sans)',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--text3)',
                borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color .15s ease, border-color .15s ease',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)'; }}
            >
              {t.label}
              {badgeCount !== undefined && (
                <span style={{
                  marginLeft: 6, fontSize: 11, color: 'var(--text3)',
                  background: 'var(--surface2)', borderRadius: 999,
                  padding: '1px 6px', fontWeight: 400,
                  transition: 'background .15s ease',
                }}>
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ animation: 'ctx-in .15s ease' }} key={tab}>
        {tab === 'general' && <GeneralTab pipeline={pipeline} />}
        {tab === 'stages'  && <StagesTab  pipeline={pipeline} />}
        {tab === 'fields'  && <FieldsTab  pipeline={pipeline} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | grep "\[id\]" | head -10
```

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add "apps/web/app/(dashboard)/settings/pipelines/[id]/page.tsx"
git commit -m "feat(pipeline): rewrite config page with General/Stages/Fields tabs"
```

---

### Task 6: Add context menu to pipeline list page

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/pipelines/page.tsx`

- [ ] **Step 1: Add imports at the top of the file**

After the existing imports, add:
```typescript
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';
import { updatePipeline } from '@/modules/pipeline/lib/pipelines';
```

- [ ] **Step 2: Add hooks inside `PipelinesSettingsPage`**

After the existing hooks (`const { data: pipelines = [] }` etc.), add:

```typescript
  const { hasPermission } = useAuth();
  const canConfig = hasPermission('pipelines:config');
  const canDelete = hasPermission('pipelines:delete');
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null);
  const [inlineRenameVal, setInlineRenameVal] = useState('');

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: { name?: string; is_default?: boolean } }) =>
      updatePipeline(await getToken(), id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  function openPipelineMenu(e: React.MouseEvent, p: (typeof pipelines)[0]) {
    const items = [
      { label: 'Configure →', icon: 'settings', onClick: () => { window.location.href = `/settings/pipelines/${p.id}`; } },
      canConfig && { label: 'Rename', icon: 'pencil', onClick: () => { setInlineRenameId(p.id); setInlineRenameVal(p.name); } },
      canConfig && { label: 'Set as Default', icon: 'star', disabled: p.is_default, onClick: () => updateMut.mutate({ id: p.id, body: { is_default: true } }) },
      canDelete && { type: 'separator' as const },
      canDelete && { label: 'Delete', icon: 'trash-2', danger: true, onClick: () => { if (confirm(`Delete "${p.name}"?`)) deleteMut.mutate(p.id); } },
    ].filter(Boolean) as ContextMenuItem[];
    openMenu(e, items);
  }
```

- [ ] **Step 3: Update each pipeline card `<div>` to use onContextMenu and support inline rename**

Find the pipeline card `<div key={p.id}` block. Add `onContextMenu` to the outer div and update the name display section:

```typescript
            <div key={p.id}
              onContextMenu={e => openPipelineMenu(e, p)}
              style={{ ... }}  // keep existing styles
            >
              <div style={{ flex: 1 }}>
                {inlineRenameId === p.id ? (
                  <input
                    autoFocus
                    value={inlineRenameVal}
                    onChange={e => setInlineRenameVal(e.target.value)}
                    onBlur={() => {
                      const trimmed = inlineRenameVal.trim();
                      if (trimmed && trimmed !== p.name)
                        updateMut.mutate({ id: p.id, body: { name: trimmed } });
                      setInlineRenameId(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setInlineRenameId(null);
                    }}
                    style={{
                      fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)',
                      color: 'var(--text)', border: '1px solid var(--text2)',
                      borderRadius: 8, padding: '3px 8px', outline: 'none',
                      background: 'var(--surface)', boxSizing: 'border-box',
                      width: '100%', transition: 'border-color .15s ease',
                    }}
                  />
                ) : (
                  <div style={{
                    fontFamily: 'var(--font-sans)', fontSize: 14,
                    fontWeight: 600, color: 'var(--text)', marginBottom: 3,
                  }}>
                    {p.name}
                    {p.is_default && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 7px', borderRadius: 999, verticalAlign: 'middle', fontFamily: 'var(--font-sans)' }}>
                        DEFAULT
                      </span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
                  {p.stages.length} stage{p.stages.length !== 1 ? 's' : ''}
                  {' · '}
                  {p.fields.length} field{p.fields.length !== 1 ? 's' : ''}
                </div>
              </div>
              {/* rest of card unchanged */}
```

- [ ] **Step 4: Add `<ContextMenu>` at the bottom of the returned JSX (before the closing `</div>`)**

```typescript
      <ContextMenu menu={menu} onClose={closeMenu} />
```

- [ ] **Step 5: TypeScript check and commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | grep "pipelines/page" | head -10
```

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add "apps/web/app/(dashboard)/settings/pipelines/page.tsx"
git commit -m "feat(pipeline): add right-click context menu to pipeline list cards"
```

---

### Task 7: Add context menu to kanban deal cards

**Files:**
- Modify: `apps/web/modules/pipeline/components/kanban/KanbanCard.tsx`
- Modify: `apps/web/modules/pipeline/components/kanban/KanbanColumn.tsx`
- Modify: `apps/web/modules/pipeline/components/kanban/KanbanBoard.tsx`

- [ ] **Step 1: Add `onContextMenu` prop to KanbanCard**

In `KanbanCard.tsx`, update the `Props` interface:

```typescript
interface Props {
  item: PipelineItem;
  fields: PipelineField[];
  isDragging: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}
```

Add `onContextMenu` to the destructured props and the outer `<div>`:

```typescript
export function KanbanCard({ item, fields, isDragging, onClick, onDragStart, onDragEnd, onContextMenu }: Props) {
  // ... existing state ...

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // existing styles unchanged
      }}
    >
      {/* existing content unchanged */}
    </div>
  );
}
```

- [ ] **Step 2: Thread `onCardContextMenu` through KanbanColumn**

In `KanbanColumn.tsx`, update `Props`:

```typescript
interface Props {
  // ... existing props ...
  onCardContextMenu: (itemId: string, e: React.MouseEvent) => void;
}
```

Update the function signature and pass to each `KanbanCard`:

```typescript
export function KanbanColumn({
  stage, items, fields, draggingId, isDragOver,
  onDragOver, onDragLeave, onDrop, onCardClick,
  onCardDragStart, onCardDragEnd, onAddClick, onCardContextMenu,
}: Props) {
  // ... existing ...

          <KanbanCard
            key={item.id}
            item={item}
            fields={fields}
            isDragging={draggingId === item.id}
            onClick={() => onCardClick(item.id)}
            onDragStart={() => onCardDragStart(item.id)}
            onDragEnd={onCardDragEnd}
            onContextMenu={e => onCardContextMenu(item.id, e)}
          />
```

- [ ] **Step 3: Add full context menu to KanbanBoard**

Replace `KanbanBoard.tsx` entirely:

```typescript
'use client';
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItems, moveItem, deleteItem } from '@/modules/pipeline/lib/items';
import { KanbanColumn } from './KanbanColumn';
import { ItemDetail } from '@/modules/pipeline/components/detail/ItemDetail';
import { ItemForm } from '@/modules/pipeline/components/shared/ItemForm';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';

interface Props {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}

export function KanbanBoard({ pipeline, search, addTrigger }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('pipelines:edit');
  const canDelete = hasPermission('pipelines:delete');

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formStageId, setFormStageId] = useState<string | null>(null);
  const [lastTrigger, setLastTrigger] = useState(addTrigger);

  useEffect(() => {
    if (addTrigger !== lastTrigger) {
      setLastTrigger(addTrigger);
      setFormStageId(pipeline.stages[0]?.id ?? null);
    }
  }, [addTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipeline.id],
    queryFn: async () => listItems(await getToken(), pipeline.id),
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, stage_id, position }: { id: string; stage_id: string; position: number }) =>
      moveItem(await getToken(), id, { stage_id, position }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipeline.id] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteItem(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipeline.id] }),
  });

  const filteredItems = search
    ? items.filter(item =>
        Object.values(item.field_values).some(v =>
          String(v ?? '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : items;

  const itemsByStage = useCallback(
    (stageId: string) => filteredItems.filter(i => i.stage_id === stageId),
    [filteredItems]
  );

  const wonStage  = pipeline.stages.find(s => s.is_won);
  const lostStage = pipeline.stages.find(s => s.is_lost);
  const activeStages = pipeline.stages.filter(s => !s.is_won && !s.is_lost);

  function openCardContextMenu(itemId: string, e: React.MouseEvent) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const isOwner = user?.id === String(item.field_values['owner_id'] ?? '');
    const inWon  = item.stage_id === wonStage?.id;
    const inLost = item.stage_id === lostStage?.id;

    const items_menu = [
      { label: 'Open', icon: 'external-link', onClick: () => setSelectedId(itemId) },
      canEdit && activeStages.length > 0 && {
        type: 'submenu' as const,
        label: 'Move to Stage',
        icon: 'arrow-right',
        items: activeStages
          .filter(s => s.id !== item.stage_id)
          .map(s => ({
            label: s.name,
            swatch: s.color ?? '#6366f1',
            onClick: () => moveMut.mutate({ id: itemId, stage_id: s.id, position: itemsByStage(s.id).length }),
          })),
      },
      canEdit && !isOwner && user && {
        label: 'Assign to Me',
        icon: 'user',
        onClick: () => moveMut.mutate({ id: itemId, stage_id: item.stage_id, position: item.position }),
      },
      (canEdit || canDelete) && { type: 'separator' as const },
      canEdit && wonStage && !inWon && {
        label: 'Mark as Won',
        icon: 'check-circle',
        onClick: () => moveMut.mutate({ id: itemId, stage_id: wonStage.id, position: itemsByStage(wonStage.id).length }),
      },
      canEdit && lostStage && !inLost && {
        label: 'Mark as Lost',
        icon: 'x-circle',
        onClick: () => moveMut.mutate({ id: itemId, stage_id: lostStage.id, position: itemsByStage(lostStage.id).length }),
      },
      canDelete && { type: 'separator' as const },
      canDelete && {
        label: 'Delete',
        icon: 'trash-2',
        danger: true,
        onClick: () => {
          if (confirm('Delete this item? This cannot be undone.'))
            deleteMut.mutate(itemId);
        },
      },
    ].filter(Boolean) as ContextMenuItem[];

    openMenu(e, items_menu);
  }

  return (
    <>
      <div style={{
        display: 'flex', gap: 20, padding: '20px 24px',
        overflowX: 'auto', height: '100%',
        alignItems: 'flex-start', boxSizing: 'border-box',
      }}>
        {pipeline.stages.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            items={itemsByStage(stage.id)}
            fields={pipeline.fields}
            draggingId={draggingId}
            isDragOver={dragOverStage === stage.id}
            onDragOver={() => setDragOverStage(stage.id)}
            onDragLeave={() => setDragOverStage(prev => prev === stage.id ? null : prev)}
            onDrop={() => {
              if (draggingId) {
                const destItems = itemsByStage(stage.id);
                moveMut.mutate({ id: draggingId, stage_id: stage.id, position: destItems.length });
                setDraggingId(null);
              }
              setDragOverStage(null);
            }}
            onCardClick={id => setSelectedId(id)}
            onCardDragStart={id => setDraggingId(id)}
            onCardDragEnd={() => setDraggingId(null)}
            onAddClick={() => setFormStageId(stage.id)}
            onCardContextMenu={openCardContextMenu}
          />
        ))}
      </div>

      {selectedId && (
        <ItemDetail itemId={selectedId} pipeline={pipeline} onClose={() => setSelectedId(null)} />
      )}

      {formStageId !== null && (
        <ItemForm
          pipelineId={pipeline.id}
          stages={pipeline.stages}
          fields={pipeline.fields}
          defaultStageId={formStageId}
          onClose={() => setFormStageId(null)}
        />
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | grep -E "KanbanCard|KanbanColumn|KanbanBoard" | head -20
```

Fix any type errors. The most likely: `onCardContextMenu` prop not matching. Verify `KanbanColumn` signature matches what `KanbanBoard` passes.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/web/modules/pipeline/components/kanban/KanbanCard.tsx apps/web/modules/pipeline/components/kanban/KanbanColumn.tsx apps/web/modules/pipeline/components/kanban/KanbanBoard.tsx
git commit -m "feat(kanban): add right-click context menu to deal cards with move/won/lost/delete actions"
```

---

## Done

Plan 2 complete. All UI implemented:
- Sidebar layout removed
- 3-tab config page with General / Stages / Fields
- Inline editing + color pickers + reorder on all rows
- Smooth hover lifts, focus rings, transition animations throughout
- Context menus on pipeline list cards, config rows, and kanban deal cards
- Permission-gated menu items via `hasPermission()`
