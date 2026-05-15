'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { listApiKeys, deleteApiKey } from '@/lib/api-keys';
import { Button } from '@/components/ui/Button';
import type { ApiKey } from '@vantage/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Props {
  onCreateClick: () => void;
}

export function ApiKeyTable({ onCreateClick }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => listApiKeys(await getToken()),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => deleteApiKey(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const keys: ApiKey[] = data?.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>API Keys</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Use API keys to access Vantage from external tools and scripts.
          </p>
        </div>
        <Button variant="primary" onClick={onCreateClick}>Create API Key</Button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : keys.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
          No API keys yet. Create one to get started.
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                {['Name', 'Prefix', 'Scope', 'Last used', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{k.name}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>{k.prefix}…</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 600,
                      background: k.scope === 'read_write' ? 'var(--amber-bg)' : 'var(--blue-bg)',
                      color: k.scope === 'read_write' ? 'var(--amber)' : 'var(--blue)',
                    }}>
                      {k.scope === 'read_write' ? 'read+write' : 'read'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>
                    {k.last_used_at ? formatDate(k.last_used_at) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>{formatDate(k.created_at)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <Button
                      onClick={() => revokeMut.mutate(k.id)}
                      disabled={revokeMut.isPending}
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
