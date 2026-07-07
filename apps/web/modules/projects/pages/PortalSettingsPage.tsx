'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { ApprovalsPanel } from '@/modules/projects/components/ApprovalsPanel';

interface PortalLink {
  id: string;
  project_id: string;
  label: string;
  token: string;
  is_active: boolean;
  last_accessed: string | null;
  created_at: string;
}

function getPortalUrl(token: string): string {
  const base = process.env['NEXT_PUBLIC_APP_URL'] ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/portal/${token}`;
}

export default function PortalSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', password: '' });
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['portal', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: PortalLink[] }>(`/api/projects/${projectId}/portal`, { token });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: { label: string; password?: string }) => {
      const token = await getToken();
      return apiFetch<{ data: PortalLink }>(`/api/projects/${projectId}/portal`, {
        token,
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', projectId] });
      setForm({ label: '', password: '' });
      setShowForm(false);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (portalId: string) => {
      const token = await getToken();
      return apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/portal/${portalId}`, {
        token,
        method: 'DELETE',
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', projectId] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) return;
    const body: { label: string; password?: string } = { label: form.label.trim() };
    if (form.password.trim().length >= 6) body.password = form.password.trim();
    createMutation.mutate(body);
  }

  async function copyUrl(token: string) {
    const url = getPortalUrl(token);
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  const portals = data?.data ?? [];

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 4px' }}>
            Client Portal
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', margin: 0 }}>
            Share a read-only portal link with your clients to show progress, tasks, and files.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            padding: '7px 14px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          + New Link
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
            placeholder="Link label (e.g. Acme Corp)"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            style={{
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          <input
            type="password"
            placeholder="Password (optional, min 6 chars)"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            style={{
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          {createMutation.isError && (
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: 0 }}>
              Failed to create portal link.
            </p>
          )}
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
              onClick={() => { setShowForm(false); setForm({ label: '', password: '' }); }}
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

      {!isLoading && portals.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14,
        }}>
          No portal links yet. Create one to share with your client.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {portals.map((portal: PortalLink) => (
          <div
            key={portal.id}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px',
              opacity: portal.is_active ? 1 : 0.55,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {portal.label}
                  </span>
                  {!portal.is_active && (
                    <span style={{
                      fontFamily: 'DM Sans', fontSize: 11, padding: '2px 7px',
                      borderRadius: 5, background: 'var(--surface2)', color: 'var(--text3)',
                    }}>
                      Revoked
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {getPortalUrl(portal.token)}
                </div>
                {portal.last_accessed && (
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                    Last accessed {new Date(portal.last_accessed).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {portal.is_active && (
                  <button
                    onClick={() => copyUrl(portal.token)}
                    style={{
                      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                      padding: '6px 10px', borderRadius: 6,
                      background: copied === portal.token ? 'var(--green-bg, #d8f3dc)' : 'var(--surface2)',
                      color: copied === portal.token ? 'var(--green)' : 'var(--text2)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                  >
                    {copied === portal.token ? 'Copied!' : 'Copy URL'}
                  </button>
                )}
                {portal.is_active && (
                  <button
                    onClick={() => { if (confirm('Revoke this portal link? The client will lose access.')) revokeMutation.mutate(portal.id); }}
                    style={{
                      fontFamily: 'DM Sans', fontSize: 12,
                      padding: '6px 10px', borderRadius: 6,
                      background: 'transparent', color: 'var(--red)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>

            {portal.is_active && (
              <ApprovalsPanel projectId={projectId} portalId={portal.id} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
