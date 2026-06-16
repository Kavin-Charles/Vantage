'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listPipelines, createPipeline, deletePipeline, updatePipeline } from '@/modules/pipeline/lib/pipelines';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';
import Link from 'next/link';

export default function PipelinesSettingsPage() {
  const router = useRouter();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [createHovered, setCreateHovered] = useState(false);
  const [addHovered, setAddHovered] = useState(false);

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const createMut = useMutation({
    mutationFn: async () => createPipeline(await getToken(), { name: newName }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pipelines'] });
      setNewName('');
      setCreating(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deletePipeline(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

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
      { label: 'Configure →', icon: 'settings', onClick: () => router.push(`/settings/pipelines/${p.id}`) },
      canConfig && { label: 'Rename', icon: 'pencil', onClick: () => { setInlineRenameId(p.id); setInlineRenameVal(p.name); } },
      canConfig && { label: 'Set as Default', icon: 'star', disabled: p.is_default, onClick: () => updateMut.mutate({ id: p.id, body: { is_default: true } }) },
      canDelete && { type: 'separator' as const },
      canDelete && { label: 'Delete', icon: 'trash-2', danger: true, onClick: () => { if (confirm(`Delete "${p.name}"? All items in this pipeline will be permanently deleted.`)) deleteMut.mutate(p.id); } },
    ].filter(Boolean) as ContextMenuItem[];
    openMenu(e, items);
  }

  const eyebrow: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: 'var(--text3)',
    fontFamily: 'var(--font-sans)',
    marginBottom: 6,
    display: 'block',
  };

  return (
    <div style={{ maxWidth: 580, padding: '32px 0' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.4px',
            color: 'var(--text)',
            margin: '0 0 4px',
          }}>
            Pipelines
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', margin: 0 }}>
            Create and configure pipelines for your team.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          onMouseEnter={() => setAddHovered(true)}
          onMouseLeave={() => setAddHovered(false)}
          style={{
            padding: '9px 18px',
            background: addHovered ? '#1a2244' : 'var(--text)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            transition: 'all .15s ease',
          }}
        >
          + New pipeline
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1 }}>
            <label style={eyebrow}>Pipeline name</label>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createMut.mutate(); if (e.key === 'Escape') setCreating(false); }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="e.g. Sales, Support, Recruitment"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${inputFocused ? 'var(--text2)' : 'var(--border)'}`,
                borderRadius: 10,
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                background: 'var(--surface)',
                color: 'var(--text)',
                outline: 'none',
                boxShadow: inputFocused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
                transition: 'border-color .15s ease, box-shadow .15s ease',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={() => createMut.mutate()}
            disabled={!newName.trim() || createMut.isPending}
            onMouseEnter={() => setCreateHovered(true)}
            onMouseLeave={() => setCreateHovered(false)}
            style={{
              padding: '8px 18px',
              background: !newName.trim() ? 'var(--text3)' : createHovered ? '#1a2244' : 'var(--text)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: newName.trim() ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              transition: 'all .15s ease',
            }}
          >
            {createMut.isPending ? 'Creating…' : 'Create'}
          </button>
          <button
            onClick={() => setCreating(false)}
            style={{
              padding: '8px 14px',
              border: '1px solid var(--border)',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              background: 'var(--surface)',
              color: 'var(--text2)',
              transition: 'all .15s ease',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pipeline list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pipelines.map(p => (
          <div key={p.id} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            transition: 'box-shadow .15s ease',
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
          onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow = 'none'; }}
          onContextMenu={e => openPipelineMenu(e, p)}
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
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
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

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link
                href={`/settings/pipelines/${p.id}`}
                style={{
                  fontSize: 13,
                  color: 'var(--text2)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  textDecoration: 'none',
                  padding: '6px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  transition: 'all .15s ease',
                  display: 'inline-block',
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)'; }}
              >
                Configure →
              </Link>
              <button
                onClick={() => {
                  if (confirm(`Delete "${p.name}"? All items in this pipeline will be permanently deleted.`))
                    deleteMut.mutate(p.id);
                }}
                style={{
                  fontSize: 12,
                  color: 'var(--red, #991b1b)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  background: 'none',
                  border: '1px solid transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  padding: '6px 10px',
                  transition: 'all .15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg, #fee2e2)'; e.currentTarget.style.borderColor = 'var(--red-bg, #fee2e2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent'; }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {pipelines.length === 0 && (
          <div style={{
            padding: 48,
            textAlign: 'center',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: 16,
          }}>
            <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13, margin: 0 }}>
              No pipelines yet. Create one above.
            </p>
          </div>
        )}
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
