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
