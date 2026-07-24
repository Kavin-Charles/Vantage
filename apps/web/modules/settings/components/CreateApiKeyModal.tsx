'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createApiKey } from '@/modules/shared/lib/api-keys';
import { FluidModal, FluidInput, FluidButton, MSIcon } from '@/modules/shared/fluid/ui';

interface Props {
  onClose: () => void;
}

export function CreateApiKeyModal({ onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'read_write'>('read');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: async () => createApiKey(await getToken(), { name: name.trim(), scope }),
    onSuccess: (res) => {
      setCreatedKey(res.data.key);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setError('');
    createMut.mutate();
  }

  function copyKey() {
    if (!createdKey) return;
    void navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <FluidModal open onClose={onClose} title={createdKey ? 'API Key Created' : 'Create API Key'}>
      {createdKey ? (
        <>
          <div style={{
            background: 'var(--fl-success-container)', border: '1px solid var(--fl-on-success-container)',
            borderRadius: 'var(--fl-radius-card)', padding: '12px 14px', marginBottom: 20,
            fontSize: 13, color: 'var(--fl-on-success-container)', display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <MSIcon name="check_circle" size={18} />
            <span><strong>Save this key now.</strong> It will not be shown again.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <input
              readOnly
              value={createdKey}
              style={{
                flex: 1, fontFamily: 'monospace', fontSize: 13,
                background: 'var(--fl-surface-container-lowest)', border: '1px solid var(--fl-outline-variant)',
                borderRadius: 'var(--fl-radius-input)', padding: '10px 14px', color: 'var(--fl-on-surface)',
              }}
            />
            <FluidButton variant="ghost" onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</FluidButton>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <FluidButton onClick={onClose}>Done</FluidButton>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--fl-on-surface)' }}>Name</div>
            <FluidInput value={name} onChange={setName} placeholder="e.g. Zapier integration" />
          </div>

          <div style={{ margin: '20px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--fl-on-surface)' }}>Scope</div>
            {(['read', 'read_write'] as const).map(s => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} />
                <span style={{ fontWeight: 600, color: 'var(--fl-on-surface)' }}>
                  {s === 'read_write' ? 'Read + Write' : 'Read only'}
                </span>
                <span style={{ color: 'var(--fl-on-surface-variant)' }}>
                  {s === 'read' ? '— can only fetch data' : '— can create and update records'}
                </span>
              </label>
            ))}
          </div>

          {error && <div style={{ color: 'var(--fl-error)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <FluidButton type="button" variant="ghost" onClick={onClose}>Cancel</FluidButton>
            <FluidButton type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create key'}
            </FluidButton>
          </div>
        </form>
      )}
    </FluidModal>
  );
}
