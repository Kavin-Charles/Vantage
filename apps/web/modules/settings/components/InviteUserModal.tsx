'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useApiToken } from '@/lib/useApiToken';

interface Props {
  hasSMTP: boolean;
  onClose: () => void;
}

export function InviteUserModal({ hasSMTP, onClose }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body = hasSMTP
        ? { email, role }
        : { name, email, password, role };
      return apiFetch('/api/invites', { method: 'POST', body: JSON.stringify(body), token });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message ?? 'Failed to invite user');
    },
  });

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, width: 400,
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>
          {hasSMTP ? 'Invite User' : 'Add User'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!hasSMTP && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Name</label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Email</label>
            <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>

          {!hasSMTP && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Password</label>
              <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Role</label>
            <select style={inputStyle} value={role} onChange={e => setRole(e.target.value as 'admin' | 'member')}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 7 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !email || (!hasSMTP && (!name || !password))}
            style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer', opacity: mutation.isPending ? 0.6 : 1 }}
          >
            {mutation.isPending ? (hasSMTP ? 'Sending…' : 'Adding…') : (hasSMTP ? 'Send Invite' : 'Add User')}
          </button>
        </div>
      </div>
    </div>
  );
}
