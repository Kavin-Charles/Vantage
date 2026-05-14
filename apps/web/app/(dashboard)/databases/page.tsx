'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge, statusColor } from '@/components/ui/Badge';
import { FormField, Input, Select } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { listInfraDatabases, createInfraDatabase, deleteInfraDatabase } from '@/lib/infra-databases';
import type { InfraDatabase } from '@vantage/types';

const ENGINES = ['postgres', 'mysql', 'redis', 'clickhouse', 'mongo', 'other'] as const;

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue',
  mysql: 'amber',
  redis: 'red',
  clickhouse: 'purple',
  mongo: 'green',
  other: 'gray',
};
const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };

export default function DatabasesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', engine: 'postgres', host: '', port: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['infra-databases'],
    queryFn: async () => listInfraDatabases(await getToken()),
  });

  const createMut = useMutation({
    mutationFn: async () => createInfraDatabase(await getToken(), {
      name: form.name,
      engine: form.engine,
      host: form.host || undefined,
      port: form.port ? parseInt(form.port) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['infra-databases'] }); setModal(false); setForm({ name: '', engine: 'postgres', host: '', port: '' }); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteInfraDatabase(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['infra-databases'] }),
  });

  const dbs: InfraDatabase[] = data?.data ?? [];

  return (
    <>
      <Topbar action={<Button variant="primary" onClick={() => setModal(true)}>+ Add Database</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{dbs.length} databases</div>
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Engine</th>
                <th style={th}>Host</th>
                <th style={th}>Port</th>
                <th style={th}>Status</th>
                <th style={th}>Last checked</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Loading…</td></tr>
              ) : dbs.length === 0 ? (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No databases configured.</td></tr>
              ) : dbs.map(db => (
                <tr key={db.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/databases/${db.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={td}><span style={{ fontWeight: 500 }}>{db.name}</span></td>
                  <td style={td}><Badge label={db.engine} color={ENGINE_COLOR[db.engine] ?? 'gray'} /></td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{db.host ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{db.port ?? '—'}</td>
                  <td style={td}><Badge label={db.status} color={statusColor[db.status] ?? 'gray'} /></td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{db.last_checked_at ? new Date(db.last_checked_at).toLocaleString() : 'never'}</td>
                  <td style={{ ...td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <Button onClick={() => { if (confirm('Remove this database?')) deleteMut.mutate(db.id); }}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title="Add database" onClose={() => setModal(false)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Name *">
              <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="prod-postgres" />
            </FormField>
            <FormField label="Engine">
              <Select value={form.engine} onChange={e => setForm(f => ({ ...f, engine: e.target.value }))}>
                {ENGINES.map(e => <option key={e} value={e}>{e}</option>)}
              </Select>
            </FormField>
            <FormField label="Host">
              <Input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="localhost" />
            </FormField>
            <FormField label="Port">
              <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="5432" />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>{createMut.isPending ? 'Saving…' : 'Add database'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
