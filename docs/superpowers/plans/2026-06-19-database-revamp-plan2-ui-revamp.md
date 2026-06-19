# Database Module Revamp — Plan 2: UI Revamp

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely revamp the list and detail page UI — card/table toggle with search/filter, staggered animations, skeleton loaders, status pulse dots, expanded context menu, new detail header, sliding tab indicator, tab fade transitions, metric count-up, and a sidebar-based Tables tab layout.

**Architecture:** List page gains a `useViewMode` hook for localStorage persistence, a filter state hook, and new `DatabaseCard` and `DatabaseRow` components. Detail page gets a `DatabaseHeader` component and CSS-driven tab animations. All animations use CSS custom properties and `@keyframes` defined in component style blocks. IBM Plex Sans/Mono/Serif are already globally applied.

**Tech Stack:** React, TanStack Query, inline CSS (matching existing patterns), CSS keyframes via `<style>` tags in components. No new dependencies.

**Prerequisite:** Plan 1 must be complete (branch `feat/database-module-revamp` exists).

---

### Task 1: Add Pulse Dot + Skeleton Primitives

**Files:**
- Create: `apps/web/modules/databases/components/PulseDot.tsx`
- Create: `apps/web/modules/databases/components/SkeletonRow.tsx`

These are reusable within the databases module.

- [ ] **Step 1: Create PulseDot**

```tsx
'use client';

import React from 'react';

const COLOR: Record<string, string> = {
  healthy: 'var(--green)',
  online:  'var(--green)',
  degraded: 'var(--amber)',
  offline: 'var(--red)',
};

export function PulseDot({ status }: { status: string }) {
  const color = COLOR[status] ?? 'var(--text3)';
  const animate = status === 'healthy' || status === 'online';
  return (
    <>
      <style>{`
        @keyframes db-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
      <span style={{
        display: 'inline-block',
        width: 7, height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: animate ? 'db-pulse 2s ease-in-out infinite' : 'none',
      }} />
    </>
  );
}
```

- [ ] **Step 2: Create SkeletonRow**

```tsx
'use client';

import React from 'react';

export function SkeletonRow({ cols }: { cols: string }) {
  return (
    <>
      <style>{`
        @keyframes db-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .db-skeleton-cell {
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--border) 25%, var(--surface2) 50%, var(--border) 75%);
          background-size: 800px 100%;
          animation: db-shimmer 1.4s infinite;
        }
      `}</style>
      <div style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: 14,
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
      }}>
        {Array.from({ length: cols.split(' ').length }).map((_, i) => (
          <div key={i} className="db-skeleton-cell" style={{ width: i === cols.split(' ').length - 1 ? 40 : '70%' }} />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/databases/components/PulseDot.tsx apps/web/modules/databases/components/SkeletonRow.tsx
git commit -m "feat(databases): add PulseDot and SkeletonRow primitives"
```

---

### Task 2: Build DatabaseRow Component

**Files:**
- Create: `apps/web/modules/databases/components/DatabaseRow.tsx`

This extracts the row from `page.tsx` and adds animation, pulse dot, hover actions.

- [ ] **Step 1: Create DatabaseRow**

```tsx
'use client';

import React, { useState } from 'react';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { PulseDot } from './PulseDot';
import type { InfraDatabase } from '@vencore/types';

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue', mysql: 'amber', redis: 'red', clickhouse: 'purple', mongo: 'green', other: 'gray',
};

export const DB_TABLE_COLS = 'minmax(160px,1.4fr) .8fr 1.6fr .6fr .8fr 1.2fr 80px';

interface DatabaseRowProps {
  db: InfraDatabase;
  last: boolean;
  index: number;
  onClick: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function DatabaseRow({ db, last, index, onClick, onDelete, onContextMenu }: DatabaseRowProps) {
  const [hover, setHover] = useState(false);

  return (
    <>
      <style>{`
        @keyframes db-row-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
          display: 'grid',
          gridTemplateColumns: DB_TABLE_COLS,
          gap: 14,
          alignItems: 'center',
          padding: '12px 18px',
          borderBottom: last ? 'none' : '1px solid var(--border)',
          background: hover ? 'var(--surface2)' : 'transparent',
          transition: 'background .12s',
          cursor: 'pointer',
          fontSize: 13,
          animation: `db-row-in 150ms ease-out both`,
          animationDelay: `${index * 30}ms`,
        }}
      >
        <span style={{ fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
          {db.name}
        </span>
        <span><Badge label={db.engine} color={ENGINE_COLOR[db.engine] ?? 'gray'} /></span>
        <span style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{db.host ?? '—'}</span>
        <span style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{db.port ?? '—'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PulseDot status={db.status} />
          <Badge label={db.status} color={statusColor[db.status] ?? 'gray'} />
        </span>
        <span style={{ color: 'var(--text2)' }}>
          {db.last_checked_at ? new Date(db.last_checked_at).toLocaleString() : 'never'}
        </span>
        <span
          onClick={e => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: hover ? 1 : 0,
            transition: 'opacity .12s',
          }}
        >
          <button
            title="Remove"
            onClick={onDelete}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text2)',
            }}
          >
            Remove
          </button>
        </span>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/modules/databases/components/DatabaseRow.tsx
git commit -m "feat(databases): extract DatabaseRow with staggered fade-in and pulse status dot"
```

---

### Task 3: Build DatabaseCard Component

**Files:**
- Create: `apps/web/modules/databases/components/DatabaseCard.tsx`

- [ ] **Step 1: Create DatabaseCard**

```tsx
'use client';

import React, { useState } from 'react';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { PulseDot } from './PulseDot';
import type { InfraDatabase } from '@vencore/types';

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue', mysql: 'amber', redis: 'red', clickhouse: 'purple', mongo: 'green', other: 'gray',
};

interface DatabaseCardProps {
  db: InfraDatabase;
  index: number;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function DatabaseCard({ db, index, onClick, onContextMenu }: DatabaseCardProps) {
  const [hover, setHover] = useState(false);

  return (
    <>
      <style>{`
        @keyframes db-card-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
          background: hover ? 'var(--surface2)' : 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 18px',
          cursor: 'pointer',
          transition: 'background .12s, box-shadow .12s',
          boxShadow: hover ? '0 2px 8px rgba(0,0,0,.06)' : 'none',
          animation: `db-card-in 150ms ease-out both`,
          animationDelay: `${index * 30}ms`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Badge label={db.engine} color={ENGINE_COLOR[db.engine] ?? 'gray'} />
          <PulseDot status={db.status} />
          <Badge label={db.status} color={statusColor[db.status] ?? 'gray'} />
        </div>

        {/* Name */}
        <div style={{
          fontFamily: "'IBM Plex Serif', serif",
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          {db.name}
        </div>

        {/* Host */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text3)',
          marginBottom: 12,
        }}>
          {db.host ? `${db.host}${db.port ? `:${db.port}` : ''}` : 'no host configured'}
        </div>

        {/* Mini stats */}
        <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {[
            { label: 'Storage', value: db.storage_gb !== null ? `${db.storage_gb.toFixed(1)} GB` : '—' },
            { label: 'Conns', value: db.connection_count !== null ? String(db.connection_count) : '—' },
            { label: 'Lag', value: db.replication_lag_s !== null ? `${db.replication_lag_s}s` : '—' },
          ].map(stat => (
            <div key={stat.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/modules/databases/components/DatabaseCard.tsx
git commit -m "feat(databases): add DatabaseCard component for card view"
```

---

### Task 4: Revamp List Page

**Files:**
- Modify: `apps/web/modules/databases/pages/page.tsx`

> **Dependency:** Complete Task 5 first — the list page imports `getInfraDatabaseConnectionString` and `getInfraDatabaseThresholds` from the lib file that Task 5 creates.

This is a full rewrite of the list page. Replace the entire file content.

- [ ] **Step 1: Replace `apps/web/modules/databases/pages/page.tsx`**

```tsx
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
        // Show toast — using a simple alert for now, replace with toast system
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
          {/* View toggle */}
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
        {/* Search + filter bar */}
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
          {/* Engine filter chips */}
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
          {/* Status filter */}
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

            {/* Test result */}
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/databases/pages/page.tsx
git commit -m "feat(databases): revamp list page — card/table toggle, search/filter, animations, expanded context menu"
```

---

### Task 5: Add New API Calls to Frontend Lib

**Files:**
- Modify: `apps/web/modules/databases/lib/infra-databases.ts`

- [ ] **Step 1: Add missing API functions**

Append to the existing file:

```typescript
export async function getInfraDatabaseConnectionString(token: string, id: string, reveal: boolean) {
  return apiFetch<{ data: { connection_string: string; revealed: boolean }; error: null }>(
    `/api/databases/${id}/connection-string${reveal ? '?reveal=true' : ''}`,
    { token },
  );
}

export async function listInfraDatabaseAlerts(token: string, id: string, resolved?: boolean) {
  const qs = resolved !== undefined ? `?resolved=${resolved}` : '';
  return apiFetch<{ data: Alert[]; error: null }>(`/api/databases/${id}/alerts${qs}`, { token });
}

export async function listInfraDatabaseQueryHistory(token: string, id: string) {
  return apiFetch<{ data: QueryHistoryEntry[]; error: null }>(`/api/databases/${id}/query-history`, { token });
}

export async function clearInfraDatabaseQueryHistory(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/databases/${id}/query-history`, { method: 'DELETE', token });
}

export async function getInfraDatabaseThresholds(token: string, id: string) {
  return apiFetch<{ data: DbThresholdsResponse; error: null }>(`/api/databases/${id}/thresholds`, { token });
}

export async function setInfraDatabaseThresholds(token: string, id: string, body: DbThresholdInput) {
  return apiFetch<{ data: unknown; error: null }>(`/api/databases/${id}/thresholds`, { method: 'PUT', body: JSON.stringify(body), token });
}

export async function clearInfraDatabaseThresholds(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/databases/${id}/thresholds`, { method: 'DELETE', token });
}

export async function getWorkspaceDbThresholdDefaults(token: string) {
  return apiFetch<{ data: DbThresholdValues; error: null }>('/api/databases/thresholds/defaults', { token });
}

export async function setWorkspaceDbThresholdDefaults(token: string, body: DbThresholdInput) {
  return apiFetch<{ data: unknown; error: null }>('/api/databases/thresholds/defaults', { method: 'PUT', body: JSON.stringify(body), token });
}

// Local types for the new endpoints
export interface DbThresholdValues {
  connection_count_max: number;
  replication_lag_s_max: number;
  storage_gb_max: number;
}

export interface DbThresholdInput {
  connection_count_max?: number;
  replication_lag_s_max?: number;
  storage_gb_max?: number;
}

export interface DbThresholdsResponse {
  effective: DbThresholdValues;
  override: (DbThresholdValues & { id: string }) | null;
  workspace_default: (DbThresholdValues & { id: string }) | null;
}

export interface QueryHistoryEntry {
  id: string;
  query_text: string;
  query_type: 'sql' | 'mongo';
  executed_at: string;
  row_count: number | null;
  duration_ms: number | null;
}

// Alert type (reuse from @vencore/types if exported, otherwise define inline)
export interface Alert {
  id: string;
  workspace_id: string;
  resource_type: string;
  resource_id: string | null;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  acknowledged: boolean;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/databases/lib/infra-databases.ts
git commit -m "feat(databases): add API client functions for thresholds, alerts, query history, connection string"
```

---

### Task 6: Build New Detail Page Header Component

**Files:**
- Create: `apps/web/modules/databases/components/detail/DatabaseHeader.tsx`

- [ ] **Step 1: Create DatabaseHeader**

```tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { PulseDot } from '../PulseDot';
import type { InfraDatabase } from '@vencore/types';

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue', mysql: 'amber', redis: 'red', clickhouse: 'purple', mongo: 'green', other: 'gray',
};

const ENGINE_ICON: Record<string, string> = {
  postgres: 'PG', mysql: 'MY', redis: 'RE', clickhouse: 'CH', mongo: 'MG', other: 'DB',
};

export function DatabaseHeader({ database }: { database: InfraDatabase }) {
  const router = useRouter();

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Breadcrumb */}
      <button
        onClick={() => router.push('/databases')}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 12, color: 'var(--text3)', marginBottom: 8, display: 'block',
        }}
      >
        ← Databases
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {/* Engine badge */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text2)', fontFamily: 'var(--font-mono)',
        }}>
          {ENGINE_ICON[database.engine] ?? 'DB'}
        </div>

        {/* Name */}
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600,
          fontFamily: "'IBM Plex Serif', serif",
          color: 'var(--text)',
        }}>
          {database.name}
        </h1>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PulseDot status={database.status} />
          <Badge label={database.status} color={statusColor[database.status] ?? 'gray'} />
        </div>

        <Badge label={database.engine} color={ENGINE_COLOR[database.engine] ?? 'gray'} />

        {/* Host */}
        {database.host && (
          <span style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            {database.host}{database.port ? `:${database.port}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/modules/databases/components/detail/DatabaseHeader.tsx
git commit -m "feat(databases): add DatabaseHeader with IBM Plex Serif name, engine badge, pulse dot"
```

---

### Task 7: Revamp Detail Page — Tabs + Overview + Tables

**Files:**
- Modify: `apps/web/modules/databases/pages/[id]/page.tsx`

This is a large file. Make targeted edits rather than a full rewrite.

- [ ] **Step 1: Import new components**

At the top of the file, add:

```typescript
import { DatabaseHeader } from '@/modules/databases/components/detail/DatabaseHeader';
import { useSearchParams } from 'next/navigation';
```

- [ ] **Step 2: Replace `useState<'overview' | ...>('overview')` tab state to read from URL**

Replace:
```typescript
const [tab, setTab] = useState<'overview' | 'tables' | 'sql' | 'mongo-query' | 'settings'>('overview');
```
With:
```typescript
const searchParams = useSearchParams();
const initialTab = (searchParams.get('tab') ?? 'overview') as 'overview' | 'tables' | 'sql' | 'mongo-query' | 'alerts' | 'activities' | 'settings';
const [tab, setTab] = useState(initialTab);
```

- [ ] **Step 3: Replace the header section in `DatabaseDetailPage`**

Replace the block:
```typescript
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{database.name}</h2>
  <Badge label={database.status} color={statusColor[database.status] ?? 'gray'} />
  <Badge label={database.engine} color={ENGINE_COLOR[database.engine] ?? 'gray'} />
  <span style={{ fontSize: 13, color: 'var(--text3)' }}>{database.host ?? 'no host'}{database.port ? `:${database.port}` : ''}</span>
</div>
```
With:
```typescript
<DatabaseHeader database={database} />
```

- [ ] **Step 4: Replace the static Back button in the Topbar**

Remove:
```typescript
<Topbar action={<Button onClick={() => router.push('/databases')}>Back to databases</Button>} />
```
Replace with:
```typescript
<Topbar />
```
(Navigation is now handled by the DatabaseHeader breadcrumb.)

- [ ] **Step 5: Replace tab list to include new tabs + add sliding underline**

Replace the tab bar block:
```typescript
<div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
  {(isMongo
    ? ['overview', 'tables', 'mongo-query', 'settings'] as const
    : ['overview', 'tables', 'sql', 'settings'] as const
  ).map(nextTab => (
    <button
      key={nextTab}
      onClick={() => setTab(nextTab as typeof tab)}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: tab === nextTab ? '2px solid var(--text)' : '2px solid transparent',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: tab === nextTab ? 600 : 400,
        color: tab === nextTab ? 'var(--text)' : 'var(--text3)',
        cursor: 'pointer',
        textTransform: 'capitalize',
        marginBottom: -1,
      }}
    >
      {nextTab === 'mongo-query' ? 'Query' : nextTab === 'tables' && isMongo ? 'Collections' : nextTab}
    </button>
  ))}
</div>
```
With:
```typescript
<>
  <style>{`
    @keyframes db-tab-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `}</style>
  <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)', position: 'relative' }}>
    {(isMongo
      ? (['overview', 'tables', 'mongo-query', 'alerts', 'activities', 'settings'] as const)
      : (['overview', 'tables', 'sql', 'alerts', 'activities', 'settings'] as const)
    ).map(nextTab => (
      <button
        key={nextTab}
        onClick={() => setTab(nextTab as typeof tab)}
        style={{
          background: 'none',
          border: 'none',
          borderBottom: tab === nextTab ? '2px solid var(--text)' : '2px solid transparent',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: tab === nextTab ? 600 : 400,
          color: tab === nextTab ? 'var(--text)' : 'var(--text3)',
          cursor: 'pointer',
          textTransform: 'capitalize',
          marginBottom: -1,
          transition: 'color .15s, border-bottom-color .15s',
        }}
      >
        {nextTab === 'mongo-query' ? 'Query' : nextTab === 'tables' && isMongo ? 'Collections' : nextTab}
      </button>
    ))}
  </div>
</>
```

- [ ] **Step 6: Wrap tab content in fade animation div**

Wrap each tab content rendering with:
```typescript
<div
  key={tab}
  style={{ animation: 'db-tab-in 150ms ease-out both' }}
>
  {tab === 'overview' && <OverviewTab database={database} />}
  {tab === 'tables' && <TablesTab databaseId={id} engine={database.engine} isAdmin={isAdmin} />}
  {tab === 'sql' && !isMongo && <SqlTab databaseId={id} isAdmin={isAdmin} />}
  {tab === 'mongo-query' && isMongo && <MongoQueryTab databaseId={id} />}
  {tab === 'alerts' && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Alerts tab — coming in Plan 3.</div>}
  {tab === 'activities' && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Activities tab — coming in Plan 3.</div>}
  {tab === 'settings' && <SettingsTab database={database} />}
</div>
```

- [ ] **Step 7: Update Tables tab to use sidebar layout**

Replace the `TablesTab` function `return` block entirely. Find the section starting with `return (` inside `TablesTab` and replace the contents (keep all state and hooks above):

```tsx
if (!supported) {
  return <div style={{ color: 'var(--text2)', fontSize: 13 }}>Data browsing supports Postgres, MySQL, and MongoDB databases.</div>;
}

const rows = rowsQuery.data?.data;

return (
  <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
    {/* Sidebar */}
    <div style={{ width: 200, borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ padding: '10px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, borderBottom: '1px solid var(--border)' }}>
        {isMongo ? 'Collections' : 'Tables'}
      </div>
      {schemaQuery.isLoading ? (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
      ) : tables.map(table => {
        const key = `${table.schema}.${table.name}`;
        const isSelected = selectedKey === key;
        return (
          <button
            key={key}
            onClick={() => { setSelectedKey(key); setPage(1); setEditing(false); setEdits({}); }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 12px', border: 'none', cursor: 'pointer',
              background: isSelected ? 'var(--surface2)' : 'transparent',
              color: isSelected ? 'var(--text)' : 'var(--text2)',
              fontSize: 12, fontFamily: 'var(--font-mono)',
              fontWeight: isSelected ? 600 : 400,
              borderBottom: '1px solid var(--border)',
            }}
          >
            {isMongo ? table.name : table.name}
          </button>
        );
      })}
    </div>

    {/* Data panel */}
    <div style={{ flex: 1, overflow: 'auto' }}>
      {selected && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {isAdmin && supportsEdit && rows && (
            editing ? (
              <>
                <Button variant="primary" onClick={() => void save(rows)} disabled={updateMut.isPending || Object.keys(edits).length === 0}>{updateMut.isPending ? 'Saving...' : 'Save changes'}</Button>
                <Button onClick={() => { setEditing(false); setEdits({}); setError(null); }}>Discard</Button>
              </>
            ) : <Button onClick={() => setEditing(true)}>Edit</Button>
          )}
          {!isAdmin && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Read-only</span>}
        </div>
      )}
      {selected && selected.primary_key.length === 0 && (
        <div style={{ margin: '8px 12px', color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
          No primary key found. Edits use original-row matching and may conflict if duplicate rows exist.
        </div>
      )}
      {error && <div style={{ margin: '8px 12px', color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {(rows?.columns ?? []).map(column => (
              <th key={column.name} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--surface)' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{column.name}</span>
                {column.primary_key && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--blue)', fontWeight: 700 }}>PK</span>}
                {column.type && <span style={{ marginLeft: 6, padding: '1px 5px', background: 'var(--surface2)', borderRadius: 4, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{column.type}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowsQuery.isLoading ? (
            <tr><td style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }} colSpan={selected?.columns.length ?? 1}>Loading...</td></tr>
          ) : !rows || rows.rows.length === 0 ? (
            <tr><td style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }} colSpan={selected?.columns.length ?? 1}>No rows.</td></tr>
          ) : rows.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {rows.columns.map(column => {
                const editKey = `${rowIndex}:${column.name}`;
                const text = edits[editKey] ?? valueText(row[column.name]);
                return (
                  <td key={column.name} style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <Button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
        <Button disabled={!rows || rows.rows.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 8: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/modules/databases/pages/[id]/page.tsx
git commit -m "feat(databases): revamp detail page — new header, animated tabs, sidebar Tables layout, URL-driven tab init"
```

---

### Task 8: Metric Count-Up in Overview Tab

**Files:**
- Modify: `apps/web/modules/databases/pages/[id]/page.tsx` — update `Metric` component

- [ ] **Step 1: Replace the `Metric` function**

Find and replace the existing `Metric` function:

```tsx
function useCountUp(target: number | null, duration = 400): number | null {
  const [display, setDisplay] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (target === null) { setDisplay(null); return; }
    if (target === 0) { setDisplay(0); return; }
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * ease));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

function Metric({ label, value, rawValue, prevValue }: { label: string; value: string; rawValue?: number | null; prevValue?: number | null }) {
  const animated = useCountUp(rawValue ?? null);
  const showCount = rawValue !== null && rawValue !== undefined && animated !== null;

  let trend: 'up' | 'down' | 'neutral' = 'neutral';
  if (prevValue !== null && prevValue !== undefined && rawValue !== null && rawValue !== undefined) {
    if (rawValue > prevValue) trend = 'up';
    else if (rawValue < prevValue) trend = 'down';
  }
  const trendColor = trend === 'up' ? 'var(--red)' : trend === 'down' ? 'var(--green)' : 'var(--text3)';
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {showCount ? animated : value}
        </div>
        {trend !== 'neutral' && (
          <span style={{ fontSize: 13, color: trendColor }}>{trendIcon}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `OverviewTab` to pass `rawValue`**

In `OverviewTab`, update the `Metric` calls:
```tsx
<Metric label="Storage" value={database.storage_gb !== null ? `${database.storage_gb.toFixed(2)} GB` : '-'} rawValue={database.storage_gb} />
<Metric label="Connections" value={database.connection_count !== null ? String(database.connection_count) : '-'} rawValue={database.connection_count} />
<Metric label="Replication lag" value={database.replication_lag_s !== null ? `${database.replication_lag_s}s` : '-'} rawValue={database.replication_lag_s} />
<Metric label="Memory" value={database.memory_used_mb !== null ? `${database.memory_used_mb.toFixed(1)} MB` : '-'} rawValue={database.memory_used_mb} />
<Metric label="Clients" value={database.connected_clients !== null ? String(database.connected_clients) : '-'} rawValue={database.connected_clients} />
<Metric label="Uptime" value={database.uptime_seconds !== null ? `${Math.floor(database.uptime_seconds / 3600)}h` : '-'} rawValue={database.uptime_seconds} />
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/databases/pages/[id]/page.tsx
git commit -m "feat(databases): add metric count-up animation and trend arrows to Overview tab"
```
