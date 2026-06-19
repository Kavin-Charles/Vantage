'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { FormField, Input, Select } from '@/modules/shared/components/ui/FormField';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  listInfraDatabases, createInfraDatabase, deleteInfraDatabase,
  testInfraDatabaseConnection, getInfraDatabaseConnectionString,
} from '@/modules/databases/lib/infra-databases';
import { DatabaseRow, DB_TABLE_COLS } from '@/modules/databases/components/DatabaseRow';
import { DatabaseCard } from '@/modules/databases/components/DatabaseCard';
import { SkeletonRow } from '@/modules/databases/components/SkeletonRow';
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
  postgres:   { defaultPort: '5432',  namePlaceholder: 'prod-postgres',   hostLabel: 'Host',                   hostPlaceholder: 'db.example.com',                                dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb',    showDbName: true,  showUser: true,  userPlaceholder: 'postgres',  showSsl: true },
  mysql:      { defaultPort: '3306',  namePlaceholder: 'prod-mysql',      hostLabel: 'Host',                   hostPlaceholder: 'db.example.com',                                dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb',    showDbName: true,  showUser: true,  userPlaceholder: 'root',      showSsl: true },
  redis:      { defaultPort: '6379',  namePlaceholder: 'prod-redis',      hostLabel: 'Host',                   hostPlaceholder: 'redis.example.com',                             dbNameLabel: 'DB index',      dbNamePlaceholder: '0',       showDbName: false, showUser: false, userPlaceholder: '',          showSsl: true,  hint: 'Password only — Redis does not use usernames.' },
  clickhouse: { defaultPort: '8123',  namePlaceholder: 'prod-clickhouse', hostLabel: 'Host',                   hostPlaceholder: 'ch.example.com',                                dbNameLabel: 'Database name', dbNamePlaceholder: 'default', showDbName: true,  showUser: true,  userPlaceholder: 'default',   showSsl: true },
  mongo:      { defaultPort: '27017', namePlaceholder: 'prod-mongo',      hostLabel: 'Host or connection URI', hostPlaceholder: 'mongodb+srv://cluster.example.net or localhost', dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb',    showDbName: true,  showUser: true,  userPlaceholder: 'mongouser', showSsl: false, hint: 'You can paste a full mongodb:// or mongodb+srv:// URI into the host field.' },
  other:      { defaultPort: '',      namePlaceholder: 'my-database',     hostLabel: 'Host',                   hostPlaceholder: 'db.example.com',                                dbNameLabel: 'Database name', dbNamePlaceholder: 'mydb',    showDbName: true,  showUser: true,  userPlaceholder: 'dbuser',    showSsl: true },
};

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

const BLANK_FORM = { name: '', engine: 'postgres', host: '', port: '5432', database_name: '', db_user: '', db_password: '', use_ssl: false };
const ALL_STATUSES = ['healthy', 'degraded', 'offline'] as const;

function useViewMode(): ['table' | 'card', (m: 'table' | 'card') => void] {
  const [mode, setMode] = useState<'table' | 'card'>(() => {
    if (typeof window === 'undefined') return 'table';
    return (localStorage.getItem('databases-view-mode') as 'table' | 'card') ?? 'table';
  });
  function set(m: 'table' | 'card') {
    setMode(m);
    localStorage.setItem('databases-view-mode', m);
  }
  return [mode, set];
}

export default function DatabasesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; message: string } | null>(null);
  const [testPending, setTestPending] = useState(false);
  const [viewMode, setViewMode] = useViewMode();
  const [search, setSearch] = useState('');
  const [engineFilter, setEngineFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const { ask: askConfirm, el: confirmEl } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['infra-databases'],
    queryFn: async () => listInfraDatabases(await getToken()),
  });

  const createMut = useMutation({
    mutationFn: async () => createInfraDatabase(await getToken(), {
      name: form.name, engine: form.engine,
      host: form.host || undefined, port: form.port ? parseInt(form.port) : undefined,
      database_name: form.database_name || undefined, db_user: form.db_user || undefined,
      db_password: form.db_password || undefined, use_ssl: form.use_ssl,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['infra-databases'] });
      setModal(false); setForm(BLANK_FORM); setTestResult(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteInfraDatabase(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['infra-databases'] }),
  });

  async function handleTestConnection() {
    setTestPending(true); setTestResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/databases/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name || 'test', engine: form.engine,
          host: form.host || undefined, port: form.port ? parseInt(form.port) : undefined,
          db_user: form.db_user || undefined, db_password: form.db_password || undefined,
          database_name: form.database_name || undefined, use_ssl: form.use_ssl,
        }),
      });
      const json = await res.json() as { data: { ok: boolean; latency_ms: number; message: string }; error: unknown };
      if (json.data) setTestResult(json.data);
    } catch {
      setTestResult({ ok: false, latency_ms: 0, message: 'Network error' });
    } finally {
      setTestPending(false);
    }
  }

  const allDbs: InfraDatabase[] = data?.data ?? [];

  const filtered = useMemo(() => {
    return allDbs.filter(db => {
      const matchSearch = search === '' ||
        db.name.toLowerCase().includes(search.toLowerCase()) ||
        (db.host ?? '').toLowerCase().includes(search.toLowerCase());
      const matchEngine = engineFilter.size === 0 || engineFilter.has(db.engine);
      const matchStatus = statusFilter === 'all' || db.status === statusFilter;
      return matchSearch && matchEngine && matchStatus;
    });
  }, [allDbs, search, engineFilter, statusFilter]);

  const cfg = ENGINE_CONFIG[form.engine as Engine] ?? ENGINE_CONFIG.other;

  function buildContextMenu(db: InfraDatabase): ContextMenuItem[] {
    return [
      { icon: 'open',  label: 'Open database', onClick: () => router.push(`/databases/${db.id}`) },
      { type: 'separator' },
      { icon: 'check', label: 'Test connection', onClick: async () => {
        const token = await getToken();
        const res = await testInfraDatabaseConnection(token, db.id);
        alert(`Test: ${res.data.ok ? '✓' : '✗'} ${res.data.message} (${res.data.latency_ms}ms)`);
      }},
      { icon: 'copy', label: 'Copy connection string', onClick: async () => {
        const token = await getToken();
        const res = await getInfraDatabaseConnectionString(token, db.id, false);
        await navigator.clipboard.writeText(res.data.connection_string);
      }},
      ...(db.host ? [{ icon: 'copy', label: 'Copy host', onClick: () => navigator.clipboard.writeText(db.host!) } as ContextMenuItem] : []),
      { icon: 'copy',  label: 'Copy name', onClick: () => navigator.clipboard.writeText(db.name) },
      { icon: 'duplicate', label: 'Duplicate', onClick: () => {
        setForm({ name: `${db.name}-copy`, engine: db.engine, host: db.host ?? '', port: db.port ? String(db.port) : '', database_name: db.database_name ?? '', db_user: db.db_user ?? '', db_password: '', use_ssl: db.use_ssl });
        setModal(true);
      }},
      { type: 'separator' },
      { icon: 'alert', label: 'View alerts', onClick: () => router.push(`/databases/${db.id}?tab=alerts`) },
      { type: 'separator' },
      { icon: 'trash', label: 'Remove database', danger: true, onClick: () =>
        askConfirm({ title: 'Remove database', message: 'Remove this database from monitoring?', confirmLabel: 'Remove', variant: 'danger', onConfirm: () => deleteMut.mutate(db.id) })
      },
    ];
  }

  return (
    <>
      <Topbar action={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['table', 'card'] as const).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                title={`${m} view`}
                style={{
                  background: viewMode === m ? 'var(--surface2)' : 'var(--surface)',
                  border: 'none', padding: '6px 10px', cursor: 'pointer',
                  color: viewMode === m ? 'var(--text)' : 'var(--text3)', fontSize: 13,
                }}
              >
                {m === 'table' ? '≡' : '⊞'}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => setModal(true)}>+ Add Database</Button>
        </div>
      } />

      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Search name or host…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 13, background: 'var(--bg)', color: 'var(--text)', width: 220,
            }}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {ENGINES.map(engine => {
              const active = engineFilter.has(engine);
              return (
                <button
                  key={engine}
                  onClick={() => {
                    setEngineFilter(prev => {
                      const next = new Set(prev);
                      if (active) next.delete(engine); else next.add(engine);
                      return next;
                    });
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
                    background: active ? 'var(--text)' : 'var(--surface)',
                    color: active ? 'var(--bg)' : 'var(--text2)',
                    transition: 'all .12s',
                  }}
                >
                  {engine}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['all', ...ALL_STATUSES] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  background: statusFilter === s ? 'var(--surface2)' : 'var(--surface)',
                  border: 'none', padding: '5px 10px', cursor: 'pointer',
                  fontSize: 12, color: statusFilter === s ? 'var(--text)' : 'var(--text3)',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 4 }}>
            {filtered.length} of {allDbs.length}
          </span>
        </div>

        {viewMode === 'table' ? (
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: DB_TABLE_COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
              {['Name', 'Engine', 'Host', 'Port', 'Status', 'Last checked', ''].map(h => (
                <span key={h} style={eyebrow}>{h}</span>
              ))}
            </div>

            {isLoading ? (
              [0, 1, 2].map(i => <SkeletonRow key={i} cols={DB_TABLE_COLS} />)
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                {allDbs.length === 0 ? 'No databases configured.' : 'No databases match your filters.'}
              </div>
            ) : filtered.map((db, i) => (
              <DatabaseRow
                key={db.id}
                db={db}
                last={i === filtered.length - 1}
                index={i}
                onClick={() => router.push(`/databases/${db.id}`)}
                onDelete={() => askConfirm({ title: 'Remove database', message: 'Remove this database from monitoring?', confirmLabel: 'Remove', variant: 'danger', onConfirm: () => deleteMut.mutate(db.id) })}
                onContextMenu={e => openMenu(e, buildContextMenu(db))}
              />
            ))}
          </div>
        ) : (
          isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', height: 140 }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
              {allDbs.length === 0 ? 'No databases configured.' : 'No databases match your filters.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
              {filtered.map((db, i) => (
                <DatabaseCard
                  key={db.id}
                  db={db}
                  index={i}
                  onClick={() => router.push(`/databases/${db.id}`)}
                  onContextMenu={e => openMenu(e, buildContextMenu(db))}
                />
              ))}
            </div>
          )
        )}
      </div>

      {modal && (
        <Modal title="Add database" onClose={() => { setModal(false); setTestResult(null); }}>
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
              <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>{cfg.hint}</div>
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

            {testResult && (
              <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, fontSize: 12, background: testResult.ok ? 'var(--green-bg)' : 'var(--red-bg)', color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                {testResult.ok ? `✓ Connected in ${testResult.latency_ms}ms` : `✗ ${testResult.message}`}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={handleTestConnection} disabled={testPending}>
                {testPending ? 'Testing…' : 'Test connection'}
              </Button>
              <Button type="button" onClick={() => { setModal(false); setTestResult(null); }}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Saving…' : 'Add database'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
      {confirmEl}
    </>
  );
}
