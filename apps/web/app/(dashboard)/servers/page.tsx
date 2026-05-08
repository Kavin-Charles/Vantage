'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge, statusColor } from '@/components/ui/Badge';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { listServers, createServer, deleteServer } from '@/lib/servers';
import type { Server } from '@vantage/types';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };

export default function ServersPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [modal, setModal] = useState<'create' | { token: string; name: string } | null>(null);
  const [form, setForm] = useState({ name: '', region: '', ip_address: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => listServers(await getToken()),
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async () => createServer(await getToken(), { name: form.name, region: form.region || undefined, ip_address: form.ip_address || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['servers'] });
      setModal({ token: res.data.agent_token, name: res.data.name });
      setForm({ name: '', region: '', ip_address: '' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteServer(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });

  const servers: Server[] = data?.data ?? [];

  return (
    <>
      <Topbar action={<Button variant="primary" onClick={() => setModal('create')}>+ Add Server</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{servers.length} servers</div>

        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Status</th>
                <th style={th}>CPU</th>
                <th style={th}>Mem</th>
                <th style={th}>Disk</th>
                <th style={th}>Region</th>
                <th style={th}>Last ping</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Loading…</td></tr>
              ) : servers.length === 0 ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No servers yet. Add one to start monitoring.</td></tr>
              ) : servers.map(s => (
                <tr key={s.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/servers/${s.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={td}><span style={{ fontWeight: 500 }}>{s.name}</span></td>
                  <td style={td}><Badge label={s.status} color={statusColor[s.status] ?? 'gray'} /></td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{s.cpu_pct !== null ? `${s.cpu_pct}%` : '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{s.mem_pct !== null ? `${s.mem_pct}%` : '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{s.disk_pct !== null ? `${s.disk_pct}%` : '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{s.region ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{timeAgo(s.last_ping_at)}</td>
                  <td style={{ ...td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <Button onClick={() => { if (confirm('Deregister this server?')) deleteMut.mutate(s.id); }}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'create' && (
        <Modal title="Add server" onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Server name *">
              <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="prod-web-01" />
            </FormField>
            <FormField label="Region">
              <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="us-east-1" />
            </FormField>
            <FormField label="IP address">
              <Input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} placeholder="10.0.0.1" />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create server'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {modal && typeof modal === 'object' && (
        <Modal title={`Agent token for ${modal.name}`} onClose={() => setModal(null)}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Copy this token now — it won't be shown again.
          </p>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', marginBottom: 16 }}>
            {modal.token}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Install the agent on your server:</p>
          <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, overflow: 'auto' }}>
{`npm install -g vantage-agent
VANTAGE_TOKEN=${modal.token} \\
VANTAGE_API_URL=${process.env['NEXT_PUBLIC_API_URL']} \\
vantage-agent`}
          </pre>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="primary" onClick={() => setModal(null)}>Done</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
