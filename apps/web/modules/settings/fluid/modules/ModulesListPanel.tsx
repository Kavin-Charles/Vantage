'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useModules } from '@/modules/shared/contexts/modules';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import {
  PageHeader, FluidTable, FluidBadge, MSIcon, EmptyState, type FluidColumn,
} from '@/modules/shared/fluid/ui';
import { FIRST_PARTY_MODULES } from './moduleMeta';

interface ModuleRow {
  kind: 'module' | 'plugin';
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * Modules list — registered into the Foundation settings registry (workspace
 * scope, admin-only) as the `modules` entry, replacing SettingsStub. Lists
 * first-party modules (useModules) and installed plugins (useInstalledPlugins)
 * side by side; each row toggles enabled state and links to its settings
 * page at /settings/modules/[moduleId].
 *
 * Reuses the exact toggle surfaces the legacy
 * apps/web/app/(dashboard)/settings/modules/page.tsx used:
 *   - PATCH /api/workspace/modules/:moduleId  → { enabled } for first-party modules
 *   - PATCH /api/plugins/:id                  → { enabled } for installed plugins
 */
export function ModulesListPanel() {
  const router = useRouter();
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const { isEnabled, setEnabled, isLoading: modulesLoading } = useModules();
  const { data: plugins, isLoading: pluginsLoading } = useInstalledPlugins();

  const [pendingModule, setPendingModule] = useState<string | null>(null);

  const togglePlugin = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const token = await getToken();
      return apiFetch(`/api/plugins/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }), token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plugins'] }),
  });

  async function toggleModule(moduleId: string) {
    const next = !isEnabled(moduleId);
    setPendingModule(moduleId);
    try {
      const token = await getToken();
      await apiFetch(`/api/workspace/modules/${moduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: next }),
        token,
      });
      setEnabled(moduleId, next);
    } finally {
      setPendingModule(null);
    }
  }

  const rows: ModuleRow[] = [
    ...FIRST_PARTY_MODULES.map((m): ModuleRow => ({
      kind: 'module', id: m.id, name: m.name, description: m.description, enabled: isEnabled(m.id),
    })),
    ...(plugins ?? []).map((p): ModuleRow => ({
      kind: 'plugin', id: p.id, name: p.name, description: p.manifest.description ?? 'Installed plugin', enabled: p.enabled,
    })),
  ];

  const isLoading = modulesLoading || pluginsLoading;

  const columns: FluidColumn<ModuleRow>[] = [
    {
      key: 'name',
      header: 'Module',
      render: r => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            {r.name}
            {r.kind === 'plugin' ? <FluidBadge tone="blue">Plugin</FluidBadge> : null}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', marginTop: 2 }}>{r.description}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 110,
      render: r => (r.enabled ? <FluidBadge tone="green">Enabled</FluidBadge> : <FluidBadge tone="neutral">Disabled</FluidBadge>),
    },
    {
      key: 'actions',
      header: '',
      width: 140,
      render: r => {
        const pending = r.kind === 'module' ? pendingModule === r.id : togglePlugin.isPending;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (r.kind === 'module') void toggleModule(r.id);
                else togglePlugin.mutate({ id: r.id, enabled: !r.enabled });
              }}
              disabled={pending}
              aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
              style={{
                position: 'relative', width: 40, height: 22, borderRadius: 'var(--fl-radius-pill)', flexShrink: 0,
                background: r.enabled ? 'var(--fl-primary)' : 'var(--fl-outline-variant)',
                border: 'none', cursor: pending ? 'default' : 'pointer', transition: 'background .2s',
                opacity: pending ? 0.6 : 1,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: r.enabled ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%', background: 'var(--fl-on-primary)',
                transition: 'left .2s',
              }} />
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); router.push(`/settings/modules/${r.id}`); }}
              aria-label={`${r.name} settings`}
              style={{ display: 'flex', color: 'var(--fl-on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <MSIcon name="settings" size={18} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="Modules" subtitle="Enable or disable features and plugins for your workspace." />
      {isLoading ? (
        <EmptyState icon="hourglass_empty" title="Loading…" />
      ) : rows.length === 0 ? (
        <EmptyState icon="widgets" title="No modules found" />
      ) : (
        <FluidTable
          columns={columns}
          rows={rows}
          rowKey={r => `${r.kind}:${r.id}`}
          onRowClick={r => router.push(`/settings/modules/${r.id}`)}
        />
      )}
    </>
  );
}
