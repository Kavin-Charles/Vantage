'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

interface WorkspacePlugin {
  id: string;
  plugin_id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed_at: string;
  pricing_type: 'free' | 'paid';
  license_key: string | null;
  source: 'local' | 'marketplace';
  platform_plugin_id: string | null;
}

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

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ color: '#d97706', flexShrink: 0 }}>
      <path d="M6 1l1.4 2.8 3.1.45-2.25 2.2.53 3.1L6 8.1l-2.78 1.45.53-3.1L1.5 4.25l3.1-.45z" />
    </svg>
  );
}

function LicenseModal({ plugin, onClose, onActivate }: {
  plugin: { id: string; name: string; platform_plugin_id: string | null };
  onClose: () => void;
  onActivate: (key: string) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setErr('');
    try {
      await onActivate(key.trim());
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Invalid license key');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: '24px 28px',
        width: 420, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
          Activate License
        </h3>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text2)' }}>
          Enter your license key for <strong>{plugin.name}</strong>.
        </p>
        <form onSubmit={e => void submit(e)}>
          <input
            autoFocus
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{
              width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
              fontFamily: 'monospace',
            }}
          />
          {err && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--red)' }}>{err}</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text2)', cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !key.trim()} style={{
              padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8,
              background: 'var(--text)', color: '#fff', border: 'none',
              cursor: loading || !key.trim() ? 'default' : 'pointer',
              opacity: loading || !key.trim() ? 0.6 : 1,
            }}>
              {loading ? 'Activating…' : 'Activate & Enable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PluginsSettingsPage() {
  const getToken = useApiToken();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { ask: askConfirm, el: confirmEl } = useConfirm();
  const [plugins, setPlugins] = useState<WorkspacePlugin[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [licenseTarget, setLicenseTarget] = useState<WorkspacePlugin | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchAll() {
    try {
      const [pluginsRes, marketplaceRes] = await Promise.all([
        fetch(`${apiUrl}/api/plugins`, { headers: await authHeaders(), credentials: 'include' }),
        fetch(`${apiUrl}/api/plugins/marketplace`, { headers: await authHeaders(), credentials: 'include' }),
      ]);
      const pluginsJson = await pluginsRes.json() as { data: WorkspacePlugin[]; error: null } | { data: null; error: { message: string } };
      if (!pluginsJson.error) setPlugins(pluginsJson.data ?? []);

      const marketplaceJson = await marketplaceRes.json() as { data: MarketplacePlugin[]; error: null } | { data: null; error: { message: string } };
      if (marketplaceJson.error) setError(`Marketplace: ${marketplaceJson.error.message}`);
      else setMarketplace(marketplaceJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('plugin', file);
      const res = await fetch(`${apiUrl}/api/plugins/upload`, {
        method: 'POST',
        headers: await authHeaders(),
        credentials: 'include',
        body: form,
      });
      const json = await res.json() as { data: WorkspacePlugin; error: null } | { data: null; error: { message: string } };
      if (json.error) throw new Error(json.error.message);
      setPlugins(prev => {
        const idx = prev.findIndex(p => p.plugin_id === json.data.plugin_id);
        if (idx >= 0) { const next = [...prev]; next[idx] = json.data; return next; }
        return [...prev, json.data];
      });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function togglePlugin(plugin: WorkspacePlugin, licenseKey?: string) {
    const enabling = !plugin.enabled;

    if (enabling && plugin.pricing_type === 'paid' && !licenseKey && !plugin.license_key) {
      setLicenseTarget(plugin);
      return;
    }

    setToggling(plugin.id);
    setLicenseTarget(null);
    try {
      const body: Record<string, unknown> = { enabled: enabling };
      if (licenseKey) body['license_key'] = licenseKey;

      const res = await fetch(`${apiUrl}/api/plugins/${plugin.id}`, {
        method: 'PATCH',
        headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json() as { data: WorkspacePlugin; error: null } | { data: null; error: { message: string } };
      if (json.error) throw new Error(json.error.message);
      setPlugins(prev => prev.map(p => p.id === plugin.id ? json.data : p));
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plugin');
    } finally {
      setToggling(null);
    }
  }

  async function removePlugin(plugin: WorkspacePlugin) {
    if (!confirm(`Remove plugin "${plugin.name}"? This cannot be undone.`)) return;
    setRemoving(plugin.id);
    try {
      const res = await fetch(`${apiUrl}/api/plugins/${plugin.id}`, {
        method: 'DELETE',
        headers: await authHeaders(),
        credentials: 'include',
      });
      const json = await res.json() as { data: unknown; error: null } | { data: null; error: { message: string } };
      if (json.error) throw new Error(json.error.message);
      setPlugins(prev => prev.filter(p => p.id !== plugin.id));
      setMarketplace(prev => prev.map(p =>
        plugins.find(wp => wp.platform_plugin_id === p.id) ? { ...p, installed: false } : p
      ));
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove plugin');
    } finally {
      setRemoving(null);
    }
  }

  async function installFromMarketplace(mp: MarketplacePlugin, licenseKey?: string) {
    if (mp.pricing_type === 'paid' && !licenseKey) {
      // We can't show LicenseModal here directly since we don't have a WorkspacePlugin yet.
      // Use a simple prompt for now — the modal will show after install attempt.
      const key = window.prompt(`Enter license key for "${mp.name}":`)?.trim();
      if (!key) return;
      return installFromMarketplace(mp, key);
    }

    setInstalling(mp.id);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (licenseKey) body['license_key'] = licenseKey;

      const res = await fetch(`${apiUrl}/api/plugins/marketplace/install/${mp.id}`, {
        method: 'POST',
        headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json() as { data: WorkspacePlugin; error: null } | { data: null; error: { message: string } };
      if (json.error) throw new Error(json.error.message);
      setPlugins(prev => {
        const idx = prev.findIndex(p => p.plugin_id === json.data.plugin_id);
        if (idx >= 0) { const next = [...prev]; next[idx] = json.data; return next; }
        return [...prev, json.data];
      });
      setMarketplace(prev => prev.map(p => p.id === mp.id ? { ...p, installed: true } : p));
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling(null);
    }
  }

  const uninstalledMarketplace = marketplace.filter(p => !p.installed);

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--text)' }}>Plugins</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>
            Manage plugins from the marketplace or install a local build.
          </p>
        </div>
        <button
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none',
            cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          {uploading ? 'Installing…' : 'Install from .zip'}
        </button>
        <input ref={fileInputRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={handleUpload} />
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13,
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontWeight: 600 }}>×</button>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</p>
      ) : (
        <>
          {/* Installed plugins */}
          {plugins.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 10px' }}>
                Installed
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plugins.map(plugin => (
                  <div
                    key={plugin.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      opacity: plugin.enabled ? 1 : 0.65,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => router.push(`/settings/plugins/${plugin.plugin_id}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{plugin.name}</p>
                        {plugin.pricing_type === 'paid' && <StarIcon />}
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                        {plugin.plugin_id} · v{plugin.version}
                        {plugin.pricing_type === 'paid' && plugin.license_key && (
                          <span style={{ marginLeft: 6, color: 'var(--green)' }}>● Licensed</span>
                        )}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <button
                        disabled={toggling === plugin.id}
                        onClick={() => void togglePlugin(plugin)}
                        title={plugin.enabled ? 'Disable' : 'Enable'}
                        style={{
                          position: 'relative', width: 44, height: 24, borderRadius: 999,
                          background: plugin.enabled ? 'var(--green)' : 'var(--border)',
                          border: 'none', cursor: toggling === plugin.id ? 'default' : 'pointer',
                          transition: 'background .2s', opacity: toggling === plugin.id ? 0.6 : 1,
                        }}
                        aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
                      >
                        <span style={{
                          position: 'absolute', top: 3,
                          left: plugin.enabled ? 23 : 3,
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          transition: 'left .2s',
                        }} />
                      </button>
                      <button
                        disabled={removing === plugin.id}
                        onClick={() => void removePlugin(plugin)}
                        title="Remove plugin"
                        style={{
                          padding: '4px 10px', fontSize: 12, borderRadius: 6,
                          background: 'transparent', border: '1px solid var(--border)',
                          color: 'var(--text2)', cursor: removing === plugin.id ? 'default' : 'pointer',
                          opacity: removing === plugin.id ? 0.5 : 1,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {plugins.length === 0 && uninstalledMarketplace.length === 0 && (
            <div style={{
              padding: '32px 20px', textAlign: 'center', borderRadius: 10,
              border: '1px dashed var(--border)', background: 'var(--surface)',
            }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>
                No plugins installed. Browse the marketplace or upload a .zip.
              </p>
            </div>
          )}

          {/* Marketplace listing */}
          {uninstalledMarketplace.length > 0 && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 10px' }}>
                Marketplace
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {uninstalledMarketplace.map(mp => (
                  <div
                    key={mp.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{mp.name}</p>
                        {mp.pricing_type === 'paid' && <StarIcon />}
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                        by {mp.author_name} · v{mp.version}
                        {mp.pricing_type === 'paid' && mp.price_cents != null && (
                          <span style={{ marginLeft: 4 }}>
                            · ₹{(mp.price_cents / 100).toLocaleString('en-IN')}/{mp.currency === 'INR' ? 'mo' : mp.currency}
                          </span>
                        )}
                      </p>
                      {mp.description && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                          {mp.description}
                        </p>
                      )}
                    </div>
                    <button
                      disabled={installing === mp.id}
                      onClick={() => void installFromMarketplace(mp)}
                      style={{
                        padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 8,
                        background: 'var(--text)', color: '#fff', border: 'none',
                        cursor: installing === mp.id ? 'default' : 'pointer',
                        opacity: installing === mp.id ? 0.6 : 1, flexShrink: 0,
                      }}
                    >
                      {installing === mp.id ? 'Installing…' : mp.pricing_type === 'paid' ? 'Install (Paid)' : 'Install'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* License key modal */}
      {licenseTarget && (
        <LicenseModal
          plugin={licenseTarget}
          onClose={() => setLicenseTarget(null)}
          onActivate={async (key) => {
            await togglePlugin(licenseTarget, key);
          }}
        />
      )}
    </div>
  );
}
