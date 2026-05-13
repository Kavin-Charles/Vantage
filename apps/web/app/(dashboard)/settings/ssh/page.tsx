'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useApiToken } from '@/lib/useApiToken';
import { getSshKeypair, regenerateSshKeypair } from '@/lib/ssh';

export default function SshSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ssh-keypair'],
    queryFn: async () => getSshKeypair(await getToken()),
  });

  const regenMut = useMutation({
    mutationFn: async () => regenerateSshKeypair(await getToken()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssh-keypair'] });
      setConfirming(false);
    },
  });

  const publicKey = data?.data?.public_key ?? '';

  function copyKey() {
    void navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>SSH Keys</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Vantage uses a single workspace SSH keypair to connect to your servers. Add the public key to{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 12 }}>~/.ssh/authorized_keys</code> on each server you want to manage.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Public Key</span>
            <Button onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</Button>
          </div>
          <pre style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, fontSize: 11, fontFamily: 'monospace', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200 }}>
            {publicKey}
          </pre>
          <p style={{ margin: '16px 0 8px', fontSize: 12, color: 'var(--text3)' }}>
            Add this key to <code style={{ fontFamily: 'monospace' }}>~/.ssh/authorized_keys</code> on your server:
          </p>
          <pre style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'monospace' }}>
            {'echo "<PUBLIC_KEY>" >> ~/.ssh/authorized_keys'}
          </pre>
        </div>
      )}

      <div style={{ marginTop: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Regenerate keypair</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
          This will invalidate the current keypair. You will need to update{' '}
          <code style={{ fontFamily: 'monospace', fontSize: 12 }}>authorized_keys</code> on every server before SSH access works again.
        </p>
        {!confirming ? (
          <Button variant="danger" onClick={() => setConfirming(true)}>Regenerate keypair</Button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--red)' }}>This cannot be undone. Continue?</span>
            <Button variant="danger" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
              {regenMut.isPending ? 'Regenerating…' : 'Yes, regenerate'}
            </Button>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}
