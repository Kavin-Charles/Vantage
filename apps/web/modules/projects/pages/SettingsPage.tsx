'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskLabel } from '@/modules/projects/lib/api';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { RecurringRulesPanel } from '@/modules/projects/components/RecurringRulesPanel';
import { CustomFieldsManager } from '@/modules/projects/components/CustomFieldsManager';

const HEALTH_OPTIONS = [
  { value: 'ON_TRACK',  label: 'On Track'  },
  { value: 'AT_RISK',   label: 'At Risk'   },
  { value: 'OFF_TRACK', label: 'Off Track' },
] as const;

const PRESET_COLORS = [
  '#2d6a4f', '#1e3a8a', '#92400e', '#991b1b',
  '#4a1d96', '#0e7490', '#1a1814', '#6b665c',
];

const inputStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13,
  padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
  color: 'var(--text2)', marginBottom: 6, display: 'block',
};

export default function SettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();

  // Project data
  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const token = await getToken();
      return pmApi.getProject(token, projectId);
    },
  });
  const project = data?.data;

  const [form, setForm] = useState({
    name: '', description: '', color: '',
    health: 'ON_TRACK', start_date: '', end_date: '',
  });
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!project) return;
    setForm({
      name: project.name,
      description: project.description ?? '',
      color: project.color ?? '',
      health: project.health,
      start_date: project.start_date ? project.start_date.slice(0, 10) : '',
      end_date: project.end_date ? project.end_date.slice(0, 10) : '',
    });
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: async (body: Parameters<typeof pmApi.updateProject>[2]) => {
      const token = await getToken();
      return pmApi.updateProject(token, projectId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.deleteProject(token, projectId);
    },
    onSuccess: () => router.push('/projects'),
  });

  // Labels
  const { data: labelsData, refetch: refetchLabels } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: async () => {
      const token = await getToken();
      return pmApi.listLabels(token, projectId);
    },
  });
  const labels: TaskLabel[] = labelsData?.data ?? [];

  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#2d6a4f');
  const [editingLabel, setEditingLabel] = useState<{ id: string; name: string; color: string } | null>(null);

  const createLabelMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const token = await getToken();
      return pmApi.createLabel(token, projectId, { name, color });
    },
    onSuccess: () => {
      setNewLabelName('');
      void refetchLabels();
    },
  });

  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const token = await getToken();
      return pmApi.updateLabel(token, projectId, id, { name, color });
    },
    onSuccess: () => {
      setEditingLabel(null);
      void refetchLabels();
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (labelId: string) => {
      const token = await getToken();
      return pmApi.deleteLabel(token, projectId, labelId);
    },
    onSuccess: () => void refetchLabels(),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      name: form.name,
      description: form.description || null,
      color: form.color || null,
      health: form.health as 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK',
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
  }

  function handleArchive() {
    if (!confirm('Archive this project? It will be hidden from active projects but not deleted.')) return;
    updateMutation.mutate({ status: 'ARCHIVED' });
  }

  function handleDelete() {
    if (!confirm('Delete this project permanently? This cannot be undone.')) return;
    deleteMutation.mutate();
  }

  if (isLoading) {
    return <div style={{ padding: 24, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 24px' }}>
        Settings
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 20, alignItems: 'start' }}>

        {/* Left: General + Danger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form onSubmit={handleSave}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 16px' }}>
                General
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Project Name</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div>
                  <label style={labelStyle}>Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: 'none', cursor: 'pointer', flexShrink: 0, outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                    ))}
                    <input type="text" placeholder="#hex" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...inputStyle, width: 80 }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Health</label>
                  <select value={form.health} onChange={e => setForm(f => ({ ...f, health: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {HEALTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
              </div>
            </div>

            {updateMutation.isError && (
              <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: '0 0 12px' }}>Failed to save changes.</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button type="submit" disabled={updateMutation.isPending} style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
              {savedFlash && <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--green)' }}>Saved</span>}
            </div>
          </form>

          {/* Danger zone */}
          <div style={{ background: 'var(--surface)', border: '1px solid #fecaca', borderRadius: 10, padding: 20 }}>
            <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 16px' }}>
              Danger Zone
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 14 }}>
                <div>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>Archive Project</p>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: 0 }}>Hide from active projects. Can be restored from the projects list.</p>
                </div>
                <button type="button" onClick={handleArchive} disabled={updateMutation.isPending || project?.status === 'ARCHIVED'} style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 7, flexShrink: 0, background: 'transparent', color: 'var(--amber)', border: '1px solid var(--amber-bg)', cursor: 'pointer', opacity: project?.status === 'ARCHIVED' ? 0.5 : 1 }}>
                  {project?.status === 'ARCHIVED' ? 'Archived' : 'Archive'}
                </button>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>Delete Project</p>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: 0 }}>Permanently remove this project and all its data.</p>
                </div>
                <button type="button" onClick={handleDelete} disabled={deleteMutation.isPending} style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 7, flexShrink: 0, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #fecaca', cursor: 'pointer' }}>
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Labels + Custom Fields */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
            Labels
          </p>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
            Apply labels to tasks to categorize and filter work.
          </p>

          {labels.length === 0 && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 16, fontStyle: 'italic' }}>
              No labels yet.
            </div>
          )}

          {labels.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {labels.map(l => {
                const isEditing = editingLabel?.id === l.id;
                return (
                  <div key={l.id}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="color"
                          value={editingLabel.color}
                          onChange={e => setEditingLabel(prev => prev ? { ...prev, color: e.target.value } : prev)}
                          style={{ width: 36, height: 34, borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                        />
                        <input
                          autoFocus
                          value={editingLabel.name}
                          onChange={e => setEditingLabel(prev => prev ? { ...prev, name: e.target.value } : prev)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && editingLabel.name.trim()) updateLabelMutation.mutate({ id: editingLabel.id, name: editingLabel.name.trim(), color: editingLabel.color });
                            if (e.key === 'Escape') setEditingLabel(null);
                          }}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => { if (editingLabel.name.trim()) updateLabelMutation.mutate({ id: editingLabel.id, name: editingLabel.name.trim(), color: editingLabel.color }); }}
                          disabled={!editingLabel.name.trim() || updateLabelMutation.isPending}
                          style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 8, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer', opacity: !editingLabel.name.trim() ? 0.5 : 1, flexShrink: 0 }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingLabel(null)}
                          style={{ fontFamily: 'DM Sans', fontSize: 13, padding: '8px 10px', borderRadius: 8, background: 'none', color: 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{l.name}</span>
                        <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: `${l.color}20`, color: l.color, border: `1px solid ${l.color}30` }}>{l.color}</span>
                        <button onClick={() => setEditingLabel({ id: l.id, name: l.name, color: l.color })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: '0 4px' }} title="Edit label">
                          <Icon name="edit" size={13} />
                        </button>
                        <button onClick={() => deleteLabelMutation.mutate(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: '0 2px', opacity: 0.7 }} title="Delete label">
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Create new label */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={newLabelColor}
              onChange={e => setNewLabelColor(e.target.value)}
              style={{ width: 36, height: 34, borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
            />
            <input
              value={newLabelName}
              onChange={e => setNewLabelName(e.target.value)}
              placeholder="Label name…"
              onKeyDown={e => {
                if (e.key === 'Enter' && newLabelName.trim()) createLabelMutation.mutate({ name: newLabelName.trim(), color: newLabelColor });
              }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => { if (newLabelName.trim()) createLabelMutation.mutate({ name: newLabelName.trim(), color: newLabelColor }); }}
              disabled={!newLabelName.trim() || createLabelMutation.isPending}
              style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer', opacity: !newLabelName.trim() ? 0.5 : 1, flexShrink: 0 }}
            >
              {createLabelMutation.isPending ? '…' : 'Add'}
            </button>
          </div>
          {createLabelMutation.isError && (
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: '8px 0 0' }}>Failed to create label.</p>
          )}
        </div>
        <CustomFieldsManager projectId={projectId} />
        </div>
      </div>

      <RecurringRulesPanel projectId={projectId} />
    </div>
  );
}
