'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import Link from 'next/link';

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  member_count: number;
}

const PRESET_COLORS = ['#6b665c', '#2d6a4f', '#1e3a8a', '#92400e', '#991b1b', '#6d28d9'];

export default function GroupsPage() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { ask: askConfirm, el: confirmEl } = useConfirm();
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#6b665c');

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: async () =>
      apiFetch<{ data: Group[]; error: null }>('/api/groups', { token: await getToken() }),
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newName, description: newDesc || undefined, color: newColor }),
        token,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewColor('#6b665c');
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${id}`, { method: 'DELETE', token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const groups = data?.data ?? [];
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Groups</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Permission groups — members inherit group permissions.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}
        >
          + Create Group
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input style={inputStyle} placeholder="Group name *" value={newName} onChange={e => setNewName(e.target.value)} />
            <input style={inputStyle} placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Color:</span>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: newColor === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => createGroup.mutate()}
                disabled={!newName || createGroup.isPending}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>No groups yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: g.color }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
                  {g.description && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{g.description}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{g.member_count} member{Number(g.member_count) !== 1 ? 's' : ''}</span>
                <Link href={`/settings/groups/${g.id}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}>Edit</Link>
                <button
                  onClick={() => askConfirm({ title: 'Delete group', message: `Delete group "${g.name}"? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger', onConfirm: () => deleteGroup.mutate(g.id) })}
                  style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmEl}
    </div>
  );
}
