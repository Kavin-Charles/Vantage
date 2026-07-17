# Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-widget filter definitions, a widget icon system, redesign the marketplace modal sidebar to show modules + plugins, fix modal collapse, and fix the right-side grid padding bug.

**Architecture:** All changes are additive. New `filterDefs: WidgetFilterDef[]` on `DashboardWidgetDef` gives each widget its own config controls rendered by `WidgetConfigPopover` using React Query for dynamic option fetching. The marketplace modal gains a two-level sidebar (categories + module sub-rows + Plugins section). `containerPadding={[0,0]}` on `ResponsiveGridLayout` removes the dead zone at the right edge. No DB migrations or API changes required.

**Tech Stack:** Next.js App Router, TypeScript strict, React Query v5, react-grid-layout, `@vencore/api-client` (`apiFetch`, `listContacts`, `listServers`), Redux token via `useApiToken()`.

## Global Constraints

- TypeScript strict — no `any`, no `console.log`
- All components `'use client'`
- All colors via CSS variables — no hardcoded hex outside `chart-colors.ts`
- Existing widget IDs must not change
- `pnpm tsc --noEmit -p apps/web/tsconfig.json` must pass after each task
- All changes are backwards-compatible — widgets without `filterDefs` or `module` continue to work unchanged

---

## File Map

| File | Change |
|---|---|
| `apps/web/modules/shared/lib/dashboard-registry.ts` | Add `iconEl`, `FilterOption`, `WidgetFilterDef`, `ModuleDef`, `CATEGORY_MODULES`, `filterDefs?`, `module?` |
| `apps/web/modules/dashboard/components/WidgetConfigPopover.tsx` | Add `filterDefs?` prop, `FilterDefControl` sub-component with React Query |
| `apps/web/modules/dashboard/components/WidgetCard.tsx` | Update `hasFilters` check, pass `filterDefs` to popover |
| `apps/web/modules/dashboard/components/WidgetMarketplaceModal.tsx` | Two-level sidebar, fixed height, `iconEl` rendering |
| `apps/web/modules/dashboard/components/DashboardGrid.tsx` | Add `containerPadding={[0,0]}` |
| `apps/web/modules/shared/lib/register-module-widgets.ts` | Add `module` to 5 core registrations |
| 6× contacts widgets | Add `module: 'contacts'`, `filterDefs` for status/owner |
| 5× pipeline widgets | Add `module: 'pipeline'`, `filterDefs` for owner/stage |
| 4× companies widgets | Add `module: 'companies'` |
| 6× tasks widgets | Add `module: 'tasks'`, `filterDefs` for owner |
| 5× projects widgets | Add `module: 'projects'` |
| 5× servers widgets + ServerAlertsWidget | Add `module: 'servers'`, `filterDefs` for region |
| 4× databases widgets | Add `module: 'databases'`, `filterDefs` for engine |
| 4× websites widgets | Add `module: 'websites'` |
| 4× analytics widgets | Add `module: 'analytics'` |
| 3× alerts widgets | Add `module: 'alerts'`, `filterDefs` for resource_type |
| 3× activity widgets | Add `module: 'activity'`, `filterDefs` for type/user |

---

### Task 1: Extend Registry Types

**Files:**
- Modify: `apps/web/modules/shared/lib/dashboard-registry.ts`

**Produces:**
- `FilterOption { label: string; value: string }`
- `WidgetFilterDef { key, label, type, options?, fetchOptions?, placeholder?, multi? }`
- `ModuleDef { id, label }`
- `CATEGORY_MODULES: Record<WidgetCategory, ModuleDef[]>`
- `DashboardWidgetDef.iconEl?: React.ReactNode`
- `DashboardWidgetDef.filterDefs?: WidgetFilterDef[]`
- `DashboardWidgetDef.module?: string`

- [ ] **Step 1: Replace `dashboard-registry.ts` with the extended version**

Full file content:

```ts
import type React from 'react';

export type WidgetCategory = 'sales' | 'projects' | 'infra' | 'communication' | 'insights';
export type WidgetSize = 'small' | 'medium' | 'large' | 'wide' | 'full';
export type WidgetFilterKey =
  | 'timeRange'
  | 'limit'
  | 'compactMode'
  | 'chartType'
  | 'refreshInterval'
  | 'owner'
  | 'status';

export const CATEGORY_ORDER: WidgetCategory[] = [
  'sales',
  'projects',
  'infra',
  'communication',
  'insights',
];

export interface WidgetConfig {
  timeRange?: '1d' | '7d' | '30d';
  limit?: number;
  compactMode?: boolean;
  chartType?: 'line' | 'bar' | 'pie' | 'area';
  refreshInterval?: number;
  filters?: Record<string, string>;
}

// --- New types ---

export interface FilterOption {
  label: string;
  value: string;
}

export interface WidgetFilterDef {
  key: string;
  label: string;
  type: 'pills' | 'select';
  options?: FilterOption[];
  fetchOptions?: (token: string) => Promise<FilterOption[]>;
  placeholder?: string;
  multi?: boolean;
}

export interface ModuleDef {
  id: string;
  label: string;
}

export const CATEGORY_MODULES: Record<WidgetCategory, ModuleDef[]> = {
  sales: [
    { id: 'contacts', label: 'Contacts' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'companies', label: 'Companies' },
  ],
  projects: [
    { id: 'tasks', label: 'Tasks' },
    { id: 'projects', label: 'Projects' },
  ],
  infra: [
    { id: 'servers', label: 'Servers' },
    { id: 'databases', label: 'Databases' },
    { id: 'websites', label: 'Websites' },
  ],
  communication: [],
  insights: [
    { id: 'analytics', label: 'Analytics' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'activity', label: 'Activity' },
  ],
};

// --- End new types ---

export interface DashboardWidgetDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  iconEl?: React.ReactNode;       // NEW: takes precedence over icon when present
  category: WidgetCategory;
  module?: string;                // NEW: e.g. 'contacts', 'pipeline', 'servers'
  sizeOptions: WidgetSize[];
  defaultSize: WidgetSize;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  permission?: string;
  supportedFilters?: WidgetFilterKey[];
  filterDefs?: WidgetFilterDef[]; // NEW: widget-specific dynamic/static filter controls
  defaultConfig?: WidgetConfig;
  component: React.ComponentType<{ config: WidgetConfig }>;
}

const _registry: DashboardWidgetDef[] = [];

export function registerDashboardWidget(def: DashboardWidgetDef): void {
  if (_registry.some(d => d.id === def.id)) return;
  _registry.push(def);
}

export function getDashboardWidgets(): DashboardWidgetDef[] {
  return _registry;
}

export function getDashboardWidgetById(id: string): DashboardWidgetDef | undefined {
  return _registry.find(d => d.id === id);
}

export function getDashboardWidgetsByCategory(category: WidgetCategory): DashboardWidgetDef[] {
  return _registry.filter(d => d.category === category);
}
```

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors (types are additive — no existing code breaks).

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/lib/dashboard-registry.ts
git commit -m "feat(dashboard): extend registry with iconEl, filterDefs, module, ModuleDef, CATEGORY_MODULES"
```

---

### Task 2: WidgetConfigPopover — filterDefs rendering

**Files:**
- Modify: `apps/web/modules/dashboard/components/WidgetConfigPopover.tsx`

**Consumes:** `WidgetFilterDef`, `FilterOption` from Task 1; `useApiToken()` at `@/modules/shared/lib/useApiToken`; `useQuery` from `@tanstack/react-query`.

**Produces:** `WidgetConfigPopover` now accepts `filterDefs?: WidgetFilterDef[]` and renders a `FilterDefControl` section below existing generic controls.

- [ ] **Step 1: Replace `WidgetConfigPopover.tsx` with the updated version**

```tsx
'use client';

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import type { WidgetConfig, WidgetFilterKey, WidgetFilterDef, FilterOption } from '@/modules/shared/lib/dashboard-registry';

interface Props {
  supportedFilters: WidgetFilterKey[];
  filterDefs?: WidgetFilterDef[];
  config: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
  onRemove?: () => void;
  onClose?: () => void;
}

export function WidgetConfigPopover({ supportedFilters, filterDefs, config, onConfigChange, onRemove, onClose }: Props) {
  const has = (f: WidgetFilterKey) => supportedFilters.includes(f);
  const getToken = useApiToken();

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute', top: 36, right: 8, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 4px 12px var(--border)',
          width: 220, padding: '8px 0', fontSize: 13,
        }}
        onClick={e => e.stopPropagation()}
      >
        {has('timeRange') && (
          <Section label="Time Range">
            <PillGroup
              options={[
                { label: 'Today', value: '1d' },
                { label: '7 days', value: '7d' },
                { label: '30 days', value: '30d' },
              ]}
              value={config.timeRange ?? '7d'}
              onChange={v => onConfigChange({ ...config, timeRange: v as WidgetConfig['timeRange'] })}
            />
          </Section>
        )}
        {has('limit') && (
          <Section label="Show">
            <PillGroup
              options={[
                { label: '5', value: '5' },
                { label: '10', value: '10' },
                { label: '25', value: '25' },
              ]}
              value={String(config.limit ?? 10)}
              onChange={v => onConfigChange({ ...config, limit: Number(v) })}
            />
          </Section>
        )}
        {has('chartType') && (
          <Section label="Chart Type">
            <PillGroup
              options={[
                { label: 'Line', value: 'line' },
                { label: 'Bar', value: 'bar' },
                { label: 'Area', value: 'area' },
              ]}
              value={config.chartType ?? 'line'}
              onChange={v => onConfigChange({ ...config, chartType: v as WidgetConfig['chartType'] })}
            />
          </Section>
        )}
        {has('refreshInterval') && (
          <Section label="Refresh">
            <PillGroup
              options={[
                { label: 'Off', value: '0' },
                { label: '30s', value: '30000' },
                { label: '1m', value: '60000' },
                { label: '5m', value: '300000' },
              ]}
              value={String(config.refreshInterval ?? 0)}
              onChange={v => onConfigChange({ ...config, refreshInterval: Number(v) })}
            />
          </Section>
        )}
        {has('compactMode') && (
          <Section label="Compact">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.compactMode ?? false}
                onChange={e => onConfigChange({ ...config, compactMode: e.target.checked })}
              />
              Compact mode
            </label>
          </Section>
        )}

        {/* Widget-specific filterDefs */}
        {filterDefs?.map(def => (
          <FilterDefControl
            key={def.key}
            def={def}
            value={config.filters?.[def.key] ?? ''}
            getToken={getToken}
            onChange={v => {
              const filters = { ...(config.filters ?? {}), [def.key]: v };
              onConfigChange({ ...config, filters });
            }}
          />
        ))}

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
          <button
            onClick={onRemove}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 14px', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--red)', fontSize: 13,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--red-bg)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            Remove widget
          </button>
        </div>
      </div>
    </>
  );
}

function FilterDefControl({
  def,
  value,
  getToken,
  onChange,
}: {
  def: WidgetFilterDef;
  value: string;
  getToken: () => Promise<string>;
  onChange: (v: string) => void;
}) {
  const { data: dynamicOptions } = useQuery<FilterOption[]>({
    queryKey: ['widget-filter-options', def.key],
    queryFn: async () => {
      const token = await getToken();
      return def.fetchOptions!(token);
    },
    staleTime: 300_000,
    enabled: !!def.fetchOptions,
  });

  const options = def.fetchOptions ? (dynamicOptions ?? []) : (def.options ?? []);

  if (def.type === 'pills') {
    const allOption: FilterOption = { label: 'All', value: '' };
    return (
      <Section label={def.label}>
        <PillGroup
          options={[allOption, ...options]}
          value={value}
          onChange={onChange}
        />
      </Section>
    );
  }

  return (
    <Section label={def.label}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '4px 8px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--surface2)',
          fontSize: 12, color: 'var(--text)', fontFamily: 'DM Sans, sans-serif',
          cursor: 'pointer',
        }}
      >
        <option value="">{def.placeholder ?? `All ${def.label}`}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Section>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 14px 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function PillGroup({ options, value, onChange }: {
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: value === o.value ? 'var(--text)' : 'transparent',
            color: value === o.value ? 'var(--surface)' : 'var(--text2)',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/dashboard/components/WidgetConfigPopover.tsx
git commit -m "feat(dashboard): WidgetConfigPopover — add filterDefs rendering with FilterDefControl + React Query"
```

---

### Task 3: WidgetCard — propagate filterDefs

**Files:**
- Modify: `apps/web/modules/dashboard/components/WidgetCard.tsx`

**Consumes:** `WidgetFilterDef` from Task 1; updated `WidgetConfigPopover` from Task 2.

- [ ] **Step 1: Update the `hasFilters` check and pass `filterDefs` to `WidgetConfigPopover`**

Change line 40 from:
```ts
const hasFilters = (def?.supportedFilters?.length ?? 0) > 0;
```
to:
```ts
const hasFilters = (def?.supportedFilters?.length ?? 0) > 0 || (def?.filterDefs?.length ?? 0) > 0;
```

Change the `WidgetConfigPopover` render at line 127 from:
```tsx
{configOpen && (
  <WidgetConfigPopover
    supportedFilters={def?.supportedFilters ?? []}
    config={config}
    onConfigChange={cfg => { onConfigChange?.(cfg); }}
    onRemove={() => { setConfigOpen(false); onRemove?.(widgetId); }}
    onClose={() => setConfigOpen(false)}
  />
)}
```
to:
```tsx
{configOpen && (
  <WidgetConfigPopover
    supportedFilters={def?.supportedFilters ?? []}
    filterDefs={def?.filterDefs}
    config={config}
    onConfigChange={cfg => { onConfigChange?.(cfg); }}
    onRemove={() => { setConfigOpen(false); onRemove?.(widgetId); }}
    onClose={() => setConfigOpen(false)}
  />
)}
```

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/dashboard/components/WidgetCard.tsx
git commit -m "feat(dashboard): WidgetCard — propagate filterDefs to WidgetConfigPopover, update hasFilters check"
```

---

### Task 4: WidgetMarketplaceModal — sidebar redesign + fixed height

**Files:**
- Modify: `apps/web/modules/dashboard/components/WidgetMarketplaceModal.tsx`

**Consumes:** `CATEGORY_MODULES`, `ModuleDef`, `DashboardWidgetDef.module`, `DashboardWidgetDef.iconEl` from Task 1; `Icon` from `@/modules/shared/components/ui/Icon`.

- [ ] **Step 1: Replace `WidgetMarketplaceModal.tsx` with the redesigned version**

```tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  getDashboardWidgets,
  CATEGORY_MODULES,
  CATEGORY_ORDER,
  type DashboardWidgetDef,
  type WidgetCategory,
} from '@/modules/shared/lib/dashboard-registry';
import { Icon } from '@/modules/shared/components/ui/Icon';

const CATEGORY_LABELS: Record<WidgetCategory | 'all', string> = {
  all: 'All',
  sales: 'Sales',
  projects: 'Projects',
  infra: 'Infrastructure',
  communication: 'Communication',
  insights: 'Insights',
};

type SidebarFilter =
  | { type: 'all' }
  | { type: 'category'; category: WidgetCategory }
  | { type: 'module'; category: WidgetCategory; module: string }
  | { type: 'plugins' };

interface Props {
  open: boolean;
  onClose: () => void;
  currentWidgetIds: Set<string>;
  pluginWidgets: Map<string, DashboardWidgetDef>;
  onAdd: (def: DashboardWidgetDef) => void;
}

export function WidgetMarketplaceModal({ open, onClose, currentWidgetIds, pluginWidgets, onAdd }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SidebarFilter>({ type: 'all' });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setFilter({ type: 'all' });
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const allWidgets = [...getDashboardWidgets(), ...[...pluginWidgets.values()]];

  const q = search.toLowerCase();
  const filtered = allWidgets.filter(def => {
    const matchesSearch = !q || def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q);
    if (filter.type === 'all') return matchesSearch;
    if (filter.type === 'category') return matchesSearch && def.category === filter.category;
    if (filter.type === 'module') return matchesSearch && def.module === filter.module;
    if (filter.type === 'plugins') return matchesSearch && pluginWidgets.has(def.id);
    return false;
  });

  const isFilterActive = (f: SidebarFilter): boolean => {
    if (filter.type !== f.type) return false;
    if (f.type === 'category' && filter.type === 'category') return filter.category === f.category;
    if (f.type === 'module' && filter.type === 'module') return filter.module === f.module;
    return filter.type === f.type;
  };

  const sidebarBtnStyle = (active: boolean, indent = false): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left',
    padding: indent ? '5px 16px 5px 28px' : '7px 16px',
    background: active ? 'var(--surface2)' : 'none',
    border: 'none', cursor: 'pointer', fontSize: indent ? 12 : 13,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--text)' : indent ? 'var(--text2)' : 'var(--text2)',
    borderLeft: active ? '2px solid var(--text)' : '2px solid transparent',
  });

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 301, width: 860, maxWidth: 'calc(100vw - 32px)',
          height: '80vh',  // fixed height — no collapse when few widgets
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Add Widget</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setFilter({ type: 'all' }); }}
              placeholder="Search widgets…"
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface2)', fontSize: 13, width: 200, outline: 'none',
                fontFamily: 'DM Sans, sans-serif',
              }}
            />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}>×</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 160, borderRight: '1px solid var(--border)', padding: '12px 0', flexShrink: 0, overflowY: 'auto' }}>
            {/* All */}
            <button
              onClick={() => { setFilter({ type: 'all' }); setSearch(''); }}
              style={sidebarBtnStyle(filter.type === 'all')}
            >
              All
            </button>

            {/* Categories + modules */}
            {(CATEGORY_ORDER as WidgetCategory[]).map(cat => {
              const modules = CATEGORY_MODULES[cat] ?? [];
              const catActive = isFilterActive({ type: 'category', category: cat });
              return (
                <React.Fragment key={cat}>
                  <button
                    onClick={() => { setFilter({ type: 'category', category: cat }); setSearch(''); }}
                    style={sidebarBtnStyle(catActive)}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                  {modules.map(mod => {
                    const modActive = isFilterActive({ type: 'module', category: cat, module: mod.id });
                    return (
                      <button
                        key={mod.id}
                        onClick={() => { setFilter({ type: 'module', category: cat, module: mod.id }); setSearch(''); }}
                        style={sidebarBtnStyle(modActive, true)}
                      >
                        {mod.label}
                      </button>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* Plugins — only when at least one plugin widget exists */}
            {pluginWidgets.size > 0 && (
              <button
                onClick={() => { setFilter({ type: 'plugins' }); setSearch(''); }}
                style={sidebarBtnStyle(filter.type === 'plugins')}
              >
                Plugins
              </button>
            )}
          </div>

          {/* Widget grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', paddingTop: 40, fontSize: 14 }}>
                No widgets found
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {filtered.map(def => {
                  const added = currentWidgetIds.has(def.id);
                  return (
                    <div
                      key={def.id}
                      style={{
                        padding: 14, borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {def.iconEl ?? <Icon name={def.icon} size={16} color="var(--text2)" />}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{def.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0, lineHeight: 1.4, flex: 1 }}>{def.description}</p>
                      <button
                        onClick={() => { if (!added) { onAdd(def); onClose(); } }}
                        disabled={added}
                        style={{
                          padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          cursor: added ? 'default' : 'pointer',
                          background: added ? 'var(--surface2)' : 'var(--text)',
                          color: added ? 'var(--text3)' : 'var(--surface)',
                          border: 'none', alignSelf: 'flex-start',
                        }}
                      >
                        {added ? '✓ Added' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/dashboard/components/WidgetMarketplaceModal.tsx
git commit -m "feat(dashboard): WidgetMarketplaceModal — two-level sidebar with modules + plugins, fixed 80vh height, iconEl support"
```

---

### Task 5: DashboardGrid — remove right-side padding

**Files:**
- Modify: `apps/web/modules/dashboard/components/DashboardGrid.tsx`

- [ ] **Step 1: Add `containerPadding={[0, 0]}` to `ResponsiveGridLayout`**

In `DashboardGrid.tsx` at line 73, change:
```tsx
<ResponsiveGridLayout
  width={width}
  layouts={layouts}
```
to:
```tsx
<ResponsiveGridLayout
  width={width}
  layouts={layouts}
  containerPadding={[0, 0]}
```

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/dashboard/components/DashboardGrid.tsx
git commit -m "fix(dashboard): remove ResponsiveGridLayout internal padding to fix right-side dead zone"
```

---

### Task 6: Core widget registrations — add `module`

**Files:**
- Modify: `apps/web/modules/shared/lib/register-module-widgets.ts`

The file registers 5 core widget shortcuts. Add `module` to each.

- [ ] **Step 1: Read the current file and add `module` to each registration**

Current widget IDs and their module assignments:
- `core:contacts` → `module: 'contacts'`
- `core:pipeline` → `module: 'pipeline'`
- `core:servers` → `module: 'servers'`
- `core:projects` → `module: 'projects'`
- `core:activity` → `module: 'activity'`

For each `registerDashboardWidget({ id: 'core:...', ... })` call, add `module: '<value>'` inside the registration object. The exact addition is one property line per widget; do not change any other property.

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/lib/register-module-widgets.ts
git commit -m "feat(dashboard): add module field to core widget registrations"
```

---

### Task 7: Contacts widgets — `module` + `filterDefs`

**Files:**
- Modify: 6 files in `apps/web/modules/crm/contacts/components/widgets/`

**filterDefs helpers** (reuse this exact code in all contacts widgets that need owner):
```ts
// fetch /api/users → FilterOption[]
const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};
```

Import at the top of widgets that use it:
```ts
import { apiFetch } from '@/modules/shared/lib/api';
import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';
```

**Status pills options** (reuse in widgets that filter by status):
```ts
const STATUS_OPTIONS: FilterOption[] = [
  { label: 'Prospect', value: 'prospect' },
  { label: 'Customer', value: 'customer' },
  { label: 'Cold', value: 'cold' },
  { label: 'Churned', value: 'churned' },
];
```

#### RecentContactsWidget (`RecentContactsWidget.tsx`)

Changes:
1. Add `module: 'contacts'` to `registerDashboardWidget`
2. Add `filterDefs` with `status` (pills, static)
3. Read `config.filters?.['status']` in component
4. Include `status` in queryKey
5. Pass `status` to `listContacts`

Full updated component + registration:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const STATUS_OPTIONS: FilterOption[] = [
  { label: 'Prospect', value: 'prospect' },
  { label: 'Customer', value: 'customer' },
  { label: 'Cold', value: 'cold' },
  { label: 'Churned', value: 'churned' },
];

function RecentContactsWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 8;
  const status = config.filters?.['status'] ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'contacts-recent', limit, status],
    queryFn: async () => listContacts(await getToken(), {
      limit: String(limit),
      ...(status ? { status } : {}),
    }),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = data?.data ?? [];
  if (contacts.length === 0) return <EmptyState href="/crm/contacts/new" label="Add your first contact" icon="users" />;

  const STATUS_COLOR: Record<string, string> = {
    prospect: 'var(--blue)', customer: 'var(--green)', cold: 'var(--text3)', churned: 'var(--red)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Recent Contacts" href="/crm/contacts" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {contacts.map(c => (
          <button
            key={c.id}
            onClick={() => router.push(`/crm/contacts/${c.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
              background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
              cursor: 'pointer', textAlign: 'left', width: '100%', borderRadius: 4,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: 'var(--surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--text2)', flexShrink: 0,
            }}>
              {c.name[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
              color: STATUS_COLOR[c.status] ?? 'var(--text3)', background: 'var(--surface2)',
              textTransform: 'capitalize',
            }}>{c.status}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{relativeTime(c.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:contacts-recent',
  label: 'Recent Contacts',
  description: 'Latest contacts added to your workspace with status badges',
  icon: 'users',
  category: 'sales',
  module: 'contacts',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  supportedFilters: ['limit'],
  filterDefs: [
    { key: 'status', label: 'Status', type: 'pills', options: STATUS_OPTIONS },
  ],
  defaultConfig: { limit: 8 },
  component: RecentContactsWidget,
});
```

#### TopCustomersWidget (`TopCustomersWidget.tsx`)

Changes:
1. Add `module: 'contacts'`
2. Add `filterDefs` with `status` (pills, static) — default to 'customer' when empty
3. Read `config.filters?.['status']`, default to `'customer'`
4. Include `status` in queryKey
5. Pass `status` to `listContacts`

Minimal diff to registration block:
```ts
// Before:
registerDashboardWidget({ id: 'sales:contacts-top-customers', ..., supportedFilters: [...], ... });

// After:
registerDashboardWidget({
  id: 'sales:contacts-top-customers',
  ...,
  module: 'contacts',
  filterDefs: [
    { key: 'status', label: 'Status', type: 'pills', options: STATUS_OPTIONS },
  ],
  ...,
});
```

In the component body, change the query to read the filter:
```ts
const status = config.filters?.['status'] ?? 'customer';  // default to 'customer'
const { data, ... } = useQuery({
  queryKey: ['widget', 'contacts-top-customers', limit, status],
  queryFn: async () => listContacts(await getToken(), { status, limit: String(limit) }),
  ...
});
```

Add `import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';` and the `STATUS_OPTIONS` const at the top.

#### FollowupsDueWidget (`FollowupsDueWidget.tsx`)

Changes:
1. Add `module: 'contacts'`
2. Add `filterDefs` with `owner` (select, dynamic fetch `/api/users`)
3. Read `config.filters?.['owner']`
4. Include in queryKey
5. Pass `owner_id` param to `listContacts`

Add imports:
```ts
import { apiFetch } from '@/modules/shared/lib/api';
import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';
```

Add helper above component:
```ts
const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};
```

In component:
```ts
const owner = config.filters?.['owner'] ?? '';
const { data, ... } = useQuery({
  queryKey: ['widget', 'followups-due', owner],
  queryFn: async () => listContacts(await getToken(), {
    limit: '100',
    ...(owner ? { owner_id: owner } : {}),
  }),
  ...
});
```

Registration addition:
```ts
module: 'contacts',
filterDefs: [
  { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
],
```

#### NewLeadsTodayWidget, ContactStatusWidget, ContactGrowthWidget

These three widgets only need `module: 'contacts'` — no filterDefs required per the spec.

Add to each registration object:
```ts
module: 'contacts',
```

- [ ] **Step 1: Update all 6 contacts widgets** per the descriptions above

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/crm/contacts/components/widgets/
git commit -m "feat(dashboard): contacts widgets — add module + filterDefs (status, owner)"
```

---

### Task 8: Pipeline widgets — `module` + `filterDefs`

**Files:**
- Modify: 5 files in `apps/web/modules/crm/pipeline/components/widgets/`

**Shared setup** for all pipeline widgets that use owner/stage filter:

```ts
import { apiFetch } from '@/modules/shared/lib/api';
import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

const STAGE_OPTIONS: FilterOption[] = [
  { label: 'Lead', value: 'lead' },
  { label: 'Qualifying', value: 'qualifying' },
  { label: 'Proposal', value: 'proposal' },
  { label: 'Closing', value: 'closing' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
];
```

#### DealsByStageWidget (`DealsByStageWidget.tsx`)

Add `module: 'contacts'` and `filterDefs` for owner. The widget currently uses `getPipeline(token, '30d')`. To pass owner, call `apiFetch` directly:

In component:
```ts
const owner = config.filters?.['owner'] ?? '';
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: ['widget', 'deals-by-stage', owner],
  queryFn: async () => {
    const token = await getToken();
    const qs = owner ? `&owner_id=${owner}` : '';
    return apiFetch<{ data: { stages: StageData[] }; error: null }>(
      `/api/analytics/pipeline?period=30d${qs}`,
      { token },
    );
  },
  staleTime: 60_000,
  enabled: isEnabled('crm'),
});
```

Import `StageData` type:
```ts
import type { StageData } from '@/modules/analytics/lib/analytics';
```

Also add `import { apiFetch } from '@/modules/shared/lib/api';`.

Registration:
```ts
module: 'pipeline',
filterDefs: [
  { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
],
supportedFilters: [],
```

#### PipelineValueWidget (`PipelineValueWidget.tsx`)

Add `module: 'pipeline'` + filterDefs for owner and stage. Same `apiFetch` pattern for the query, appending `owner_id` and `stage` params.

In component:
```ts
const owner = config.filters?.['owner'] ?? '';
const stage = config.filters?.['stage'] ?? '';
// include both in queryKey and URL params
```

Registration:
```ts
module: 'pipeline',
filterDefs: [
  { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
  { key: 'stage', label: 'Stage', type: 'pills', options: STAGE_OPTIONS },
],
```

#### ClosingThisWeekWidget (`ClosingThisWeekWidget.tsx`)

Add `module: 'pipeline'` + owner filterDef. This widget uses the deals list API. Add owner filter to query params.

In component:
```ts
const owner = config.filters?.['owner'] ?? '';
// pass owner_id to deals fetch when non-empty
```

Registration:
```ts
module: 'pipeline',
filterDefs: [
  { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
],
```

#### WinRateWidget (`WinRateWidget.tsx`)

Add `module: 'pipeline'` + owner filterDef.

Registration:
```ts
module: 'pipeline',
filterDefs: [
  { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
],
```

#### RecentOpportunitiesWidget (`RecentOpportunitiesWidget.tsx`)

Add `module: 'pipeline'` + filterDefs for owner and stage.

Registration:
```ts
module: 'pipeline',
filterDefs: [
  { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
  { key: 'stage', label: 'Stage', type: 'pills', options: STAGE_OPTIONS },
],
```

- [ ] **Step 1: Update all 5 pipeline widgets** per descriptions above

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/crm/pipeline/components/widgets/
git commit -m "feat(dashboard): pipeline widgets — add module + filterDefs (owner, stage)"
```

---

### Task 9: Companies + Tasks widgets — `module` + `filterDefs`

**Files:**
- Modify: 4 files in `apps/web/modules/crm/companies/components/widgets/`
- Modify: 6 files in `apps/web/modules/crm/tasks/components/widgets/`

#### Companies widgets (no filterDefs, only `module`)

All 4 companies widgets get `module: 'companies'` only:
- `RecentCompaniesWidget.tsx` → `module: 'companies'`
- `LargestCustomersWidget.tsx` → `module: 'companies'`
- `CompanyGrowthWidget.tsx` → `module: 'companies'`
- `CompaniesByIndustryWidget.tsx` → `module: 'companies'`

For each, add `module: 'companies',` inside `registerDashboardWidget({...})`.

#### Tasks widgets

**Shared setup** for owner filter:
```ts
import { apiFetch } from '@/modules/shared/lib/api';
import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};
```

Per-widget changes (all 6 task widgets get owner filterDef per spec: DueTodayWidget, OverdueTasksWidget, UpcomingDeadlinesWidget, CompletedThisWeekWidget, plus `module` only for TaskPriorityWidget and TeamTaskProgressWidget):

**DueTodayWidget** (`DueTodayWidget.tsx`):
- `module: 'tasks'`
- filterDef: owner (select, dynamic)
- In component: `const owner = config.filters?.['owner'] ?? '';`
- Include `owner` in queryKey: `queryKey: ['widget', 'tasks-due-today', owner]`
- This widget uses `useUnifiedTasks` — add `owner_id?: string` param if the hook supports it, otherwise note it as a future enhancement (the filterDef still renders correctly in UI)

**OverdueTasksWidget** (`OverdueTasksWidget.tsx`):
- Same pattern as DueTodayWidget

**UpcomingDeadlinesWidget** (`UpcomingDeadlinesWidget.tsx`):
- Same pattern

**CompletedThisWeekWidget** (`CompletedThisWeekWidget.tsx`):
- Same pattern

**TaskPriorityWidget** + **TeamTaskProgressWidget**:
- `module: 'tasks'` only, no filterDefs

Registration for all 6:
```ts
// DueTodayWidget / OverdueTasksWidget / UpcomingDeadlinesWidget / CompletedThisWeekWidget
module: 'tasks',
filterDefs: [
  { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
],

// TaskPriorityWidget / TeamTaskProgressWidget
module: 'tasks',
```

- [ ] **Step 1: Update all 10 widgets** per descriptions above

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/crm/companies/components/widgets/ apps/web/modules/crm/tasks/components/widgets/
git commit -m "feat(dashboard): companies + tasks widgets — add module, tasks get owner filterDef"
```

---

### Task 10: Projects + Servers widgets — `module` + `filterDefs`

**Files:**
- Modify: 5 files in `apps/web/modules/projects/components/widgets/`
- Modify: 5 files in `apps/web/modules/servers/components/widgets/` (CpuUsageWidget, RamUsageWidget, StorageUsageWidget, OfflineServersWidget, TopConsumersWidget)
- Modify: 1 file `apps/web/modules/servers/components/widgets/ServerAlertsWidget.tsx`

#### Projects widgets (no filterDefs, only `module`)

All 5 projects widgets get `module: 'projects'` only:
- `ActiveProjectsWidget.tsx`, `DelayedProjectsWidget.tsx`, `MilestonesDueWidget.tsx`, `TeamWorkloadWidget.tsx`, `ProjectActivityWidget.tsx`

#### Servers widgets with region filterDef

`CpuUsageWidget`, `RamUsageWidget`, `StorageUsageWidget` get region filterDef (select, dynamic).

**Shared region fetch helper** (add to each of the 3 widgets):
```ts
import { apiFetch } from '@/modules/shared/lib/api';
import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchRegionOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { region: string | null }[] }>('/api/servers', { token });
  const regions = [...new Set(res.data.map(s => s.region).filter((r): r is string => r !== null))];
  return regions.map(r => ({ label: r, value: r }));
};
```

In each component, read `config.filters?.['region']`:
```ts
const region = config.filters?.['region'] ?? '';
const { data, ... } = useQuery({
  queryKey: ['widget', 'servers-cpu', region],   // include region in key
  queryFn: async () => listServers(await getToken()),  // client-side filter by region
  ...
});
// then filter in component:
const servers = [...(data?.data ?? [])]
  .filter(s => !region || s.region === region)
  .sort(...)
  .slice(0, limit);
```

Note: server-side region filtering is done client-side here since `listServers` doesn't accept params. The `fetchOptions` fetches real regions dynamically.

Registration additions for CpuUsageWidget/RamUsageWidget/StorageUsageWidget:
```ts
module: 'servers',
filterDefs: [
  { key: 'region', label: 'Region', type: 'select', fetchOptions: fetchRegionOptions, placeholder: 'All regions' },
],
```

#### `OfflineServersWidget` + `TopConsumersWidget` + `ServerAlertsWidget`

These get `module: 'servers'` only — no filterDefs per the spec.

- [ ] **Step 1: Update all 11 widgets** per descriptions above

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/widgets/ apps/web/modules/servers/components/widgets/
git commit -m "feat(dashboard): projects + servers widgets — add module, servers get region filterDef"
```

---

### Task 11: Databases + Websites + Analytics widgets — `module` + `filterDefs`

**Files:**
- Modify: 4 files in `apps/web/modules/databases/components/widgets/`
- Modify: 4 files in `apps/web/modules/shared/components/widgets/` (website widgets)
- Modify: 4 files in `apps/web/modules/analytics/components/widgets/`

#### Database widgets — engine filterDef

All 4 database widgets (`DatabaseHealthWidget`, `DbStorageWidget`, `DbConnectionsWidget`, `ReplicationLagWidget`) get:
- `module: 'databases'`
- filterDef: engine (pills, static)

**Engine options** (add to each widget):
```ts
import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';

const ENGINE_OPTIONS: FilterOption[] = [
  { label: 'Postgres', value: 'postgres' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'Redis', value: 'redis' },
  { label: 'ClickHouse', value: 'clickhouse' },
  { label: 'Mongo', value: 'mongo' },
  { label: 'Other', value: 'other' },
];
```

In each component, read and filter:
```ts
const engine = config.filters?.['engine'] ?? '';
// in queryKey: include engine
// client-side filter (listInfraDatabases doesn't accept params):
const dbs = (data?.data ?? []).filter(db => !engine || db.engine === engine);
```

Registration addition for all 4:
```ts
module: 'databases',
filterDefs: [
  { key: 'engine', label: 'Engine', type: 'pills', options: ENGINE_OPTIONS },
],
```

#### Website widgets (no filterDefs, only `module`)

All 4 website widgets get `module: 'websites'`:
- `WebsiteStatusWidget.tsx`, `WebsiteUptimeWidget.tsx`, `SslExpiryWidget.tsx`, `ResponseTimeWidget.tsx`

#### Analytics widgets (no filterDefs, only `module`)

All 4 analytics widgets get `module: 'analytics'`:
- `RevenueTrendWidget.tsx`, `PipelineByStageWidget.tsx`, `KpiCardsWidget.tsx`, `TeamLeaderboardWidget.tsx`

- [ ] **Step 1: Update all 12 widgets** per descriptions above

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/databases/components/widgets/ apps/web/modules/shared/components/widgets/ apps/web/modules/analytics/components/widgets/
git commit -m "feat(dashboard): databases + websites + analytics widgets — add module, databases get engine filterDef"
```

---

### Task 12: Alerts + Activity widgets — `module` + `filterDefs`

**Files:**
- Modify: 3 files in `apps/web/modules/alerts/components/widgets/`
- Modify: 3 files in `apps/web/modules/activity/components/widgets/`

#### Alerts widgets — resource_type filterDef

All 3 alerts widgets (`CriticalAlertsWidget`, `WarningAlertsWidget`, `RecentlyResolvedWidget`) get:
- `module: 'alerts'`
- filterDef: resource_type (pills, static)

```ts
import type { FilterOption } from '@/modules/shared/lib/dashboard-registry';

const RESOURCE_TYPE_OPTIONS: FilterOption[] = [
  { label: 'Server', value: 'server' },
  { label: 'Database', value: 'database' },
  { label: 'Website', value: 'website' },
  { label: 'CRM', value: 'crm' },
];
```

In each component, read and include in query params:
```ts
const resourceType = config.filters?.['resource_type'] ?? '';
// include in queryKey
// append to API URL when non-empty: ?resource_type=server
```

These widgets use `useQuery` with direct API fetches to `/api/alerts`. Example (CriticalAlertsWidget):
```ts
const resourceType = config.filters?.['resource_type'] ?? '';
const { data, ... } = useQuery({
  queryKey: ['widget', 'alerts-critical', resourceType],
  queryFn: async () => {
    const token = await getToken();
    const qs = new URLSearchParams({
      resolved: 'false',
      severity: 'critical',
      ...(resourceType ? { resource_type: resourceType } : {}),
    });
    return apiFetch<{ data: AlertRow[] }>(`/api/alerts?${qs}`, { token });
  },
  staleTime: 60_000,
});
```

(The `AlertRow` type is whatever type was used in the original file — keep it unchanged.)

Registration for all 3 alerts widgets:
```ts
module: 'alerts',
filterDefs: [
  { key: 'resource_type', label: 'Resource Type', type: 'pills', options: RESOURCE_TYPE_OPTIONS },
],
```

#### Activity widgets

**WorkspaceActivityWidget** (`WorkspaceActivityWidget.tsx`):
- `module: 'activity'`
- filterDef: type (pills, static)

```ts
const ACTIVITY_TYPE_OPTIONS: FilterOption[] = [
  { label: 'Email', value: 'email' },
  { label: 'Call', value: 'call' },
  { label: 'Note', value: 'note' },
  { label: 'Meeting', value: 'meeting' },
  { label: 'Deal', value: 'deal_change' },
  { label: 'Infra', value: 'infra_alert' },
];
```

In component:
```ts
const activityType = config.filters?.['type'] ?? '';
// include in queryKey and fetch URL: ?type=<activityType>
```

Registration:
```ts
module: 'activity',
filterDefs: [
  { key: 'type', label: 'Type', type: 'pills', options: ACTIVITY_TYPE_OPTIONS },
],
```

**TeamActivityWidget** (`TeamActivityWidget.tsx`):
- `module: 'activity'`
- filterDef: user (select, dynamic fetch `/api/users`)

```ts
const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};
```

In component:
```ts
const userId = config.filters?.['user'] ?? '';
// include in queryKey and fetch URL: ?user_id=<userId>
```

Registration:
```ts
module: 'activity',
filterDefs: [
  { key: 'user', label: 'Team Member', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All members' },
],
```

**RecentChangesWidget** (`RecentChangesWidget.tsx`):
- `module: 'activity'` only — no filterDefs

- [ ] **Step 1: Update all 6 widgets** per descriptions above

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/alerts/components/widgets/ apps/web/modules/activity/components/widgets/
git commit -m "feat(dashboard): alerts + activity widgets — add module + filterDefs (resource_type, type, user)"
```

---

### Task 13: Final type-check + smoke test

**Files:** No code changes — verification only.

- [ ] **Step 1: Full type-check**

```
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 2: Verify the app builds**

```
pnpm --filter @vencore/web build 2>&1 | tail -20
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Manual smoke test checklist**

Open the app at http://localhost:3000 and verify:

1. **Grid padding fix:** Drag a widget all the way to the right edge — it should be placeable at column 12 with no dead zone.
2. **Modal fixed height:** Open "Add Widget" → click each category → modal stays 80vh with no collapse.
3. **Sidebar two-level:** Open "Add Widget" → sidebar shows "Sales" with "Contacts / Pipeline / Companies" indented below; "Infra" shows "Servers / Databases / Websites" below.
4. **Module filter:** Click "Contacts" in sidebar → only contacts widgets shown.
5. **filterDefs in popover:** Enter edit mode → click gear on "Recent Contacts" widget → popover shows "Status" pills (All / Prospect / Customer / Cold / Churned).
6. **Dynamic filter:** Click gear on "Follow-ups Due" → popover shows "Owner" select with real user names loaded.
7. **Filter saves:** Select "Customer" status on Recent Contacts → save → reload → status pill still selected.
8. **iconEl:** If a widget registration uses `iconEl: <span>🔥</span>`, that emoji renders in the marketplace card instead of a named icon.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(dashboard): final type-check pass — dashboard polish feature complete"
```
