'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Button } from '@/modules/shared/components/ui/Button';
import { updateServer } from '@/modules/servers/lib/servers';
import type { Server } from '@vencore/types';

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text3)' };
const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' };

export function EditServerModal({ server, onClose }: { server: Server; onClose: () => void }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: server.name,
    region: server.region ?? '',
    ip_address: server.ip_address ?? '',
    ssh_port: server.ssh_port ?? 22,
  });

  const editMut = useMutation({
    mutationFn: async () => updateServer(await getToken(), server.id, {
      name: form.name || undefined,
      region: form.region || undefined,
      ip_address: form.ip_address || undefined,
      ssh_port: form.ssh_port,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['server', server.id] });
      onClose();
    },
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, width: 440, maxWidth: '90vw', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Edit {server.name}</div>
        <form onSubmit={e => { e.preventDefault(); editMut.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Region</label>
            <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="us-east-1" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>IP address</label>
            <input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} placeholder="1.2.3.4" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>SSH port</label>
            <input type="number" min={1} max={65535} value={String(form.ssh_port)}
              onChange={e => setForm(f => ({ ...f, ssh_port: parseInt(e.target.value, 10) || 22 }))} style={inputStyle} />
          </div>
          {editMut.isError && (
            <div style={{ fontSize: 12, color: 'var(--red)' }}>Could not save. Check the IP/hostname is valid.</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={editMut.isPending}>
              {editMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
