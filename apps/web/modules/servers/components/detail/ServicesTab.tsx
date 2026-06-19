'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { openSshStream } from '@/modules/servers/lib/ssh';

export function ServicesTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionOutput, setActionOutput] = useState<{ name: string; lines: string[]; exitCode: number | null } | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const fetchStreamRef = useRef<AbortController | null>(null);
  const actionStreamRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      fetchStreamRef.current?.abort();
      actionStreamRef.current?.abort();
    };
  }, []);

  function fetchServices() {
    fetchStreamRef.current?.abort();
    setLoading(true);
    setLines([]);
    getToken().then(token => {
      fetchStreamRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/services`,
        {},
        token,
        (event) => {
          if (event.type === 'stdout') setLines(prev => [...prev, event.line]);
          if (event.type === 'exit' || event.type === 'error') setLoading(false);
        },
      );
    });
  }

  function doAction(serviceName: string, action: 'start' | 'stop' | 'restart' | 'status') {
    actionStreamRef.current?.abort();
    setActioning(serviceName);
    setActionOutput({ name: serviceName, lines: [], exitCode: null });
    getToken().then(token => {
      actionStreamRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/service/${encodeURIComponent(serviceName)}`,
        { action },
        token,
        (event) => {
          if (event.type === 'stdout' || event.type === 'stderr') {
            setActionOutput(prev => prev ? { ...prev, lines: [...prev.lines, event.line] } : null);
          }
          if (event.type === 'exit') {
            setActionOutput(prev => prev ? { ...prev, exitCode: event.code } : null);
            setActioning(null);
            fetchServices();
          }
          if (event.type === 'error') {
            setActionOutput(prev => prev ? { ...prev, lines: [...prev.lines, event.message], exitCode: 1 } : null);
            setActioning(null);
          }
        },
      );
    });
  }

  const services = lines.map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      name: parts[0] ?? '',
      load: parts[1] ?? '',
      active: parts[2] ?? '',
      sub: parts[3] ?? '',
      description: parts.slice(4).join(' '),
    };
  }).filter(s => s.name.endsWith('.service'));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button onClick={fetchServices} disabled={loading}>{loading ? 'Loading…' : 'Refresh services'}</Button>
      </div>

      {actionOutput && (
        <pre style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 12, fontSize: 12, fontFamily: 'monospace', marginBottom: 16, maxHeight: 150, overflow: 'auto' }}>
          {actionOutput.lines.join('\n')}
          {actionOutput.exitCode !== null && `\n[exit ${actionOutput.exitCode}]`}
        </pre>
      )}

      {services.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Service', 'Active', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((svc, i) => (
                <tr key={svc.name} style={{ borderBottom: i < services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>{svc.name}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ color: svc.active === 'active' ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{svc.active}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{svc.sub}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['start', 'stop', 'restart', 'status'] as const).map(a => (
                        <button key={a} disabled={actioning === svc.name}
                          onClick={() => doAction(svc.name, a)}
                          style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)' }}>
                          {a}
                        </button>
                      ))}
                    </div>
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
