'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/modules/shared/components/ui/Button';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getSshKeypair, regenerateSshKeypair, updateSshUser } from '@/modules/servers/lib/ssh';

export default function SshSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sshUser, setSshUser] = useState('');
  const [sshUserError, setSshUserError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['ssh-keypair'],
    queryFn: async () => getSshKeypair(await getToken()),
  });

  useEffect(() => {
    if (data?.data?.ssh_user) setSshUser(data.data.ssh_user);
  }, [data]);

  const regenMut = useMutation({
    mutationFn: async () => regenerateSshKeypair(await getToken()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssh-keypair'] });
      setConfirming(false);
    },
  });

  const sshUserMut = useMutation({
    mutationFn: async () => updateSshUser(await getToken(), sshUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssh-keypair'] });
      setSshUserError('');
    },
    onError: (err: Error) => {
      setSshUserError(err.message);
    },
  });

  function handleSshUserSave(e: React.FormEvent) {
    e.preventDefault();
    if (!sshUser.trim()) { setSshUserError('Username is required'); return; }
    if (!/^[\w.-]+$/.test(sshUser)) { setSshUserError('Only letters, digits, dots, hyphens and underscores allowed'); return; }
    setSshUserError('');
    sshUserMut.mutate();
  }

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
        Vencore uses a single workspace SSH keypair to connect to your servers. Add the public key to{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 12 }}>~/.ssh/authorized_keys</code> on each server you want to manage.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Public key */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Public Key</div>
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

          {/* SSH Username */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>SSH Username</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
              The user Vencore SSH-es in as. Common values:{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>root</code>,{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>ubuntu</code>,{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>ec2-user</code>.
            </p>
            <form onSubmit={handleSshUserSave} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <FormField label="">
                  <Input
                    value={sshUser}
                    onChange={e => setSshUser(e.target.value)}
                    placeholder="root"
                    style={{ fontFamily: 'monospace' }}
                  />
                </FormField>
                {sshUserError && (
                  <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{sshUserError}</div>
                )}
              </div>
              <Button type="submit" variant="primary" disabled={sshUserMut.isPending}>
                {sshUserMut.isPending ? 'Saving…' : 'Save'}
              </Button>
            </form>
          </div>

          {/* Regenerate */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Regenerate keypair</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
              This will invalidate the current keypair. You will need to update{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>authorized_keys</code> on every server before SSH access works again.
            </p>
            {!confirming ? (
              <Button onClick={() => setConfirming(true)}>Regenerate</Button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                  {regenMut.isPending ? 'Regenerating…' : 'Yes, regenerate'}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
