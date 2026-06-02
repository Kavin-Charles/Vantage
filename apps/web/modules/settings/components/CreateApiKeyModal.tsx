'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { createApiKey } from '@/lib/api-keys';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/FormField';

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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: 28,
        width: 480, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>
          {createdKey ? 'API Key Created' : 'Create API Key'}
        </h3>

        {createdKey ? (
          <>
            <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--green)' }}>
              <strong>Save this key now.</strong> It will not be shown again.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input
                readOnly
                value={createdKey}
                style={{
                  flex: 1, fontFamily: 'monospace', fontSize: 12,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '8px 10px', color: 'var(--text)',
                }}
              />
              <Button onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <FormField label="Name">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Zapier integration"
                autoFocus
              />
            </FormField>

            <div style={{ margin: '16px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text)' }}>Scope</div>
              {(['read', 'read_write'] as const).map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="scope"
                    value={s}
                    checked={scope === s}
                    onChange={() => setScope(s)}
                  />
                  <span style={{ fontWeight: 500 }}>{s === 'read_write' ? 'Read + Write' : 'Read only'}</span>
                  <span style={{ color: 'var(--text2)' }}>
                    {s === 'read' ? '— can only fetch data' : '— can create and update records'}
                  </span>
                </label>
              ))}
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button type="button" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create key'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
