'use client';

import { useState } from 'react';
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

interface WorkspaceUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

const ROLES = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'] as const;

function initials(name: string | null, email: string | null): string {
  if (name) return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  if (email) return email[0]!.toUpperCase();
  return '?';
}

export default function MembersPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`, { token });
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token });
    },
    enabled: showInvite,
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: string }) => {
      const token = await getToken();
      return apiFetch<{ data: ProjectMember }>(`/api/projects/${projectId}/members/invite`, {
        token, method: 'POST', body: JSON.stringify({ user_id, role }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] });
      setShowInvite(false);
      setInviteUserId('');
      setSearch('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const token = await getToken();
      return apiFetch<{ data: ProjectMember }>(`/api/projects/${projectId}/members/${memberId}`, {
        token, method: 'PATCH', body: JSON.stringify({ role }),
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
  const memberUserIds = new Set(members.map(m => m.user_id));

  const availableUsers = (usersData?.data ?? []).filter(u =>
    !memberUserIds.has(u.id) && (
      !search ||
      (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    )
  );

  function closeInvite() {
    setShowInvite(false);
    setInviteUserId('');
    setSearch('');
  }

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>
          Members
        </h2>
        <button
          onClick={() => setShowInvite(v => !v)}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            padding: '7px 14px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          + Add Member
        </button>
      </div>

      {showInvite && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '0 0 10px' }}>
            Add from workspace
          </p>

          <input
            autoFocus
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 10px', borderRadius: 7, width: '100%', boxSizing: 'border-box',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none', marginBottom: 8,
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
            {availableUsers.length === 0 ? (
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: '6px 0' }}>
                {search ? 'No users match.' : 'All workspace members are already in this project.'}
              </p>
            ) : (
              availableUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => setInviteUserId(id => id === u.id ? '' : u.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                    background: inviteUserId === u.id ? 'var(--surface2)' : 'transparent',
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'var(--text2)',
                    flexShrink: 0,
                  }}>
                    {initials(u.name, u.email)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                      {u.name ?? u.email}
                    </p>
                    {u.name && (
                      <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', margin: 0 }}>
                        {u.email}
                      </p>
                    )}
                  </div>
                  {inviteUserId === u.id && (
                    <span style={{ fontSize: 14, color: 'var(--green)' }}>✓</span>
                  )}
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              style={{
                fontFamily: 'DM Sans', fontSize: 12, padding: '6px 8px',
                borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text2)', cursor: 'pointer', outline: 'none',
              }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </select>
            <button
              onClick={() => inviteUserId && inviteMutation.mutate({ user_id: inviteUserId, role: inviteRole })}
              disabled={!inviteUserId || inviteMutation.isPending}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                padding: '6px 14px', borderRadius: 7,
                background: 'var(--text)', color: '#fff', border: 'none',
                cursor: inviteUserId ? 'pointer' : 'not-allowed',
                opacity: inviteUserId ? 1 : 0.4,
              }}
            >
              {inviteMutation.isPending ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={closeInvite}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, padding: '6px 12px', borderRadius: 7,
                background: 'transparent', color: 'var(--text2)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {inviteMutation.isError && (
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)' }}>Failed to add member.</span>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</p>
      )}

      {!isLoading && members.length === 0 && !showInvite && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14 }}>
          No members yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {members.map(m => (
          <div
            key={m.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: '1px solid var(--border)',
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
                fontFamily: 'DM Sans', fontSize: 12, padding: '5px 8px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text2)', cursor: 'pointer', outline: 'none',
              }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
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
