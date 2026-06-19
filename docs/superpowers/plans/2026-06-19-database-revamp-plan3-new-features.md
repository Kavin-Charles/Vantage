# Database Module Revamp — Plan 3: New Feature Tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Alerts tab (alert history + threshold panel), Activities tab, SQL query history drawer, and the connection string reveal in the Overview tab.

**Architecture:** New tab components in `apps/web/modules/databases/components/detail/`. The detail page `[id]/page.tsx` imports and mounts them. All data access goes through the lib functions added in Plan 2 Task 5. No new API routes needed — all were built in Plan 1.

**Tech Stack:** React, TanStack Query, inline CSS. IBM Plex fonts globally applied.

**Prerequisites:** Plans 1 and 2 must be complete. Branch: `feat/database-module-revamp`.

---

### Task 1: Build DatabaseAlertsTab Component

**Files:**
- Create: `apps/web/modules/databases/components/detail/AlertsTab.tsx`

Mirrors `apps/web/modules/servers/components/detail/AlertsTab.tsx` with database-specific threshold fields.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { Button } from '@/modules/shared/components/ui/Button';
import { Badge } from '@/modules/shared/components/ui/Badge';
import {
  listInfraDatabaseAlerts,
  getInfraDatabaseThresholds,
  setInfraDatabaseThresholds,
  clearInfraDatabaseThresholds,
  type DbThresholdValues,
} from '@/modules/databases/lib/infra-databases';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 12,
};

const sevColor = (s: string) => s === 'critical' ? 'red' : s === 'warning' ? 'amber' : 'blue';

function ThresholdField({
  label, value, unit, onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min={0}
          value={String(value)}
          onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          style={{
            width: 80, padding: '6px 8px', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{unit}</span>
      </div>
    </div>
  );
}

export function DatabaseAlertsTab({ databaseId }: { databaseId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('databases:edit');
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft] = useState<DbThresholdValues | null>(null);

  const alertsQ = useQuery({
    queryKey: ['db-alerts', databaseId, showResolved],
    queryFn: async () => listInfraDatabaseAlerts(await getToken(), databaseId, showResolved ? true : false),
    refetchInterval: 30_000,
  });

  const thresholdsQ = useQuery({
    queryKey: ['db-thresholds', databaseId],
    queryFn: async () => getInfraDatabaseThresholds(await getToken(), databaseId),
  });

  useEffect(() => {
    if (thresholdsQ.data) setDraft(thresholdsQ.data.data.effective);
  }, [thresholdsQ.data]);

  const saveMut = useMutation({
    mutationFn: async (body: DbThresholdValues) => setInfraDatabaseThresholds(await getToken(), databaseId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['db-thresholds', databaseId] }),
  });

  const clearMut = useMutation({
    mutationFn: async () => clearInfraDatabaseThresholds(await getToken(), databaseId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['db-thresholds', databaseId] }),
  });

  const alerts = alertsQ.data?.data ?? [];
  const hasOverride = thresholdsQ.data?.data.override != null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
      {/* Alert history */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={eyebrow}>Alert history</div>
          <button
            onClick={() => setShowResolved(v => !v)}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text2)',
            }}
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
        </div>
        {alertsQ.isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No alerts for this database.
          </div>
        ) : alerts.map((a, i) => (
          <div
            key={a.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i < alerts.length - 1 ? '1px solid var(--border)' : 'none',
              opacity: a.resolved ? 0.5 : 1,
            }}
          >
            <Badge label={a.severity} color={sevColor(a.severity) as 'red' | 'amber' | 'blue'} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{a.message}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {new Date(a.created_at).toLocaleString()}
            </span>
            {a.resolved
              ? <Badge label="resolved" color="gray" />
              : canEdit && (
                <a
                  href={`/api/alerts/${a.id}/resolve`}
                  onClick={async e => {
                    e.preventDefault();
                    const token = await getToken();
                    await fetch(`/api/alerts/${a.id}/resolve`, {
                      method: 'PATCH',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    void qc.invalidateQueries({ queryKey: ['db-alerts', databaseId] });
                  }}
                  style={{ textDecoration: 'none' }}
                >
                  <Button style={{ padding: '3px 10px', fontSize: 12 }}>Resolve</Button>
                </a>
              )
            }
          </div>
        ))}
      </div>

      {/* Threshold panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={eyebrow}>Alert thresholds</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 0, marginBottom: 16 }}>
          {hasOverride
            ? 'This database uses a custom override.'
            : 'Using workspace default. Saving creates a per-database override.'}
        </p>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ThresholdField
              label="Max connections"
              value={draft.connection_count_max}
              unit="conns"
              onChange={n => setDraft(d => d && { ...d, connection_count_max: n })}
            />
            <ThresholdField
              label="Max replication lag"
              value={draft.replication_lag_s_max}
              unit="s"
              onChange={n => setDraft(d => d && { ...d, replication_lag_s_max: n })}
            />
            <ThresholdField
              label="Max storage"
              value={draft.storage_gb_max}
              unit="GB"
              onChange={n => setDraft(d => d && { ...d, storage_gb_max: n })}
            />
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button
                  variant="primary"
                  onClick={() => draft && saveMut.mutate(draft)}
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending ? 'Saving…' : 'Save override'}
                </Button>
                {hasOverride && (
                  <Button onClick={() => clearMut.mutate()} disabled={clearMut.isPending}>
                    Reset
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/databases/components/detail/AlertsTab.tsx
git commit -m "feat(databases): add AlertsTab with alert history, resolve, and per-DB threshold overrides"
```

---

### Task 2: Build DatabaseActivitiesTab Component

**Files:**
- Create: `apps/web/modules/databases/components/detail/ActivitiesTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface ActivityEntry {
  id: string;
  user_id: string | null;
  type: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  user?: { name: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  database_added: 'Added this database',
  database_removed: 'Removed this database',
  database_settings_changed: 'Updated settings',
  database_connection_tested: 'Tested connection',
  infra_alert: 'Alert fired',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function avatarColor(userId: string): string {
  const colors = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)'];
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length] ?? 'var(--text3)';
}

export function DatabaseActivitiesTab({ databaseId }: { databaseId: string }) {
  const getToken = useApiToken();
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['db-activities', databaseId, page],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: ActivityEntry[]; error: null }>(
        `/api/activity?record_id=${databaseId}&limit=20&page=${page}`,
        { token },
      );
    },
    placeholderData: prev => prev,
  });

  const activities = data?.data ?? [];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4 }}>
        Activity
      </div>

      {isLoading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
      ) : activities.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No activity recorded yet.
        </div>
      ) : (
        <>
          {activities.map((activity, i) => {
            const label = ACTION_LABEL[activity.type] ?? activity.type;
            const initials = activity.user?.name
              ? activity.user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              : '?';
            const color = activity.user_id ? avatarColor(activity.user_id) : 'var(--text3)';

            return (
              <div
                key={activity.id}
                style={{
                  display: 'flex', gap: 12, padding: '12px 16px',
                  borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'flex-start',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>
                    {activity.user?.name && (
                      <span style={{ fontWeight: 600 }}>{activity.user.name} </span>
                    )}
                    {label}
                  </div>
                  {activity.body && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      {activity.body}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', marginTop: 2 }}>
                  {relativeTime(activity.created_at)}
                </span>
              </div>
            );
          })}

          {activities.length === 20 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isFetching}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '6px 16px', fontSize: 12, cursor: 'pointer', color: 'var(--text2)',
                }}
              >
                {isFetching ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/databases/components/detail/ActivitiesTab.tsx
git commit -m "feat(databases): add ActivitiesTab with avatar initials, relative timestamps, and load more"
```

---

### Task 3: Wire Alerts + Activities Tabs into Detail Page

**Files:**
- Modify: `apps/web/modules/databases/pages/[id]/page.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, add:
```typescript
import { DatabaseAlertsTab } from '@/modules/databases/components/detail/AlertsTab';
import { DatabaseActivitiesTab } from '@/modules/databases/components/detail/ActivitiesTab';
```

- [ ] **Step 2: Replace the placeholder tab content**

Find:
```typescript
{tab === 'alerts' && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Alerts tab — coming in Plan 3.</div>}
{tab === 'activities' && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Activities tab — coming in Plan 3.</div>}
```
Replace with:
```typescript
{tab === 'alerts' && <DatabaseAlertsTab databaseId={id} />}
{tab === 'activities' && <DatabaseActivitiesTab databaseId={id} />}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/databases/pages/[id]/page.tsx
git commit -m "feat(databases): wire AlertsTab and ActivitiesTab into detail page"
```

---

### Task 4: Add Query History Drawer to SQL Tab

**Files:**
- Modify: `apps/web/modules/databases/pages/[id]/page.tsx` — update `SqlTab` and `MongoQueryTab`

- [ ] **Step 1: Add history drawer to `SqlTab`**

Find the `SqlTab` function and replace its full content with:

```tsx
function SqlTab({ databaseId, isAdmin }: { databaseId: string; isAdmin: boolean }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [sql, setSql] = useState('select 1');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<InfraDatabaseSqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const historyQ = useQuery({
    queryKey: ['db-query-history', databaseId],
    queryFn: async () => listInfraDatabaseQueryHistory(await getToken(), databaseId),
    enabled: historyOpen,
  });
  const history = historyQ.data?.data ?? [];

  const clearHistoryMut = useMutation({
    mutationFn: async () => clearInfraDatabaseQueryHistory(await getToken(), databaseId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['db-query-history', databaseId] }),
  });

  const runMut = useMutation({
    mutationFn: async (confirmed: boolean) => runInfraDatabaseSql(await getToken(), databaseId, sql, confirmed),
    onSuccess: res => { setResult(res.data); setError(null); setConfirming(false); void qc.invalidateQueries({ queryKey: ['db-query-history', databaseId] }); },
    onError: err => { setError(err instanceof Error ? err.message : 'SQL failed'); setConfirming(false); },
  });

  function run() {
    if (isDml(sql) && isAdmin) { setConfirming(true); return; }
    runMut.mutate(false);
  }

  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

  return (
    <div>
      {/* History toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button
          onClick={() => setHistoryOpen(o => !o)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}
        >
          {historyOpen ? '▾' : '▸'} History {history.length > 0 ? `(${history.length})` : ''}
        </button>
        {historyOpen && history.length > 0 && (
          <button
            onClick={() => clearHistoryMut.mutate()}
            disabled={clearHistoryMut.isPending}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--red)' }}
          >
            Clear history
          </button>
        )}
      </div>

      {/* History drawer */}
      {historyOpen && (
        <div style={{
          maxHeight: 220, overflowY: 'auto', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          marginBottom: 12,
        }}>
          {historyQ.isLoading ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--text3)' }}>No queries run yet.</div>
          ) : history.map((entry, i) => (
            <div
              key={entry.id}
              onClick={() => setSql(entry.query_text)}
              style={{
                padding: '8px 12px', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <code style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.query_text.slice(0, 80)}{entry.query_text.length > 80 ? '…' : ''}
              </code>
              <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                {new Date(entry.executed_at).toLocaleTimeString()}
              </span>
              {entry.row_count !== null && (
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                  {entry.row_count} rows
                </span>
              )}
            </div>
          ))}
        </div>
      )}

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
```

- [ ] **Step 2: Add missing imports in `[id]/page.tsx`**

At the top of the file, make sure these are imported:
```typescript
import {
  listInfraDatabaseQueryHistory,
  clearInfraDatabaseQueryHistory,
} from '@/modules/databases/lib/infra-databases';
```

- [ ] **Step 3: Add history drawer to `MongoQueryTab`**

Apply the same history pattern to `MongoQueryTab`. Add the history state and drawer above the `Textarea`:

```tsx
const historyQ = useQuery({
  queryKey: ['db-query-history', databaseId],
  queryFn: async () => listInfraDatabaseQueryHistory(await getToken(), databaseId),
  enabled: historyOpen,
});
const [historyOpen, setHistoryOpen] = useState(false);
const history = historyQ.data?.data ?? [];
const clearHistoryMut = useMutation({
  mutationFn: async () => clearInfraDatabaseQueryHistory(await getToken(), databaseId),
  onSuccess: () => void qc.invalidateQueries({ queryKey: ['db-query-history', databaseId] }),
});
```

Then add the same history drawer JSX above the `Textarea` in `MongoQueryTab`, with `entry.query_text` setting `setQuery(entry.query_text)` on click.

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/databases/pages/[id]/page.tsx
git commit -m "feat(databases): add query history drawer to SQL and Mongo query tabs"
```

---

### Task 5: Add Connection String to Overview Tab

**Files:**
- Modify: `apps/web/modules/databases/pages/[id]/page.tsx` — update `OverviewTab`

- [ ] **Step 1: Add connection string state to `OverviewTab`**

`OverviewTab` currently receives only `{ database }`. It needs the current user role too. Update the function signature:

```typescript
function OverviewTab({ database, isAdmin }: { database: InfraDatabase; isAdmin: boolean }) {
```

Update the call site (in `DatabaseDetailPage`):
```typescript
{tab === 'overview' && <OverviewTab database={database} isAdmin={isAdmin} />}
```

- [ ] **Step 2: Add connection string state + fetch logic inside `OverviewTab`**

At the top of `OverviewTab`, add:

```typescript
const getToken = useApiToken();
const [revealed, setRevealed] = useState(false);
const [connStr, setConnStr] = useState<string | null>(null);
const [revealTimer, setRevealTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

async function fetchConnStr(reveal: boolean) {
  const token = await getToken();
  const res = await fetch(`/api/databases/${database.id}/connection-string${reveal ? '?reveal=true' : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as { data: { connection_string: string } };
  setConnStr(json.data.connection_string);
}

async function handleReveal() {
  await fetchConnStr(true);
  setRevealed(true);
  if (revealTimer) clearTimeout(revealTimer);
  const t = setTimeout(() => { setRevealed(false); void fetchConnStr(false); }, 10_000);
  setRevealTimer(t);
}

// Load masked string on mount
React.useEffect(() => {
  void fetchConnStr(false);
}, [database.id]);
```

- [ ] **Step 3: Add connection string row to the Details table**

In the Details table map inside `OverviewTab`, add after the `['Last checked', ...]` entry:

```typescript
['Connection string', null], // handled separately below
```

Actually, render it as a separate row outside the map (easier to control JSX):

Find the closing `</div>` of the Details card and insert before it:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Connection string</span>
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <code style={{
      fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)',
      maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {connStr ?? '…'}
    </code>
    {/* Copy button */}
    <button
      title="Copy"
      onClick={() => connStr && navigator.clipboard.writeText(connStr)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '2px 4px' }}
    >
      ⎘
    </button>
    {/* Reveal button — admin only */}
    {isAdmin && (
      <button
        title={revealed ? 'Re-masks in 10s' : 'Reveal password'}
        onClick={handleReveal}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: revealed ? 'var(--amber)' : 'var(--text3)', fontSize: 14, padding: '2px 4px',
        }}
      >
        {revealed ? '🔓' : '🔒'}
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/databases/pages/[id]/page.tsx
git commit -m "feat(databases): add connection string row to Overview tab with copy and admin reveal"
```

---

### Task 6: Full Build Verification

- [ ] **Step 1: Run TypeScript check across all apps**

```bash
cd apps/api && pnpm tsc --noEmit
cd apps/worker && pnpm tsc --noEmit
cd apps/web && pnpm tsc --noEmit
cd packages/db && pnpm tsc --noEmit
cd packages/modules && pnpm tsc --noEmit
```
Expected: zero errors across all five.

- [ ] **Step 2: Run the web dev server and smoke-test**

```bash
cd apps/web && pnpm dev
```

Navigate to `/databases`. Verify:
- Table/card toggle works and persists on refresh (check `localStorage.getItem('databases-view-mode')`)
- Search filters by name/host
- Engine chips filter correctly
- Status filter works
- Right-click menu shows all 8+ items
- "Test connection" item shows a result
- "View alerts" navigates to the alerts tab

Navigate to `/databases/:id`. Verify:
- New header shows engine badge, IBM Plex Serif name, pulse dot, mono host
- Breadcrumb "← Databases" goes back to the list
- Tab bar has Overview · Tables · SQL · Alerts · Activities · Settings
- `?tab=alerts` URL param opens the Alerts tab directly
- Overview metrics count up on load
- Tables tab shows sidebar + data panel layout
- SQL tab shows history drawer toggle; running a query adds to history
- Alerts tab loads (empty state or real alerts)
- Activities tab loads (empty state or real entries)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: database module revamp complete — all three plans implemented"
```
