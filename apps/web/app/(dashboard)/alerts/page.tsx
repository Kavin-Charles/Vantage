'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import type { Alert } from '@vantage/types';

type FilterTab = 'all' | 'unresolved' | 'critical' | 'warning' | 'info';

const SEV_COLOR: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = {
  critical: 'red',
  warning: 'amber',
  info: 'blue',
};

function timeAgo(dateStr: string | Date): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [tab, setTab] = useState<FilterTab>('unresolved');

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', tab],
    queryFn: async () => {
      const token = await getToken();
      const params = new URLSearchParams();
      if (tab === 'unresolved') params.set('resolved', 'false');
      if (tab === 'critical') { params.set('resolved', 'false'); params.set('severity', 'critical'); }
      if (tab === 'warning') { params.set('resolved', 'false'); params.set('severity', 'warning'); }
      if (tab === 'info') { params.set('resolved', 'false'); params.set('severity', 'info'); }
      // 'all' tab: no resolved filter (backend defaults to resolved=false)
      return apiFetch<{ data: Alert[]; total: number; error: null }>(`/api/alerts?${params}`, { token });
    },
    refetchInterval: 30_000,
  });

  const ackMut = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/alerts/${id}/acknowledge`, { method: 'PATCH', token: await getToken() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const resolveMut = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/alerts/${id}/resolve`, { method: 'PATCH', token: await getToken() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const alerts: Alert[] = data?.data ?? [];
  const TABS: FilterTab[] = ['all', 'unresolved', 'critical', 'warning', 'info'];

  return (
    <>
      <Topbar />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
          {TABS.map(f => (
            <button key={f} onClick={() => setTab(f)}
              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', background: tab === f ? 'var(--text)' : 'transparent', color: tab === f ? '#fff' : 'var(--text2)', transition: 'all .15s' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No alerts.</div>
          ) : alerts.map((alert, i) => (
            <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < alerts.length - 1 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <Badge label={alert.severity} color={SEV_COLOR[alert.severity] ?? 'gray'} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{alert.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {alert.resource_type} · {timeAgo(alert.created_at)}
                  {alert.acknowledged && ' · acknowledged'}
                  {alert.resolved && ' · resolved'}
                </div>
              </div>
              {!alert.acknowledged && !alert.resolved && (
                <Button onClick={() => ackMut.mutate(alert.id)}>Acknowledge</Button>
              )}
              {!alert.resolved && (
                <Button variant="danger" onClick={() => resolveMut.mutate(alert.id)}>Resolve</Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
