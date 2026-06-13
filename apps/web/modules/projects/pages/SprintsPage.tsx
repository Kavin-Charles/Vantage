'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface Sprint {
  id: string;
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  goal: string | null;
  velocity: number | null;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  PLANNED:   { bg: 'var(--surface2)',            color: 'var(--text3)', label: 'Planned'   },
  ACTIVE:    { bg: 'var(--blue-bg, #dbeafe)',    color: 'var(--blue)',  label: 'Active'    },
  COMPLETED: { bg: 'var(--green-bg, #d8f3dc)',   color: 'var(--green)', label: 'Completed' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PLANNED;
  return (
    <span style={{
      fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 6,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SprintsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', goal: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Sprint[] }>(`/api/projects/${projectId}/sprints`, { token });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; start_date: string; end_date: string; goal?: string }) => {
      const token = await getToken();
      return apiFetch<{ data: Sprint }>(`/api/projects/${projectId}/sprints`, {
        token, method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', projectId] });
      setForm({ name: '', start_date: '', end_date: '', goal: '' });
      setShowForm(false);
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ sprintId, updates }: { sprintId: string; updates: Partial<Sprint> }) => {
      const token = await getToken();
      return apiFetch<{ data: Sprint }>(`/api/projects/${projectId}/sprints/${sprintId}`, {
        token, method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', projectId] }),
  });

  const sprints = data?.data ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.start_date || !form.end_date) return;
    createMutation.mutate({
      name: form.name.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      ...(form.goal.trim() ? { goal: form.goal.trim() } : {}),
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>
          Sprints
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            padding: '7px 14px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          + New Sprint
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, marginBottom: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <input
            required
            placeholder="Sprint name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
                Start date
              </label>
              <input
                required
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                style={{
                  width: '100%', fontFamily: 'DM Sans', fontSize: 13,
                  padding: '8px 10px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
                End date
              </label>
              <input
                required
                type="date"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                style={{
                  width: '100%', fontFamily: 'DM Sans', fontSize: 13,
                  padding: '8px 10px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <input
            placeholder="Goal (optional)"
            value={form.goal}
            onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
            style={{
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={createMutation.isPending}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                padding: '7px 14px', borderRadius: 7,
                background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                fontFamily: 'DM Sans', fontSize: 13,
                padding: '7px 14px', borderRadius: 7,
                background: 'transparent', color: 'var(--text2)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</p>
      )}

      {!isLoading && sprints.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14,
        }}>
          No sprints yet. Create one to start planning iterations.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sprints.map(s => (
          <div
            key={s.id}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {s.name}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                  {formatDate(s.start_date)} – {formatDate(s.end_date)}
                </span>
                {s.goal && (
                  <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', margin: '6px 0 0' }}>
                    {s.goal}
                  </p>
                )}
                {s.status === 'COMPLETED' && s.velocity != null && (
                  <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '4px 0 0' }}>
                    Velocity: <strong style={{ color: 'var(--text2)' }}>{s.velocity} pts</strong>
                  </p>
                )}
              </div>

              {s.status === 'PLANNED' && (
                <button
                  onClick={() => patchMutation.mutate({ sprintId: s.id, updates: { status: 'ACTIVE' } })}
                  disabled={patchMutation.isPending}
                  style={{
                    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                    padding: '5px 10px', borderRadius: 6, flexShrink: 0,
                    background: 'var(--blue-bg, #dbeafe)', color: 'var(--blue)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  Activate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
