'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { FluidModal, FluidInput, FluidSelect, FluidButton } from '@/modules/shared/fluid/ui';

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

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 8, fontFamily: 'var(--fl-font-body)',
    fontSize: 13, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
  };

  const canSubmit = Boolean(email) && (hasSMTP || (Boolean(name) && Boolean(password)));

  return (
    <FluidModal
      open
      onClose={onClose}
      title={hasSMTP ? 'Invite User' : 'Add User'}
      subtitle={hasSMTP ? 'Send an email invite to join this workspace.' : 'Create a new workspace member.'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!hasSMTP && (
          <div>
            <label style={labelStyle}>Name</label>
            <FluidInput value={name} onChange={setName} placeholder="Full name" />
          </div>
        )}

        <div>
          <label style={labelStyle}>Email</label>
          <FluidInput value={email} onChange={setEmail} type="email" placeholder="user@example.com" />
        </div>

        {!hasSMTP && (
          <div>
            <label style={labelStyle}>Password</label>
            <FluidInput value={password} onChange={setPassword} type="password" placeholder="Min 8 characters" />
          </div>
        )}

        <div>
          <label style={labelStyle}>Role</label>
          <FluidSelect
            value={role}
            onChange={v => setRole(v as 'admin' | 'member')}
            options={[
              { label: 'Member', value: 'member' },
              { label: 'Admin', value: 'admin' },
            ]}
          />
        </div>

        {error && (
          <div style={{
            fontSize: 13, color: 'var(--fl-on-error-container)', background: 'var(--fl-error-container)',
            padding: '10px 12px', borderRadius: 8,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'flex-end' }}>
          <FluidButton variant="ghost" onClick={onClose}>Cancel</FluidButton>
          <FluidButton onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? (hasSMTP ? 'Sending…' : 'Adding…') : (hasSMTP ? 'Send Invite' : 'Add User')}
          </FluidButton>
        </div>
      </div>
    </FluidModal>
  );
}
