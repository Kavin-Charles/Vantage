'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listWorkspaceMembers, openDM } from '../lib/messaging';

interface Props {
  onClose: () => void;
}

export function NewDMModal({ onClose }: Props) {
  const getToken = useApiToken();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members'],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return [];
      const res = await listWorkspaceMembers(token);
      return res.data ?? [];
    },
    staleTime: 120_000,
  });

  const filtered = search.trim()
    ? members.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase()),
      )
    : members;

  const start = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      if (!token) return null;
      const res = await openDM(token, userId);
      return res.data;
    },
    onSuccess: (ch) => {
      if (ch) {
        onClose();
        router.push(`/messaging/${ch.id}`);
      }
    },
  });

  return (
    <Modal title="New Direct Message" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 320 }}>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search team members…"
          style={{
            width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, outline: 'none',
            background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
          }}
        />

        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
              No members found
            </div>
          )}
          {filtered.map(m => (
            <button
              key={m.id}
              onClick={() => start.mutate(m.id)}
              disabled={start.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, color: 'var(--text2)',
              }}>
                {m.name[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{m.email}</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>Message →</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
