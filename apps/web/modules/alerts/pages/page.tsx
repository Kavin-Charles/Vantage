'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Badge } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import type { Alert } from '@vencore/types';

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
    queryKey: ['alerts-all'],
    queryFn: async () =>
      apiFetch<{ data: Alert[]; total: number; error: null }>('/api/alerts?limit=200', { token: await getToken() }),
    refetchInterval: 30_000,
  });

  const ackMut = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/alerts/${id}/acknowledge`, { method: 'PATCH', token: await getToken() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts-all'] }),
  });

  const resolveMut = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/alerts/${id}/resolve`, { method: 'PATCH', token: await getToken() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts-all'] }),
  });

  const allAlerts: Alert[] = data?.data ?? [];
  const unresolved = allAlerts.filter(a => !a.resolved);

  const tabCounts: Record<FilterTab, number> = {
    all: allAlerts.length,
    unresolved: unresolved.length,
    critical: unresolved.filter(a => a.severity === 'critical').length,
    warning: unresolved.filter(a => a.severity === 'warning').length,
    info: unresolved.filter(a => a.severity === 'info').length,
  };

  const filtered = tab === 'all' ? allAlerts
    : tab === 'unresolved' ? unresolved
    : unresolved.filter(a => a.severity === tab);

  const TABS: FilterTab[] = ['all', 'unresolved', 'critical', 'warning', 'info'];

  return (
    <>
      <Topbar />
      <div style={{ padding: 24 }}>
        <div style={{
          display: 'inline-flex', gap: 0,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 3, marginBottom: 16,
        }}>
          {TABS.map(f => {
            const on = tab === f;
            return (
              <button key={f} onClick={() => setTab(f)}
                style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: on ? 'var(--text)' : 'transparent',
                  color: on ? '#fff' : 'var(--text2)',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all .15s',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span style={{ fontSize: 11, opacity: on ? 0.7 : 0.6, fontWeight: 600 }}>
                  {tabCounts[f]}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No alerts.</div>
          ) : filtered.map((alert, i) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              last={i === filtered.length - 1}
              onAck={() => ackMut.mutate(alert.id)}
              onResolve={() => resolveMut.mutate(alert.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function AlertRow({ alert, last, onAck, onResolve }: {
  alert: Alert; last: boolean; onAck: () => void; onResolve: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
      }}
    >
      <Badge label={alert.severity} color={SEV_COLOR[alert.severity] ?? 'gray'} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{alert.message}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {alert.resource_type} · {timeAgo(alert.created_at)}
          {alert.acknowledged && !alert.resolved && (
            <span style={{ color: 'var(--text2)', fontWeight: 500 }}> · acknowledged</span>
          )}
          {alert.resolved && (
            <span style={{ color: 'var(--green)', fontWeight: 600 }}> · resolved</span>
          )}
        </div>
      </div>
      {!alert.acknowledged && !alert.resolved && (
        <Button onClick={onAck} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Acknowledge</Button>
      )}
      {!alert.resolved && (
        <Button variant="danger" onClick={onResolve} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Resolve</Button>
      )}
    </div>
  );
}
