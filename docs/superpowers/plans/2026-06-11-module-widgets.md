# Module Dashboard Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three built-in dashboard widgets (Contacts, Pipeline, Servers) that appear in the "Add Widget" panel and render live data on any dashboard.

**Architecture:** Each widget is a self-contained `'use client'` component that fetches its own data via `useQuery` + existing module lib functions. A new `register-module-widgets.ts` file registers all three in the `dashboard-registry` and is side-effect imported in `Providers.tsx`. Shared loading/error/stat UI lives in `WidgetHelpers.tsx`.

**Tech Stack:** React 18, TanStack Query v5, Next.js 14 App Router, TypeScript strict, inline CSS with design tokens from `CLAUDE.md`.

---

## File Map

| File | Change |
|---|---|
| `apps/web/modules/shared/components/ui/WidgetHelpers.tsx` | **New** — WidgetSkeleton, WidgetError, Stat, EmptyState helpers |
| `apps/web/modules/contacts/components/ContactsWidget.tsx` | **New** — contacts widget component |
| `apps/web/modules/pipeline/components/PipelineWidget.tsx` | **New** — pipeline records widget component |
| `apps/web/modules/servers/components/ServersWidget.tsx` | **New** — servers status widget component |
| `apps/web/modules/shared/lib/register-module-widgets.ts` | **New** — registers all three widgets in the dashboard registry |
| `apps/web/modules/shared/components/Providers.tsx` | **Modify** — import `register-module-widgets` as side-effect |

---

## Task 1: Shared widget helper components

**Files:**
- Create: `apps/web/modules/shared/components/ui/WidgetHelpers.tsx`

These four helpers are used by all three widgets. Create them first so subsequent tasks compile.

- [ ] **Step 1: Create WidgetHelpers.tsx**

```tsx
// apps/web/modules/shared/components/ui/WidgetHelpers.tsx
import Link from 'next/link';

export function WidgetSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ height: 36, background: 'var(--surface2)', borderRadius: 6 }} />
      <div style={{ height: 120, background: 'var(--surface2)', borderRadius: 6, opacity: 0.6 }} />
    </div>
  );
}

export function WidgetError({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
      <span style={{ fontSize: 13, color: 'var(--text3)' }}>Failed to load</span>
      <button
        onClick={onRetry}
        style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}
      >
        Retry
      </button>
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'var(--font-display, "Instrument Serif", serif)' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

export function EmptyState({ href, label }: { href: string; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Link
        href={href}
        style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none', padding: '8px 16px', border: '1px dashed var(--border)', borderRadius: 8 }}
      >
        + {label}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```powershell
cd D:\Projects\VencoreRepos\Vencore
pnpm --filter @vencore/web exec tsc --noEmit
```

Expected: no new errors (this file has no complex types).

- [ ] **Step 3: Commit**

```powershell
cd D:\Projects\VencoreRepos\Vencore
rtk git add apps/web/modules/shared/components/ui/WidgetHelpers.tsx
rtk git commit -m "feat(widgets): add shared widget helper components"
```

---

## Task 2: ContactsWidget

**Files:**
- Create: `apps/web/modules/contacts/components/ContactsWidget.tsx`

Displays total contact count with prospect/customer breakdown, plus a list of 5 most recent contacts.

**Key facts:**
- `listContacts(token, params?)` → `{ data: Contact[], total: number, page, per_page }`
- `Contact.status` is `'prospect' | 'customer' | 'cold' | 'churned'`
- No individual contact detail page exists — title links to `/contacts`
- Module ID is `'contacts'` (checked against `useModules().isEnabled()`)

- [ ] **Step 1: Create ContactsWidget.tsx**

```tsx
// apps/web/modules/contacts/components/ContactsWidget.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@/modules/contacts/lib/contacts';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, Stat, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { Contact } from '@vencore/types';

export function ContactsWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'contacts'],
    queryFn: async () => listContacts(await getToken(), { per_page: '5' }),
    staleTime: 60_000,
    enabled: isEnabled('contacts'),
  });

  if (!isEnabled('contacts')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;
  const prospects = contacts.filter(c => c.status === 'prospect').length;
  const customers = contacts.filter(c => c.status === 'customer').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Total" value={total} />
        <Stat label="Prospects" value={prospects} color="var(--blue)" />
        <Stat label="Customers" value={customers} color="var(--green)" />
      </div>

      {contacts.length === 0 ? (
        <EmptyState href="/contacts" label="Add your first contact" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {contacts.map((c: Contact, i: number) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: i < contacts.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--text)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
              </div>
              <Badge label={c.status} color={statusColor[c.status] ?? 'gray'} />
            </div>
          ))}
        </div>
      )}

      <Link
        href="/contacts"
        style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none', marginTop: 'auto' }}
      >
        All contacts →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```powershell
cd D:\Projects\VencoreRepos\Vencore
pnpm --filter @vencore/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
cd D:\Projects\VencoreRepos\Vencore
rtk git add apps/web/modules/contacts/components/ContactsWidget.tsx
rtk git commit -m "feat(widgets): add ContactsWidget"
```

---

## Task 3: PipelineWidget

**Files:**
- Create: `apps/web/modules/pipeline/components/PipelineWidget.tsx`

Shows the first pipeline by name, lists 5 most recent records with their stage badge. Row click navigates to that pipeline.

**Key facts:**
- `listPipelines(token)` → `{ data: PipelineWithDetails[] }` where `PipelineWithDetails` includes `stages: PipelineStage[]`
- `listRecords(token, { pipeline_id, per_page })` → `{ data: PipelineRecordWithValues[], page, per_page }` (no total field)
- `PipelineRecord.stage_id` maps to a `PipelineStage` in the pipeline's `stages` array
- Row click → `router.push('/pipeline/' + record.pipeline_id)`
- Module ID is `'pipelines'`

- [ ] **Step 1: Create PipelineWidget.tsx**

```tsx
// apps/web/modules/pipeline/components/PipelineWidget.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listPipelines } from '@/modules/pipeline/lib/pipelines';
import { listRecords } from '@/modules/pipeline/lib/records';
import { Badge } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { PipelineWithDetails, PipelineRecordWithValues } from '@vencore/types';

export function PipelineWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data: pipelinesData, isLoading: pipelinesLoading } = useQuery({
    queryKey: ['widget', 'pipelines'],
    queryFn: async () => listPipelines(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('pipelines'),
  });

  const firstPipeline: PipelineWithDetails | undefined = pipelinesData?.data?.[0];

  const { data: recordsData, isLoading: recordsLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'records', firstPipeline?.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: firstPipeline!.id, per_page: 5 }),
    staleTime: 60_000,
    enabled: !!firstPipeline && isEnabled('pipelines'),
  });

  if (!isEnabled('pipelines')) return null;
  if (pipelinesLoading || recordsLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  if (!firstPipeline) {
    return <EmptyState href="/pipeline" label="Create your first pipeline" />;
  }

  const stageMap = new Map(firstPipeline.stages.map(s => [s.id, s]));
  const records: PipelineRecordWithValues[] = recordsData?.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 22, fontWeight: 700, color: 'var(--text)',
          fontFamily: 'var(--font-display, "Instrument Serif", serif)',
        }}>
          {firstPipeline.name}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          {records.length} record{records.length !== 1 ? 's' : ''}
        </span>
      </div>

      {records.length === 0 ? (
        <EmptyState href={`/pipeline/${firstPipeline.id}`} label="Add your first record" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {records.map((r: PipelineRecordWithValues, i: number) => {
            const stage = stageMap.get(r.stage_id);
            return (
              <div
                key={r.id}
                onClick={() => router.push(`/pipeline/${r.pipeline_id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 4px',
                  borderBottom: i < records.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                  {r.name}
                </span>
                {stage && <Badge label={stage.name} color="gray" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```powershell
cd D:\Projects\VencoreRepos\Vencore
pnpm --filter @vencore/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
cd D:\Projects\VencoreRepos\Vencore
rtk git add apps/web/modules/pipeline/components/PipelineWidget.tsx
rtk git commit -m "feat(widgets): add PipelineWidget"
```

---

## Task 4: ServersWidget

**Files:**
- Create: `apps/web/modules/servers/components/ServersWidget.tsx`

Shows online/degraded/offline counts, lists up to 5 servers with CPU/memory metrics. Row click navigates to server detail.

**Key facts:**
- `listServers(token)` → `{ data: Server[], total: number, error: null }`
- `Server.status` is `'online' | 'degraded' | 'offline' | 'stopped'`
- `Server.cpu_pct` and `Server.mem_pct` are `number | null`
- `statusColor['online']` = `'green'`, `statusColor['degraded']` = `'amber'`, `statusColor['offline']` = `'red'`, `statusColor['stopped']` = `'gray'` (already defined in Badge.tsx)
- Row click → `router.push('/servers/' + server.id)`
- Module ID is `'servers'`

- [ ] **Step 1: Create ServersWidget.tsx**

```tsx
// apps/web/modules/servers/components/ServersWidget.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/servers/lib/servers';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, Stat, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { Server } from '@vencore/types';

export function ServersWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'servers'],
    queryFn: async () => listServers(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const allServers: Server[] = data?.data ?? [];
  const servers = allServers.slice(0, 5);
  const online = allServers.filter(s => s.status === 'online').length;
  const degraded = allServers.filter(s => s.status === 'degraded').length;
  const offline = allServers.filter(s => s.status === 'offline' || s.status === 'stopped').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Online" value={online} color="var(--green)" />
        <Stat label="Degraded" value={degraded} color="var(--amber)" />
        <Stat label="Offline" value={offline} color="var(--red)" />
      </div>

      {servers.length === 0 ? (
        <EmptyState href="/servers" label="Add your first server" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {servers.map((s: Server, i: number) => (
            <div
              key={s.id}
              onClick={() => router.push(`/servers/${s.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 4px',
                borderBottom: i < servers.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                borderRadius: 4,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {s.cpu_pct !== null && (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    CPU {Math.round(s.cpu_pct)}%
                  </span>
                )}
                {s.mem_pct !== null && (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    MEM {Math.round(s.mem_pct)}%
                  </span>
                )}
                <Badge label={s.status} color={statusColor[s.status] ?? 'gray'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```powershell
cd D:\Projects\VencoreRepos\Vencore
pnpm --filter @vencore/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
cd D:\Projects\VencoreRepos\Vencore
rtk git add apps/web/modules/servers/components/ServersWidget.tsx
rtk git commit -m "feat(widgets): add ServersWidget"
```

---

## Task 5: Registration and wiring

**Files:**
- Create: `apps/web/modules/shared/lib/register-module-widgets.ts`
- Modify: `apps/web/modules/shared/components/Providers.tsx` (add one import line)

Calls `registerDashboardWidget` for each of the three widgets. Imported once as a side-effect in `Providers.tsx` so the registry is populated before any dashboard renders.

**Key facts:**
- `registerDashboardWidget(def: DashboardWidgetDef)` is from `@/modules/shared/lib/dashboard-registry`
- `DashboardWidgetDef` shape: `{ id, label, description?, defaultW, defaultH, minW?, minH?, permission?, component }`
- Widget IDs: `'core:contacts'`, `'core:pipeline'`, `'core:servers'`
- Default sizes from spec: contacts=4×3, pipeline=6×3, servers=4×3

- [ ] **Step 1: Create register-module-widgets.ts**

```ts
// apps/web/modules/shared/lib/register-module-widgets.ts
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import { ContactsWidget } from '@/modules/contacts/components/ContactsWidget';
import { PipelineWidget } from '@/modules/pipeline/components/PipelineWidget';
import { ServersWidget } from '@/modules/servers/components/ServersWidget';

registerDashboardWidget({
  id: 'core:contacts',
  label: 'Contacts',
  description: 'Recent contacts and status overview',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  component: ContactsWidget,
});

registerDashboardWidget({
  id: 'core:pipeline',
  label: 'Pipeline',
  description: 'Recent records across your pipeline',
  defaultW: 6,
  defaultH: 3,
  minW: 4,
  minH: 3,
  component: PipelineWidget,
});

registerDashboardWidget({
  id: 'core:servers',
  label: 'Servers',
  description: 'Server status and resource usage',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  component: ServersWidget,
});
```

- [ ] **Step 2: Wire into Providers.tsx**

Open `apps/web/modules/shared/components/Providers.tsx`. Add one import at the top (after existing imports):

```tsx
// apps/web/modules/shared/components/Providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { useState } from 'react';
import { store } from '@/store';
import { PluginRuntimeProvider } from '@/modules/shared/contexts/PluginRuntimeContext';
import '@/modules/shared/lib/register-module-widgets'; // side-effect: populates dashboard registry

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }));

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <PluginRuntimeProvider>
          {children}
        </PluginRuntimeProvider>
      </QueryClientProvider>
    </Provider>
  );
}
```

- [ ] **Step 3: Type-check all changes**

```powershell
cd D:\Projects\VencoreRepos\Vencore
pnpm --filter @vencore/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
cd D:\Projects\VencoreRepos\Vencore
rtk git add apps/web/modules/shared/lib/register-module-widgets.ts apps/web/modules/shared/components/Providers.tsx
rtk git commit -m "feat(widgets): register module widgets in dashboard registry"
```

---

## Task 6: Manual verification

No automated tests — these are thin presentational components over already-tested APIs.

- [ ] **Step 1: Start dev server**

```powershell
cd D:\Projects\VencoreRepos\Vencore
pnpm --filter @vencore/web dev
```

- [ ] **Step 2: Verify widgets appear in Add Widget panel**

1. Navigate to any dashboard (e.g. `/dashboard/<id>`)
2. Click "Edit" to enter edit mode
3. Click "Add Widget"
4. Confirm "Contacts", "Pipeline", and "Servers" appear in the list

- [ ] **Step 3: Verify ContactsWidget**

1. Add the Contacts widget
2. Exit edit mode
3. Confirm stat row shows numeric counts (total, prospects, customers)
4. Confirm list shows up to 5 contacts with names and status badges
5. Confirm "All contacts →" link navigates to `/contacts`
6. If contacts module is disabled (Settings → Modules), confirm widget is absent from the panel

- [ ] **Step 4: Verify PipelineWidget**

1. Add the Pipeline widget
2. Confirm pipeline name and record count appear in the stat header
3. Confirm list shows up to 5 records with stage badges
4. Click a record row — confirm navigation to `/pipeline/<pipelineId>`
5. If pipelines module is disabled, confirm widget is absent from panel

- [ ] **Step 5: Verify ServersWidget**

1. Add the Servers widget
2. Confirm online/degraded/offline counts match actual server statuses
3. Confirm CPU% and MEM% values appear for servers that have sent metrics
4. Click a server row — confirm navigation to `/servers/<id>`
5. If servers module is disabled, confirm widget is absent from panel

- [ ] **Step 6: Verify empty states**

Test each widget with no data:
- Contacts widget with no contacts → shows "+ Add your first contact" link
- Pipeline widget with no pipelines → shows "+ Create your first pipeline" link
- Servers widget with no servers → shows "+ Add your first server" link
