'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

interface WorkspacePlugin {
  id: string;
  plugin_id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed_at: string;
}

export default function PluginsSettingsPage() {
  const getToken = useApiToken();
  const [plugins, setPlugins] = useState<WorkspacePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchPlugins() {
    try {
      const res = await fetch(`${apiUrl}/api/plugins`, {
        headers: await authHeaders(),
        credentials: 'include',
      });
      const json = await res.json() as { data: WorkspacePlugin[]; error: null } | { data: null; error: { message: string } };
      if (json.error) throw new Error(json.error.message);
      setPlugins(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchPlugins(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset so same file can be re-uploaded
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
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = json.data;
          return next;
        }
        return [...prev, json.data];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function togglePlugin(plugin: WorkspacePlugin) {
    setToggling(plugin.id);
    try {
      const res = await fetch(`${apiUrl}/api/plugins/${plugin.id}`, {
        method: 'PATCH',
        headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !plugin.enabled }),
      });
      const json = await res.json() as { data: WorkspacePlugin; error: null } | { data: null; error: { message: string } };
      if (json.error) throw new Error(json.error.message);
      setPlugins(prev => prev.map(p => p.id === plugin.id ? json.data : p));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove plugin');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--text)' }}>Plugins</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>
            Install local plugins from a .zip file containing a manifest.json.
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</p>
      ) : plugins.length === 0 ? (
        <div style={{
          padding: '32px 20px', textAlign: 'center', borderRadius: 10,
          border: '1px dashed var(--border)', background: 'var(--surface)',
        }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>
            No plugins installed. Upload a .zip to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plugins.map(plugin => (
            <div
              key={plugin.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface)',
                opacity: plugin.enabled ? 1 : 0.6,
              }}
            >
              <div
                style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
                onClick={() => router.push(`/plugins/${plugin.plugin_id}`)}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {plugin.name}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                  {plugin.plugin_id} · v{plugin.version}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {/* Enable / disable toggle */}
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

                {/* Remove */}
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
      )}
    </div>
  );
}
