'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string;
  status: string;
  client_visible: boolean;
  position: number;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  PENDING:   { bg: 'var(--blue-bg, #dbeafe)',   color: 'var(--blue)',  label: 'Pending'   },
  COMPLETED: { bg: 'var(--green-bg, #d8f3dc)',  color: 'var(--green)', label: 'Completed' },
  MISSED:    { bg: 'var(--red-bg, #fee2e2)',    color: 'var(--red)',   label: 'Missed'    },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
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

export default function MilestonesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', due_date: '', client_visible: false });

  const { data, isLoading } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Milestone[] }>(`/api/projects/${projectId}/milestones`, { token });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; due_date: string; client_visible: boolean }) => {
      const token = await getToken();
      return apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones`, {
        token, method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] });
      setForm({ name: '', due_date: '', client_visible: false });
      setShowForm(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      const token = await getToken();
      return apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones/${milestoneId}`, {
        token, method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      const token = await getToken();
      return apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/milestones/${milestoneId}`, {
        token, method: 'DELETE',
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones', projectId] }),
  });

  const milestones = data?.data ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.due_date) return;
    createMutation.mutate({ name: form.name.trim(), due_date: form.due_date, client_visible: form.client_visible });
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>
          Milestones
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            padding: '7px 14px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          + Add Milestone
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
            placeholder="Milestone name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          <input
            required
            type="date"
            value={form.due_date}
            onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            style={{
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.client_visible}
              onChange={e => setForm(f => ({ ...f, client_visible: e.target.checked }))}
            />
            Visible to client
          </label>
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

      {!isLoading && milestones.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14,
        }}>
          No milestones yet. Add one to track key deliverables.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {milestones.map(m => (
          <div
            key={m.id}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {m.name}
                  </span>
                  <StatusBadge status={m.status} />
                  {m.client_visible && (
                    <span style={{
                      fontFamily: 'DM Sans', fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      background: 'var(--surface2)', color: 'var(--text3)',
                    }}>
                      Client visible
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                  Due {new Date(m.due_date).toLocaleDateString()}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {m.status === 'PENDING' && (
                  <button
                    onClick={() => completeMutation.mutate(m.id)}
                    disabled={completeMutation.isPending}
                    style={{
                      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                      padding: '5px 10px', borderRadius: 6,
                      background: 'var(--green-bg, #d8f3dc)', color: 'var(--green)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    Mark complete
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(m.id)}
                  style={{
                    fontFamily: 'DM Sans', fontSize: 12,
                    padding: '5px 10px', borderRadius: 6,
                    background: 'transparent', color: 'var(--text3)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
