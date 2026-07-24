'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useInstalledPlugins, type InstalledPlugin } from '@/modules/shared/hooks/useInstalledPlugins';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import {
  PageHeader, FluidTable, FluidBadge, FluidButton, MSIcon, EmptyState, type FluidColumn,
} from '@/modules/shared/fluid/ui';

/**
 * Marketplace plugin shape returned by GET /api/plugins/marketplace — see
 * `MarketplacePlugin` in apps/api/src/routes/plugins.ts. `installed` is
 * computed server-side against the workspace's installed plugins.
 */
interface MarketplacePlugin {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  version: string;
  pricing_type: 'free' | 'paid';
  price_cents: number | null;
  currency: string;
  icon_url: string | null;
  author_name: string;
  installed: boolean;
}

interface MarketplaceResponse {
  data: MarketplacePlugin[] | null;
  error: { code: string; message: string } | null;
}

/**
 * Fluid Plugins settings page — installed plugins + marketplace. Registered
 * into the Foundation settings registry as the `plugins` entry (workspace
 * scope, admin-only), replacing SettingsStub.
 *
 * Reuses the exact data/mutation surfaces the legacy
 * apps/web/app/(dashboard)/settings/plugins/page.tsx relied on:
 *   - useInstalledPlugins()                          → installed list (['plugins'] query)
 *   - PATCH  /api/plugins/:id            { enabled }  → toggle enable/disable
 *   - DELETE /api/plugins/:id                         → uninstall
 *   - GET    /api/plugins/marketplace                 → marketplace listing
 *   - POST   /api/plugins/marketplace/install/:slug   → install
 *
 * Paid marketplace plugins that require a license_key surface the server's
 * error message inline rather than opening a license-entry modal — that flow
 * is deliberately out of scope for this page (FluidModal is not part of the
 * approved primitive set here); free installs/toggles/uninstalls behave
 * identically to the legacy page.
 */
export function PluginsPanel() {
  const router = useRouter();
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const { ask: askConfirm, el: confirmEl } = useConfirm();

  const {
    data: installed,
    isLoading: installedLoading,
    isError: installedIsError,
  } = useInstalledPlugins();

  const {
    data: marketplace,
    isLoading: marketplaceLoading,
    isError: marketplaceIsError,
  } = useQuery({
    queryKey: ['plugins-marketplace'],
    queryFn: async () => {
      const res = await apiFetch<MarketplaceResponse>('/api/plugins/marketplace', { token: await getToken() });
      return res.data ?? [];
    },
    staleTime: 60_000,
  });

  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plugins'] }),
      queryClient.invalidateQueries({ queryKey: ['plugins-marketplace'] }),
    ]);
  }

  async function togglePlugin(plugin: InstalledPlugin) {
    setTogglingId(plugin.id);
    setError(null);
    try {
      const token = await getToken();
      await apiFetch(`/api/plugins/${plugin.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !plugin.enabled }),
        token,
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plugin');
    } finally {
      setTogglingId(null);
    }
  }

  function confirmUninstall(plugin: InstalledPlugin) {
    askConfirm({
      title: 'Remove plugin',
      message: `Remove plugin "${plugin.name}"? This cannot be undone.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: () => { void uninstallPlugin(plugin); },
    });
  }

  async function uninstallPlugin(plugin: InstalledPlugin) {
    setRemovingId(plugin.id);
    setError(null);
    try {
      const token = await getToken();
      await apiFetch(`/api/plugins/${plugin.id}`, { method: 'DELETE', token });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove plugin');
    } finally {
      setRemovingId(null);
    }
  }

  async function installPlugin(plugin: MarketplacePlugin) {
    setInstallingSlug(plugin.slug);
    setError(null);
    try {
      const token = await getToken();
      await apiFetch(`/api/plugins/marketplace/install/${plugin.slug}`, {
        method: 'POST',
        body: JSON.stringify({}),
        token,
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstallingSlug(null);
    }
  }

  const installedColumns: FluidColumn<InstalledPlugin>[] = [
    {
      key: 'name',
      header: 'Plugin',
      render: p => (
        <div>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', marginTop: 2 }}>{p.plugin_id}</div>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      width: 100,
      render: p => <span>v{p.version}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 110,
      render: p => (p.enabled ? <FluidBadge tone="green">Enabled</FluidBadge> : <FluidBadge tone="neutral">Disabled</FluidBadge>),
    },
    {
      key: 'actions',
      header: '',
      width: 150,
      render: p => {
        const toggling = togglingId === p.id;
        const removing = removingId === p.id;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => void togglePlugin(p)}
              disabled={toggling}
              aria-label={`${p.enabled ? 'Disable' : 'Enable'} ${p.name}`}
              style={{
                position: 'relative', width: 40, height: 22, borderRadius: 'var(--fl-radius-pill)', flexShrink: 0,
                background: p.enabled ? 'var(--fl-primary)' : 'var(--fl-outline-variant)',
                border: 'none', cursor: toggling ? 'default' : 'pointer', transition: 'background .2s',
                opacity: toggling ? 0.6 : 1,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: p.enabled ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%', background: 'var(--fl-on-primary)',
                transition: 'left .2s',
              }} />
            </button>
            <button
              type="button"
              onClick={() => router.push(`/settings/modules/${p.id}`)}
              aria-label={`${p.name} settings`}
              style={{ display: 'flex', color: 'var(--fl-on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <MSIcon name="settings" size={18} />
            </button>
            <button
              type="button"
              onClick={() => confirmUninstall(p)}
              disabled={removing}
              aria-label={`Remove ${p.name}`}
              style={{
                display: 'flex', color: 'var(--fl-error)', background: 'none', border: 'none', padding: 4,
                cursor: removing ? 'default' : 'pointer', opacity: removing ? 0.5 : 1,
              }}
            >
              <MSIcon name="delete" size={18} />
            </button>
          </div>
        );
      },
    },
  ];

  const marketplaceColumns: FluidColumn<MarketplacePlugin>[] = [
    {
      key: 'name',
      header: 'Plugin',
      render: mp => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            {mp.name}
            {mp.pricing_type === 'paid' ? <FluidBadge tone="gold">Paid</FluidBadge> : null}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', marginTop: 2 }}>{mp.description}</div>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      width: 100,
      render: mp => <span>v{mp.version}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 140,
      render: mp => {
        const installing = installingSlug === mp.slug;
        if (mp.installed) return <FluidBadge tone="blue">Installed</FluidBadge>;
        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <FluidButton variant="ghost" disabled={installing} onClick={() => void installPlugin(mp)}>
              {installing ? 'Installing…' : 'Install'}
            </FluidButton>
          </div>
        );
      },
    },
  ];

  const fetchErrorMessage = installedIsError
    ? 'Failed to load installed plugins.'
    : marketplaceIsError
      ? 'Failed to load marketplace plugins.'
      : null;
  const bannerMessage = error ?? fetchErrorMessage;

  return (
    <>
      <PageHeader title="Plugins" subtitle="Manage installed plugins and browse the marketplace." />

      {bannerMessage ? (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 20,
          background: 'var(--fl-error-container)', color: 'var(--fl-on-error-container)', fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>{bannerMessage}</span>
          {error ? (
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginBottom: 32 }}>
        <h3 style={{
          fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: 'var(--fl-outline)', margin: '0 0 12px',
        }}>
          Installed
        </h3>
        {installedLoading ? (
          <EmptyState icon="hourglass_empty" title="Loading…" />
        ) : !installed || installed.length === 0 ? (
          <EmptyState icon="extension" title="No plugins installed" message="Install a plugin from the marketplace below to get started." />
        ) : (
          <FluidTable columns={installedColumns} rows={installed} rowKey={p => p.id} />
        )}
      </div>

      <div>
        <h3 style={{
          fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: 'var(--fl-outline)', margin: '0 0 12px',
        }}>
          Marketplace
        </h3>
        {marketplaceLoading ? (
          <EmptyState icon="hourglass_empty" title="Loading…" />
        ) : !marketplace || marketplace.length === 0 ? (
          <EmptyState icon="storefront" title="No marketplace plugins available" />
        ) : (
          <FluidTable columns={marketplaceColumns} rows={marketplace} rowKey={mp => mp.id} />
        )}
      </div>

      {confirmEl}
    </>
  );
}
