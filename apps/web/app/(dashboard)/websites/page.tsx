'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge, statusColor } from '@/components/ui/Badge';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { listWebsites, createWebsite, deleteWebsite } from '@/lib/websites';
import type { Website } from '@vantage/types';

function sslColor(dateStr: string | null): string {
  if (!dateStr) return 'var(--text3)';
  const days = (new Date(dateStr).getTime() - Date.now()) / 86400000;
  if (days < 7) return 'var(--red)';
  if (days < 30) return 'var(--amber)';
  return 'var(--green)';
}

const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };

export default function WebsitesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ url: '', label: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['websites'],
    queryFn: async () => listWebsites(await getToken()),
    refetchInterval: 60_000,
  });

  const createMut = useMutation({
    mutationFn: async () => createWebsite(await getToken(), { url: form.url, label: form.label || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['websites'] }); setModal(false); setForm({ url: '', label: '' }); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteWebsite(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['websites'] }),
  });

  const sites: Website[] = data?.data ?? [];

  return (
    <>
      <Topbar action={<Button variant="primary" onClick={() => setModal(true)}>+ Add Website</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{sites.length} websites monitored</div>
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Label / URL</th>
                <th style={th}>Status</th>
                <th style={th}>Response</th>
                <th style={th}>Uptime 30d</th>
                <th style={th}>SSL expiry</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Loading…</td></tr>
              ) : sites.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No websites monitored yet.</td></tr>
              ) : sites.map(site => (
                <tr key={site.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{site.label ?? site.url}</div>
                    {site.label && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{site.url}</div>}
                  </td>
                  <td style={td}><Badge label={site.status} color={statusColor[site.status] ?? 'gray'} /></td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{site.response_ms !== null ? `${site.response_ms}ms` : '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{site.uptime_pct_30d !== null ? `${(site.uptime_pct_30d as number).toFixed(2)}%` : '—'}</td>
                  <td style={{ ...td, color: sslColor(site.ssl_expiry_date) }}>
                    {site.ssl_expiry_date ? new Date(site.ssl_expiry_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Button onClick={() => { if (confirm('Stop monitoring this website?')) deleteMut.mutate(site.id); }}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title="Add website" onClose={() => setModal(false)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="URL *">
              <Input required type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com" />
            </FormField>
            <FormField label="Label">
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Production site" />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>{createMut.isPending ? 'Adding…' : 'Add website'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
