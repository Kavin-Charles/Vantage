'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { FormField, Input, Select } from '@/modules/shared/components/ui/FormField';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listInfraDatabases, createInfraDatabase, deleteInfraDatabase } from '@/modules/databases/lib/infra-databases';
import type { InfraDatabase } from '@vencore/types';

const ENGINES = ['postgres', 'mysql', 'redis', 'clickhouse', 'mongo', 'other'] as const;
type Engine = typeof ENGINES[number];

interface EngineConfig {
  defaultPort: string;
  namePlaceholder: string;
  hostPlaceholder: string;
  hostLabel: string;
  dbNameLabel: string;
  dbNamePlaceholder: string;
  showDbName: boolean;
  showUser: boolean;
  userPlaceholder: string;
  showSsl: boolean;
  hint?: string;
}

const ENGINE_CONFIG: Record<Engine, EngineConfig> = {
  postgres:   { defaultPort: '5432',  namePlaceholder: 'prod-postgres',    hostLabel: 'Host',                    hostPlaceholder: 'db.example.com',               dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb',    showDbName: true,  showUser: true,  userPlaceholder: 'postgres',  showSsl: true },
  mysql:      { defaultPort: '3306',  namePlaceholder: 'prod-mysql',       hostLabel: 'Host',                    hostPlaceholder: 'db.example.com',               dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb',    showDbName: true,  showUser: true,  userPlaceholder: 'root',      showSsl: true },
  redis:      { defaultPort: '6379',  namePlaceholder: 'prod-redis',       hostLabel: 'Host',                    hostPlaceholder: 'redis.example.com',            dbNameLabel: 'DB index',      dbNamePlaceholder: '0',       showDbName: false, showUser: false, userPlaceholder: '',          showSsl: true,  hint: 'Password only — Redis does not use usernames.' },
  clickhouse: { defaultPort: '8123',  namePlaceholder: 'prod-clickhouse',  hostLabel: 'Host',                    hostPlaceholder: 'ch.example.com',               dbNameLabel: 'Database name', dbNamePlaceholder: 'default', showDbName: true,  showUser: true,  userPlaceholder: 'default',   showSsl: true },
  mongo:      { defaultPort: '27017', namePlaceholder: 'prod-mongo',       hostLabel: 'Host or connection URI',  hostPlaceholder: 'mongodb+srv://cluster.example.net or localhost', dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb', showDbName: true, showUser: true, userPlaceholder: 'mongouser', showSsl: false, hint: 'You can paste a full mongodb:// or mongodb+srv:// URI into the host field.' },
  other:      { defaultPort: '',      namePlaceholder: 'my-database',      hostLabel: 'Host',                    hostPlaceholder: 'db.example.com',               dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb',    showDbName: true,  showUser: true,  userPlaceholder: 'dbuser',    showSsl: true },
};

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue', mysql: 'amber', redis: 'red', clickhouse: 'purple', mongo: 'green', other: 'gray',
};

const COLS = 'minmax(160px,1.4fr) .8fr 1.6fr .6fr .8fr 1.2fr auto';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

const BLANK_FORM = { name: '', engine: 'postgres', host: '', port: '5432', database_name: '', db_user: '', db_password: '', use_ssl: false };

export default function DatabasesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

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
      database_name: form.database_name || undefined,
      db_user: form.db_user || undefined,
      db_password: form.db_password || undefined,
      use_ssl: form.use_ssl,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['infra-databases'] });
      setModal(false);
      setForm(BLANK_FORM);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteInfraDatabase(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['infra-databases'] }),
  });

  const dbs: InfraDatabase[] = data?.data ?? [];
  const cfg = ENGINE_CONFIG[form.engine as Engine] ?? ENGINE_CONFIG.other;

  return (
    <>
      <Topbar action={<Button variant="primary" onClick={() => setModal(true)}>+ Add Database</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{dbs.length} databases</div>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
            {['Name', 'Engine', 'Host', 'Port', 'Status', 'Last checked'].map(h => (
              <span key={h} style={eyebrow}>{h}</span>
            ))}
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : dbs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No databases configured.</div>
          ) : dbs.map((db, i) => (
            <DatabaseRow
              key={db.id}
              db={db}
              last={i === dbs.length - 1}
              onClick={() => router.push(`/databases/${db.id}`)}
              onDelete={() => { if (confirm('Remove this database?')) deleteMut.mutate(db.id); }}
              onContextMenu={(e) => {
                const items: ContextMenuItem[] = [
                  { icon: 'open',     label: 'Open database',   onClick: () => router.push(`/databases/${db.id}`) },
                  { type: 'separator' },
                  ...(db.host ? [{ icon: 'copy', label: 'Copy host', onClick: () => navigator.clipboard.writeText(db.host!) } as ContextMenuItem] : []),
                  { icon: 'copy',     label: 'Copy name',       onClick: () => navigator.clipboard.writeText(db.name) },
                  { type: 'separator' },
                  { icon: 'trash',    label: 'Remove database', danger: true, onClick: () => { if (confirm('Remove this database?')) deleteMut.mutate(db.id); } },
                ];
                openMenu(e, items);
              }}
            />
          ))}
        </div>
      </div>

      {modal && (
        <Modal title="Add database" onClose={() => setModal(false)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Name *">
              <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={cfg.namePlaceholder} />
            </FormField>
            <FormField label="Engine">
              <Select value={form.engine} onChange={e => {
                const eng = e.target.value as Engine;
                setForm(f => ({ ...f, engine: eng, port: ENGINE_CONFIG[eng]?.defaultPort ?? '' }));
              }}>
                {ENGINES.map(e => <option key={e} value={e}>{e}</option>)}
              </Select>
            </FormField>
            {cfg.hint && (
              <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
                {cfg.hint}
              </div>
            )}
            <FormField label={cfg.hostLabel}>
              <Input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder={cfg.hostPlaceholder} />
            </FormField>
            <FormField label="Port">
              <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder={cfg.defaultPort || 'Port'} />
            </FormField>
            {cfg.showDbName && (
              <FormField label={cfg.dbNameLabel}>
                <Input value={form.database_name} onChange={e => setForm(f => ({ ...f, database_name: e.target.value }))} placeholder={cfg.dbNamePlaceholder} />
              </FormField>
            )}
            {cfg.showUser && (
              <FormField label="User">
                <Input value={form.db_user} onChange={e => setForm(f => ({ ...f, db_user: e.target.value }))} placeholder={cfg.userPlaceholder} />
              </FormField>
            )}
            <FormField label="Password">
              <Input type="password" value={form.db_password} onChange={e => setForm(f => ({ ...f, db_password: e.target.value }))} placeholder="Database password" />
            </FormField>
            {cfg.showSsl && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                <input type="checkbox" checked={form.use_ssl} onChange={e => setForm(f => ({ ...f, use_ssl: e.target.checked }))} />
                Use SSL
              </label>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>{createMut.isPending ? 'Saving…' : 'Add database'}</Button>
            </div>
          </form>
        </Modal>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}

function DatabaseRow({ db, last, onClick, onDelete, onContextMenu }: {
  db: InfraDatabase; last: boolean;
  onClick: () => void; onDelete: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
        cursor: 'pointer', fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{db.name}</span>
      <span><Badge label={db.engine} color={ENGINE_COLOR[db.engine] ?? 'gray'} /></span>
      <span style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{db.host ?? '—'}</span>
      <span style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{db.port ?? '—'}</span>
      <span><Badge label={db.status} color={statusColor[db.status] ?? 'gray'} /></span>
      <span style={{ color: 'var(--text2)' }}>{db.last_checked_at ? new Date(db.last_checked_at).toLocaleString() : 'never'}</span>
      <span onClick={e => e.stopPropagation()}>
        <Button onClick={onDelete} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Remove</Button>
      </span>
    </div>
  );
}
