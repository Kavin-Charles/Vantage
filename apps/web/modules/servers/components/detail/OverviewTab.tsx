'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Button } from '@/modules/shared/components/ui/Button';
import { regenToken } from '@/modules/servers/lib/servers';
import { MetricsPanel } from './MetricsPanel';
import type { Server } from '@vencore/types';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 12,
};

function fmtUptime(secs: number | null): string {
  if (secs == null) return '—';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function OverviewTab({ server }: { server: Server }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [regenConfirming, setRegenConfirming] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const regenMut = useMutation({
    mutationFn: async () => regenToken(await getToken(), server.id),
    onSuccess: (res) => {
      setNewToken(res.data.agent_token);
      setRegenConfirming(false);
      void qc.invalidateQueries({ queryKey: ['server', server.id] });
    },
  });

  const pingAgeMs = server.last_ping_at ? Date.now() - new Date(server.last_ping_at).getTime() : null;
  const agentHealth = pingAgeMs == null ? 'Never connected'
    : pingAgeMs < 90_000 ? 'Healthy'
    : pingAgeMs < 300_000 ? `Lagging (${Math.round(pingAgeMs / 1000)}s)`
    : `Stale (${Math.round(pingAgeMs / 60_000)}m)`;

  const details: [string, string][] = [
    ['Agent', `${agentHealth}${server.agent_version ? ` · v${server.agent_version}` : ''}`],
    ['Uptime', fmtUptime(server.uptime_seconds)],
    ['IP address', server.ip_address ?? '—'],
    ['SSH port', String(server.ssh_port ?? 22)],
    ['Region', server.region ?? '—'],
    ['Hostname', server.hostname ?? '—'],
    ['OS', server.os ?? '—'],
    ['Architecture', server.arch ?? '—'],
    ['Kernel', server.kernel ?? '—'],
    ['Agent version', server.agent_version ?? '—'],
    ['Last ping', server.last_ping_at ? new Date(server.last_ping_at).toLocaleString() : 'never'],
  ];

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <MetricsPanel serverId={server.id} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
          <div style={eyebrow}>Details</div>
          {details.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
          <div style={eyebrow}>Agent token</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 0, marginBottom: 12 }}>
            Rotating the token invalidates the current one. Update the agent on the server afterward.
          </p>
          {!regenConfirming ? (
            <Button onClick={() => setRegenConfirming(true)}>Regenerate token</Button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Invalidate the current token?</span>
              <Button onClick={() => setRegenConfirming(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                {regenMut.isPending ? 'Regenerating…' : 'Regenerate'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {newToken && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setNewToken(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, width: 520, maxWidth: '90vw', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>New agent token</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>Copy this token now — it won&apos;t be shown again.</p>
            <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', wordBreak: 'break-all', userSelect: 'all' }}>
              {newToken}
            </div>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, background: '#1a1814', color: '#f0ede6', borderRadius: 6, padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {`VENCORE_TOKEN=${newToken} vencore-agent`}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={() => setNewToken(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
