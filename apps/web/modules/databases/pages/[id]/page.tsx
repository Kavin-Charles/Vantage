'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { DatabaseHeader } from '@/modules/databases/components/detail/DatabaseHeader';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/modules/shared/components/ui/FormField';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  getInfraDatabase,
  listInfraDatabaseRows,
  listInfraDatabaseSchema,
  runInfraDatabaseSql,
  runMongoDbQuery,
  testInfraDatabaseConnection,
  updateInfraDatabase,
  updateInfraDatabaseRow,
} from '@/modules/databases/lib/infra-databases';
import type { InfraDatabase, InfraDatabaseRows, InfraDatabaseSqlResult, InfraDatabaseTable } from '@vencore/types';

const ENGINES = ['postgres', 'mysql', 'redis', 'clickhouse', 'mongo', 'other'] as const;
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseEditedValue(input: string, original: unknown): unknown {
  if (input === '') return null;
  if (typeof original === 'number') {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : input;
  }
  if (typeof original === 'boolean') return input === 'true';
  return input;
}

function isDml(sql: string): boolean {
  return /^(insert|update|delete)\b/i.test(sql.trim()) || (/^with\b/i.test(sql.trim()) && /\b(insert|update|delete)\b/i.test(sql));
}

function useCountUp(target: number, duration = 600): number {
  const [count, setCount] = useState<number>(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setCount(progress < 1 ? Math.round(progress * target) : target);
      if (progress < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration]);
  return count;
}

function Metric({ label, value }: { label: string; value: string }) {
  const numMatch = value.match(/^([\d.]+)(.*)/);
  const numericPart = numMatch ? parseFloat(numMatch[1]!) : null;
  const suffix = numMatch ? numMatch[2] : '';
  const animated = useCountUp(numericPart ?? 0);

  const display = numericPart !== null
    ? `${Number.isInteger(numericPart) ? animated : animated.toFixed(numericPart < 10 ? 2 : 1)}${suffix}`
    : value;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace" }}>{display}</div>
    </div>
  );
}

function OverviewTab({ database }: { database: InfraDatabase }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Metric label="Storage" value={database.storage_gb !== null ? `${database.storage_gb.toFixed(2)} GB` : '-'} />
        <Metric label="Connections" value={database.connection_count !== null ? String(database.connection_count) : '-'} />
        <Metric label="Replication lag" value={database.replication_lag_s !== null ? `${database.replication_lag_s}s` : '-'} />
        <Metric label="Memory" value={database.memory_used_mb !== null ? `${database.memory_used_mb.toFixed(1)} MB` : '-'} />
        <Metric label="Clients" value={database.connected_clients !== null ? String(database.connected_clients) : '-'} />
        <Metric label="Uptime" value={database.uptime_seconds !== null ? `${Math.floor(database.uptime_seconds / 3600)}h` : '-'} />
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 12 }}>Details</div>
        {[
          ['Host', database.host ?? '-'],
          ['Port', database.port !== null ? String(database.port) : '-'],
          ['Database', database.database_name ?? '-'],
          ['User', database.db_user ?? '-'],
          ['SSL', database.use_ssl ? 'enabled' : 'disabled'],
          ['Password', database.has_password ? 'configured' : 'not configured'],
          ['Last checked', database.last_checked_at ? new Date(database.last_checked_at).toLocaleString() : 'never'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TablesTab({ databaseId, engine, isAdmin }: { databaseId: string; engine: string; isAdmin: boolean }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const isMongo = engine === 'mongo';
  const supported = engine === 'postgres' || engine === 'mysql' || isMongo;
  const supportsEdit = engine === 'postgres' || engine === 'mysql';
  const [selectedKey, setSelectedKey] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const schemaQuery = useQuery({
    queryKey: ['infra-db-schema', databaseId],
    queryFn: async () => listInfraDatabaseSchema(await getToken(), databaseId),
    enabled: supported,
  });

  const tables = schemaQuery.data?.data ?? [];
  useEffect(() => {
    if (!selectedKey && tables.length > 0) setSelectedKey(`${tables[0]!.schema}.${tables[0]!.name}`);
  }, [selectedKey, tables]);

  const selected = useMemo(() => {
    const [schema, ...nameParts] = selectedKey.split('.');
    const name = nameParts.join('.');
    return tables.find(t => t.schema === schema && t.name === name);
  }, [selectedKey, tables]);

  const rowsQuery = useQuery({
    queryKey: ['infra-db-rows', databaseId, selected?.schema, selected?.name, page],
    queryFn: async () => listInfraDatabaseRows(await getToken(), databaseId, selected!.name, selected!.schema, page, 50),
    enabled: Boolean(selected),
  });

  const updateMut = useMutation({
    mutationFn: async (payload: { table: InfraDatabaseTable; original: Record<string, unknown>; changes: Record<string, unknown> }) =>
      updateInfraDatabaseRow(await getToken(), databaseId, payload.table.name, {
        schema: payload.table.schema,
        original: payload.original,
        changes: payload.changes,
      }),
    onSuccess: async () => {
      setEdits({});
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['infra-db-rows', databaseId] });
    },
    onError: err => setError(err instanceof Error ? err.message : 'Could not save row changes'),
  });

  async function save(rows: InfraDatabaseRows) {
    if (!selected) return;
    setError(null);
    for (const rowIndex of [...new Set(Object.keys(edits).map(key => Number(key.split(':')[0])))]){
      const original = rows.rows[rowIndex];
      if (!original) continue;
      const changes: Record<string, unknown> = {};
      for (const column of rows.columns) {
        const key = `${rowIndex}:${column.name}`;
        if (Object.prototype.hasOwnProperty.call(edits, key)) {
          changes[column.name] = parseEditedValue(edits[key] ?? '', original[column.name]);
        }
      }
      await updateMut.mutateAsync({ table: selected, original, changes });
    }
  }

  if (!supported) {
    return <div style={{ color: 'var(--text2)', fontSize: 13 }}>Data browsing supports Postgres, MySQL, and MongoDB databases.</div>;
  }

  const rows = rowsQuery.data?.data;

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', minHeight: 400 }}>
      {/* sidebar */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        overflowY: 'auto', paddingRight: 0,
      }}>
        <div style={{ padding: '10px 14px 6px', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4 }}>
          {isMongo ? 'Collections' : 'Tables'}
        </div>
        {schemaQuery.isLoading ? (
          <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
        ) : tables.map(table => {
          const key = `${table.schema}.${table.name}`;
          const isSelected = selectedKey === key;
          return (
            <button
              key={key}
              onClick={() => { setSelectedKey(key); setPage(1); setEditing(false); setEdits({}); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 14px', fontSize: 12.5,
                background: isSelected ? 'var(--surface2)' : 'none',
                border: 'none', borderLeft: isSelected ? '2px solid var(--text)' : '2px solid transparent',
                color: isSelected ? 'var(--text)' : 'var(--text2)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}
            >
              {table.name}
            </button>
          );
        })}
      </div>

      {/* main */}
      <div style={{ flex: 1, overflow: 'auto', paddingLeft: 20 }}>
        {selected && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
              {isMongo ? selected.name : `${selected.schema}.${selected.name}`}
            </span>
            {isAdmin && supportsEdit && rows && (
              editing ? (
                <>
                  <Button variant="primary" onClick={() => void save(rows)} disabled={updateMut.isPending || Object.keys(edits).length === 0}>{updateMut.isPending ? 'Saving…' : 'Save changes'}</Button>
                  <Button onClick={() => { setEditing(false); setEdits({}); setError(null); }}>Discard</Button>
                </>
              ) : <Button onClick={() => setEditing(true)}>Edit</Button>
            )}
            {!isAdmin && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Read-only</span>}
          </div>
        )}
        {selected && selected.primary_key.length === 0 && (
          <div style={{ marginBottom: 12, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
            No primary key found. Edits use original-row matching and may conflict if duplicate rows exist.
          </div>
        )}
        {error && <div style={{ marginBottom: 12, color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{(rows?.columns ?? []).map(column => <th key={column.name} style={th}>{column.name}{column.primary_key ? ' *' : ''}</th>)}</tr>
            </thead>
            <tbody>
              {rowsQuery.isLoading ? (
                <tr><td style={{ ...td, textAlign: 'center', padding: 32 }} colSpan={selected?.columns.length ?? 1}>Loading…</td></tr>
              ) : !rows || rows.rows.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', padding: 32 }} colSpan={selected?.columns.length ?? 1}>No rows.</td></tr>
              ) : rows.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {rows.columns.map(column => {
                    const editKey = `${rowIndex}:${column.name}`;
                    const text = edits[editKey] ?? valueText(row[column.name]);
                    return (
                      <td key={column.name} style={td}>
                        {editing ? (
                          <Input value={text} onChange={e => setEdits(prev => ({ ...prev, [editKey]: e.target.value }))} style={{ minWidth: 140, fontFamily: 'monospace' }} />
                        ) : (
                          <span style={{ fontFamily: 'monospace', color: row[column.name] === null ? 'var(--text3)' : 'var(--text)' }}>
                            {row[column.name] === null ? 'NULL' : valueText(row[column.name])}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
          <Button disabled={!rows || rows.rows.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function SqlTab({ databaseId, isAdmin }: { databaseId: string; isAdmin: boolean }) {
  const getToken = useApiToken();
  const [sql, setSql] = useState('select 1');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<InfraDatabaseSqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runMut = useMutation({
    mutationFn: async (confirmed: boolean) => runInfraDatabaseSql(await getToken(), databaseId, sql, confirmed),
    onSuccess: res => { setResult(res.data); setError(null); setConfirming(false); },
    onError: err => { setError(err instanceof Error ? err.message : 'SQL failed'); setConfirming(false); },
  });

  function run() {
    if (isDml(sql) && isAdmin) {
      setConfirming(true);
      return;
    }
    runMut.mutate(false);
  }

  return (
    <div>
      <Textarea value={sql} onChange={e => setSql(e.target.value)} style={{ minHeight: 140, fontFamily: 'monospace', marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <Button variant="primary" onClick={run} disabled={runMut.isPending}>{runMut.isPending ? 'Running...' : 'Run'}</Button>
        {!isAdmin && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Members can run SELECT only.</span>}
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {result && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
          {result.kind === 'dml' ? (
            <div style={{ padding: 16, fontSize: 13 }}>{result.row_count} rows affected.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{result.columns.map(col => <th key={col} style={th}>{col}</th>)}</tr></thead>
              <tbody>{result.rows.map((row, index) => (
                <tr key={index}>{result.columns.map(col => <td key={col} style={td}><span style={{ fontFamily: 'monospace' }}>{valueText(row[col]) || 'NULL'}</span></td>)}</tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
      {confirming && (
        <Modal title="Run write SQL?" onClose={() => setConfirming(false)}>
          <p style={{ marginTop: 0, color: 'var(--text2)', fontSize: 13 }}>This SQL can change data in the connected database.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => runMut.mutate(true)}>Run SQL</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MongoQueryTab({ databaseId }: { databaseId: string }) {
  const getToken = useApiToken();
  const schemaQuery = useQuery({
    queryKey: ['infra-db-schema', databaseId],
    queryFn: async () => listInfraDatabaseSchema(await getToken(), databaseId),
  });
  const collections = (schemaQuery.data?.data ?? []).map(t => t.name);

  const [collection, setCollection] = useState('');
  const [query, setQuery] = useState('{}');
  const [result, setResult] = useState<InfraDatabaseSqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-select first collection
  useEffect(() => {
    if (!collection && collections.length > 0) setCollection(collections[0]!);
  }, [collection, collections]);

  const runMut = useMutation({
    mutationFn: async () => runMongoDbQuery(await getToken(), databaseId, collection, query),
    onSuccess: res => { setResult(res.data); setError(null); },
    onError: err => { setError(err instanceof Error ? err.message : 'Query failed'); },
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          value={collection}
          onChange={e => setCollection(e.target.value)}
          style={{ width: 220 }}
        >
          {collections.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>collection</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
        Query — JSON filter <code>{'{}'}</code> or aggregate pipeline <code>{'[{"$match": {...}}]'}</code>
      </div>
      <Textarea
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ minHeight: 120, fontFamily: 'monospace', marginBottom: 12 }}
        placeholder='{}'
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <Button variant="primary" onClick={() => runMut.mutate()} disabled={runMut.isPending || !collection}>
          {runMut.isPending ? 'Running...' : 'Run'}
        </Button>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Returns up to 100 documents.</span>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {result && result.kind === 'select' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
          {result.rows.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>No documents matched.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{result.columns.map(col => <th key={col} style={th}>{col}</th>)}</tr></thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {result.columns.map(col => (
                      <td key={col} style={td}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {row[col] === null || row[col] === undefined ? <span style={{ color: 'var(--text3)' }}>null</span> : String(row[col])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ database }: { database: InfraDatabase }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: database.name,
    engine: database.engine,
    host: database.host ?? '',
    port: database.port !== null ? String(database.port) : '',
    db_user: database.db_user ?? '',
    db_password: '',
    database_name: database.database_name ?? '',
    use_ssl: database.use_ssl,
  });
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: database.name,
      engine: database.engine,
      host: database.host ?? '',
      port: database.port !== null ? String(database.port) : '',
      db_user: database.db_user ?? '',
      db_password: '',
      database_name: database.database_name ?? '',
      use_ssl: database.use_ssl,
    });
  }, [database]);

  const saveMut = useMutation({
    mutationFn: async () => updateInfraDatabase(await getToken(), database.id, {
      name: form.name,
      engine: form.engine,
      host: form.host || undefined,
      port: form.port ? Number(form.port) : undefined,
      db_user: form.db_user || undefined,
      db_password: form.db_password || undefined,
      database_name: form.database_name || undefined,
      use_ssl: form.use_ssl,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['infra-database', database.id] });
      setForm(f => ({ ...f, db_password: '' }));
    },
  });

  const testMut = useMutation({
    mutationFn: async () => testInfraDatabaseConnection(await getToken(), database.id, form.db_password || undefined),
    onSuccess: async res => {
      setTestResult(`${res.data.ok ? 'OK' : 'Failed'} in ${res.data.latency_ms}ms: ${res.data.message}`);
      await qc.invalidateQueries({ queryKey: ['infra-database', database.id] });
    },
    onError: err => setTestResult(err instanceof Error ? err.message : 'Connection test failed'),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); saveMut.mutate(); }} style={{ maxWidth: 520 }}>
      <FormField label="Name *"><Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FormField>
      <FormField label="Engine"><Select value={form.engine} onChange={e => setForm(f => ({ ...f, engine: e.target.value as InfraDatabase['engine'] }))}>{ENGINES.map(engine => <option key={engine} value={engine}>{engine}</option>)}</Select></FormField>
      <FormField label="Host"><Input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} /></FormField>
      <FormField label="Port"><Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} /></FormField>
      <FormField label="Database name"><Input value={form.database_name} onChange={e => setForm(f => ({ ...f, database_name: e.target.value }))} /></FormField>
      <FormField label="User"><Input value={form.db_user} onChange={e => setForm(f => ({ ...f, db_user: e.target.value }))} /></FormField>
      <FormField label="Replace password"><Input type="password" value={form.db_password} placeholder={database.has_password ? 'Leave blank to keep existing password' : 'No password configured'} onChange={e => setForm(f => ({ ...f, db_password: e.target.value }))} /></FormField>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        <input type="checkbox" checked={form.use_ssl} onChange={e => setForm(f => ({ ...f, use_ssl: e.target.checked }))} />
        Use SSL
      </label>
      {testResult && <div style={{ fontSize: 13, color: testResult.startsWith('OK') ? 'var(--green)' : 'var(--red)', marginBottom: 12 }}>{testResult}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" variant="primary" disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving...' : 'Save settings'}</Button>
        <Button onClick={() => testMut.mutate()} disabled={testMut.isPending}>{testMut.isPending ? 'Testing...' : 'Test connection'}</Button>
      </div>
    </form>
  );
}

type Tab = 'overview' | 'tables' | 'sql' | 'mongo-query' | 'alerts' | 'activities' | 'settings';

export default function DatabaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const getToken = useApiToken();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) ?? 'overview');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['infra-database', id],
    queryFn: async () => getInfraDatabase(await getToken(), id),
    refetchInterval: 30_000,
  });

  const database = data?.data;
  const isAdmin = user?.role === 'admin';

  if (isLoading) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div></>;
  if (isError) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load database. Check that the API is running.</div></>;
  if (!database) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Database not found.</div></>;

  const isMongo = database.engine === 'mongo';

  const tabList: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'tables', label: isMongo ? 'Collections' : 'Tables' },
    ...(isMongo ? [{ key: 'mongo-query' as Tab, label: 'Query' }] : [{ key: 'sql' as Tab, label: 'SQL' }]),
    { key: 'alerts', label: 'Alerts' },
    { key: 'activities', label: 'Activities' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <>
      <style>{`
        @keyframes db-tab-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Topbar />
      <div style={{ padding: 24 }}>
        <DatabaseHeader database={database} />

        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {tabList.map(({ key: t, label }) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--text)' : 'var(--text3)',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color .15s, border-bottom-color .15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div key={tab} style={{ animation: 'db-tab-in 150ms ease-out both' }}>
          {tab === 'overview' && <OverviewTab database={database} />}
          {tab === 'tables' && <TablesTab databaseId={id} engine={database.engine} isAdmin={isAdmin} />}
          {tab === 'sql' && !isMongo && <SqlTab databaseId={id} isAdmin={isAdmin} />}
          {tab === 'mongo-query' && isMongo && <MongoQueryTab databaseId={id} />}
          {tab === 'alerts' && (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '24px 0' }}>
              Alerts tab — coming soon.
            </div>
          )}
          {tab === 'activities' && (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '24px 0' }}>
              Activities tab — coming soon.
            </div>
          )}
          {tab === 'settings' && <SettingsTab database={database} />}
        </div>
      </div>
    </>
  );
}

