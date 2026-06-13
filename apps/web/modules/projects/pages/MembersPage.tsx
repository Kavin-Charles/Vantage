'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  name: string | null;
  email: string | null;
}

const ROLES = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'] as const;

function initials(name: string | null, email: string | null): string {
  if (name) return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  if (email) return email[0]!.toUpperCase();
  return '?';
}

export default function MembersPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { getToken } = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`, { token });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const token = await getToken();
      return apiFetch<{ data: ProjectMember }>(`/api/projects/${projectId}/members/${memberId}`, {
        token, method: 'PATCH',
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const token = await getToken();
      return apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/members/${memberId}`, {
        token, method: 'DELETE',
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });

  const members = data?.data ?? [];

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 20px' }}>
        Members
      </h2>

      {isLoading && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</p>
      )}

      {!isLoading && members.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14,
        }}>
          No members yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {members.map(m => (
          <div
            key={m.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: 'var(--text2)',
              flexShrink: 0,
            }}>
              {initials(m.name, m.email)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {m.name ?? 'Unknown'}
              </p>
              {m.email && (
                <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>
                  {m.email}
                </p>
              )}
            </div>

            <select
              value={m.role}
              onChange={e => updateMutation.mutate({ memberId: m.id, role: e.target.value })}
              style={{
                fontFamily: 'DM Sans', fontSize: 12,
                padding: '5px 8px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text2)', cursor: 'pointer', outline: 'none',
              }}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
              ))}
            </select>

            <button
              onClick={() => removeMutation.mutate(m.id)}
              disabled={removeMutation.isPending}
              style={{
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                padding: '5px 10px', borderRadius: 6,
                background: 'transparent', color: 'var(--red)',
                border: 'none', cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
