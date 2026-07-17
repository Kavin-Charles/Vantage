'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { Button } from '@/modules/shared/components/ui/Button';
import { Badge } from '@/modules/shared/components/ui/Badge';
import {
  listServerAlerts, resolveAlert, getServerThresholds, setServerThresholds, clearServerThresholds,
  type ThresholdValues,
} from '@/modules/infra/servers/lib/servers';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 12,
};
const sevColor = (s: string) => s === 'critical' ? 'red' : s === 'warning' ? 'amber' : 'blue';

function ThresholdField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" min={0} max={100} value={String(value)}
          onChange={e => onChange(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
          style={{ width: 64, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }} />
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>%</span>
      </div>
    </div>
  );
}

export function AlertsTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('servers:edit');

  const alertsQ = useQuery({
    queryKey: ['server-alerts', serverId],
    queryFn: async () => listServerAlerts(await getToken(), serverId),
    refetchInterval: 30_000,
  });

  const thresholdsQ = useQuery({
    queryKey: ['server-thresholds', serverId],
    queryFn: async () => getServerThresholds(await getToken(), serverId),
  });

  const [draft, setDraft] = useState<ThresholdValues | null>(null);
  useEffect(() => {
    if (thresholdsQ.data) setDraft(thresholdsQ.data.data.effective);
  }, [thresholdsQ.data]);

  const saveMut = useMutation({
    mutationFn: async (body: ThresholdValues) => setServerThresholds(await getToken(), serverId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['server-thresholds', serverId] }),
  });
  const clearMut = useMutation({
    mutationFn: async () => clearServerThresholds(await getToken(), serverId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['server-thresholds', serverId] }),
  });
  const resolveMut = useMutation({
    mutationFn: async (id: string) => resolveAlert(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['server-alerts', serverId] }),
  });

  const alerts = alertsQ.data?.data ?? [];
  const hasOverride = thresholdsQ.data?.data.override != null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
      {/* Alert history */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={eyebrow}>Alert history</div>
        </div>
        {alertsQ.isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No alerts for this server.</div>
        ) : alerts.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < alerts.length - 1 ? '1px solid var(--border)' : 'none', opacity: a.resolved ? 0.55 : 1 }}>
            <Badge label={a.severity} color={sevColor(a.severity)} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{a.message}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</span>
            {a.resolved
              ? <Badge label="resolved" color="gray" />
              : canEdit && <Button onClick={() => resolveMut.mutate(a.id)} disabled={resolveMut.isPending} style={{ padding: '3px 10px', fontSize: 12 }}>Resolve</Button>}
          </div>
        ))}
      </div>

      {/* Threshold override */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={eyebrow}>Alert thresholds</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 0, marginBottom: 16 }}>
          {hasOverride ? 'This server uses a custom override.' : 'Using the workspace default. Saving creates a per-server override.'}
        </p>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ThresholdField label="CPU" value={draft.cpu_pct} onChange={n => setDraft(d => d && { ...d, cpu_pct: n })} />
            <ThresholdField label="Memory" value={draft.mem_pct} onChange={n => setDraft(d => d && { ...d, mem_pct: n })} />
            <ThresholdField label="Disk" value={draft.disk_pct} onChange={n => setDraft(d => d && { ...d, disk_pct: n })} />
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button variant="primary" onClick={() => draft && saveMut.mutate(draft)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Saving…' : 'Save override'}
                </Button>
                {hasOverride && (
                  <Button onClick={() => clearMut.mutate()} disabled={clearMut.isPending}>Reset</Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
