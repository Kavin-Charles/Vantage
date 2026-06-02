'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listWebsites, createWebsite, deleteWebsite } from '@/modules/shared/lib/websites';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import type { Website } from '@vantage/types';

function sslColor(dateStr: string | null): string {
  if (!dateStr) return 'var(--text3)';
  const days = (new Date(dateStr).getTime() - Date.now()) / 86400000;
  if (days < 7) return 'var(--red)';
  if (days < 30) return 'var(--amber)';
  return 'var(--green)';
}

const COLS = '2fr 1fr 1fr 1fr 1.2fr auto';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

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
    <ModuleGuard moduleId="websites">
      <Topbar action={<Button variant="primary" onClick={() => setModal(true)}>+ Add Website</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{sites.length} websites monitored</div>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
            {['Label / URL', 'Status', 'Response', 'Uptime 30d', 'SSL expiry'].map(h => (
              <span key={h} style={eyebrow}>{h}</span>
            ))}
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : sites.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No websites monitored yet.</div>
          ) : sites.map((site, i) => (
            <WebsiteRow
              key={site.id}
              site={site}
              last={i === sites.length - 1}
              onDelete={() => { if (confirm('Stop monitoring this website?')) deleteMut.mutate(site.id); }}
            />
          ))}
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
    </ModuleGuard>
  );
}

function WebsiteRow({ site, last, onDelete }: {
  site: Website; last: boolean; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s', fontSize: 13,
      }}
    >
      <span>
        <div style={{ fontWeight: 500, color: 'var(--text)' }}>{site.label ?? site.url}</div>
        {site.label && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{site.url}</div>}
      </span>
      <span><Badge label={site.status} color={statusColor[site.status] ?? 'gray'} /></span>
      <span style={{ color: site.response_ms !== null && site.response_ms > 500 ? 'var(--amber)' : 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
        {site.response_ms !== null ? `${site.response_ms}ms` : '—'}
      </span>
      <span style={{ color: site.uptime_pct_30d !== null && site.uptime_pct_30d < 99 ? 'var(--amber)' : 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
        {site.uptime_pct_30d !== null ? `${(site.uptime_pct_30d as number).toFixed(2)}%` : '—'}
      </span>
      <span style={{ color: sslColor(site.ssl_expiry_date) }}>
        {site.ssl_expiry_date ? new Date(site.ssl_expiry_date).toLocaleDateString() : '—'}
      </span>
      <span>
        <Button onClick={onDelete} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Remove</Button>
      </span>
    </div>
  );
}
