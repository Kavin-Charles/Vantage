'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Badge } from '@/modules/shared/components/ui/Badge';
import { listDeployments } from '@/modules/shared/lib/deployments';
import type { DeploymentStatus } from '@vencore/types';

const STATUS_COLOR: Record<DeploymentStatus, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
  success: 'green',
  running: 'blue',
  pending: 'amber',
  failed: 'red',
  cancelled: 'gray',
};

export function DeploymentsTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['server-deployments', serverId],
    queryFn: async () => listDeployments(await getToken(), { server_id: serverId, limit: 50 }),
    refetchInterval: 30_000,
  });

  const deployments = data?.data ?? [];

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>;
  if (deployments.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No deployments reported. The agent reports deployments via <code>POST /agent/deployment</code>.
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Status', 'Name', 'Environment', 'Commit', 'Branch', 'Author', 'When'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deployments.map((d, i) => (
            <tr key={d.id} style={{ borderBottom: i < deployments.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <td style={{ padding: '10px 16px' }}><Badge label={d.status} color={STATUS_COLOR[d.status] ?? 'gray'} /></td>
              <td style={{ padding: '10px 16px', color: 'var(--text)' }}>{d.name ?? '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>{d.environment ?? '—'}</td>
              <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }} title={d.git_message ?? ''}>
                {d.git_commit ? d.git_commit.slice(0, 7) : '—'}
              </td>
              <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>{d.git_branch ?? d.git_tag ?? '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>{d.git_author ?? '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{new Date(d.started_at ?? d.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
