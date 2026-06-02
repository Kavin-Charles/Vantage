'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { GroupPermissionsEditor } from '@/components/settings/GroupPermissionsEditor';
import type { User } from '@vantage/types';

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [addUserId, setAddUserId] = useState('');

  const { data: groupData, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () =>
      apiFetch<{
        data: {
          id: string; name: string; color: string; description: string | null;
          members: { id: string; name: string; email: string; role: string }[];
          permissions: { permission: string; granted: boolean }[];
        };
        error: null;
      }>(`/api/groups/${groupId}`, { token: await getToken() }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }), token });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      setAddUserId('');
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE', token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
  });

  const group = groupData?.data;
  const allUsers = usersData?.data ?? [];
  const memberIds = new Set(group?.members.map(m => m.id) ?? []);
  const nonMembers = allUsers.filter(u => !memberIds.has(u.id));

  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  if (!group) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Group not found.</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link href="/settings/groups" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>← Groups</Link>
        <span style={{ color: 'var(--text3)' }}>/</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: group.color }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{group.name}</span>
        </div>
      </div>

      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Members</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {group.members.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>No members yet.</div>
        ) : group.members.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{m.email}</span>
            </div>
            <button
              onClick={() => removeMember.mutate(m.id)}
              style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {nonMembers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <select
            value={addUserId}
            onChange={e => setAddUserId(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
          >
            <option value="">Add a member…</option>
            {nonMembers.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <button
            onClick={() => addUserId && addMember.mutate(addUserId)}
            disabled={!addUserId || addMember.isPending}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      )}

      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Permissions</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text2)' }}>
        Members of this group inherit these permissions on top of their role defaults.
      </p>
      <GroupPermissionsEditor groupId={groupId} />
    </div>
  );
}
