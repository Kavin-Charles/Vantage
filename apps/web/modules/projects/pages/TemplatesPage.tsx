'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface Template {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
}

interface CreatedProject {
  id: string;
  name: string;
}

export default function TemplatesPage() {
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['project-templates'],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Template[] }>('/api/project-templates', { token });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ templateId, name }: { templateId: string; name: string }) => {
      const token = await getToken();
      return apiFetch<{ data: CreatedProject }>(`/api/project-templates/${templateId}/apply`, {
        token,
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: (res) => {
      setApplyingId(null);
      qc.invalidateQueries({ queryKey: ['projects'] });
      router.push(`/projects/${res.data.id}/board`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const token = await getToken();
      return apiFetch<{ data: { id: string } }>(`/api/project-templates/${templateId}`, {
        token,
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-templates'] });
    },
  });

  function handleApply(templateId: string, name: string) {
    if (!name.trim()) return;
    applyMutation.mutate({ templateId, name: name.trim() });
  }

  const templates = data?.data ?? [];
  const myTemplates = templates.filter(t => !t.is_public);
  const publicTemplates = templates.filter(t => t.is_public);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 24, color: 'var(--text)', margin: '0 0 8px' }}>
        Project Templates
      </h2>
      <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)', margin: '0 0 32px' }}>
        Start a new project from a template, or save any project as a template.
      </p>

      {isLoading ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>Loading...</div>
      ) : (
        <>
          {applyMutation.error && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
              Failed to create project from template.
            </div>
          )}
          {deleteMutation.error && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
              Failed to delete template.
            </div>
          )}

          {/* My templates */}
          <Section
            title="Workspace Templates"
            templates={myTemplates}
            applyingId={applyingId}
            newName={newName}
            onNewNameChange={setNewName}
            onStartApply={(t) => { setApplyingId(t.id); setNewName(`${t.name} copy`); }}
            onCancelApply={() => setApplyingId(null)}
            onApply={handleApply}
            onDelete={t => deleteMutation.mutate(t.id)}
            isPending={applyMutation.isPending || deleteMutation.isPending}
            showDelete
          />

          {/* Public templates */}
          {publicTemplates.length > 0 && (
            <Section
              title="Built-in Templates"
              templates={publicTemplates}
              applyingId={applyingId}
              newName={newName}
              onNewNameChange={setNewName}
              onStartApply={(t) => { setApplyingId(t.id); setNewName(`${t.name} copy`); }}
              onCancelApply={() => setApplyingId(null)}
              onApply={handleApply}
              isPending={applyMutation.isPending}
            />
          )}

          {templates.length === 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '48px 24px', textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'Instrument Serif', fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>
                No templates yet
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>
                Open any project and use "Save as Template" to create one.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  templates,
  applyingId,
  newName,
  onNewNameChange,
  onStartApply,
  onCancelApply,
  onApply,
  onDelete,
  isPending,
  showDelete = false,
}: {
  title: string;
  templates: Template[];
  applyingId: string | null;
  newName: string;
  onNewNameChange: (v: string) => void;
  onStartApply: (t: Template) => void;
  onCancelApply: () => void;
  onApply: (templateId: string, name: string) => void;
  onDelete?: (t: Template) => void;
  isPending: boolean;
  showDelete?: boolean;
}) {
  if (templates.length === 0 && !showDelete) return null;

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      {templates.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>
          No templates in this section yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              isApplying={applyingId === t.id}
              newName={newName}
              onNewNameChange={onNewNameChange}
              onStartApply={onStartApply}
              onCancelApply={onCancelApply}
              onApply={onApply}
              onDelete={showDelete ? onDelete : undefined}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  isApplying,
  newName,
  onNewNameChange,
  onStartApply,
  onCancelApply,
  onApply,
  onDelete,
  isPending,
}: {
  template: Template;
  isApplying: boolean;
  newName: string;
  onNewNameChange: (v: string) => void;
  onStartApply: (t: Template) => void;
  onCancelApply: () => void;
  onApply: (templateId: string, name: string) => void;
  onDelete?: (t: Template) => void;
  isPending: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--surface2)' : 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 10, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'background 0.15s',
      }}
    >
      <div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {template.name}
        </div>
        {template.description && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
            {template.description}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
        {isApplying ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
            <input
              value={newName}
              onChange={e => onNewNameChange(e.target.value)}
              placeholder="Project name"
              autoFocus
              style={{
                flex: 1, minWidth: 0,
                border: '1px solid var(--border)', borderRadius: 6,
                padding: '4px 8px', fontSize: 13, fontFamily: 'DM Sans',
                background: 'var(--bg)', color: 'var(--text)', outline: 'none',
              }}
            />
            <button
              onClick={() => onApply(template.id, newName)}
              disabled={isPending || !newName.trim()}
              style={{
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '5px 12px',
                cursor: isPending || !newName.trim() ? 'not-allowed' : 'pointer',
                opacity: isPending || !newName.trim() ? 0.6 : 1,
              }}
            >
              Create
            </button>
            <button
              onClick={onCancelApply}
              style={{
                fontFamily: 'DM Sans', fontSize: 12,
                background: 'transparent', color: 'var(--text3)',
                border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => onStartApply(template)}
              disabled={isPending}
              style={{
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '6px 14px',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.6 : 1, flex: 1,
              }}
            >
              Use template
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(template)}
                disabled={isPending}
                style={{
                  fontFamily: 'DM Sans', fontSize: 12,
                  background: 'transparent', color: 'var(--text3)',
                  border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
