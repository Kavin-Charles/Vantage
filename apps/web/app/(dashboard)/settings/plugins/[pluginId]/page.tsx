'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface PluginPermDef {
  key: string;
  label: string;
  defaultRoles: string[];
}

interface PluginSettingsField {
  key: string;
  label: string;
  type: 'text' | 'boolean' | 'number' | 'select';
  secret?: boolean;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

interface HubStat {
  contract: string;
  record_count: number;
  last_published_at: string | null;
}

interface PluginDetail {
  id: string;
  plugin_id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed_at: string;
  hub_stats?: HubStat[];
  manifest: {
    description?: string;
    icon?: string;
    author?: string;
    homepage?: string;
    host_version?: string;
    permissions?: PluginPermDef[];
    settings_schema?: PluginSettingsField[];
    provides?: Array<{ contract: string }>;
    consumes?: Array<{ contract: string; optional?: boolean }>;
  };
}

const CONTRACT_LABELS: Record<string, string> = {
  'crm.contact@v1': 'CRM contacts',
  'crm.company@v1': 'CRM companies',
  'crm.deal@v1': 'CRM deals',
  'crm.activity@v1': 'CRM activity',
};

function contractLabel(id: string): string {
  return CONTRACT_LABELS[id] ?? id;
}

export default function PluginSettingsPage() {
  const { pluginId } = useParams<{ pluginId: string }>();
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';

  const { data: plugin, isLoading } = useQuery({
    queryKey: ['plugin', pluginId],
    queryFn: async () => {
      const res = await apiFetch<{ data: PluginDetail; error: null }>(
        `/api/plugins/${pluginId}`,
        { token: await getToken() },
      );
      return res.data;
    },
  });

  const { data: settingsData } = useQuery({
    queryKey: ['plugin-settings', pluginId],
    queryFn: async () => {
      const res = await apiFetch<{ data: Record<string, unknown>; error: null }>(
        `/api/plugins/${pluginId}/settings`,
        { token: await getToken() },
      );
      return res.data ?? {};
    },
    enabled: !!plugin,
  });

  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!settingsData) return;
    // Do not seed secret fields into the editable form — their stored value is a
    // masked placeholder, which would block typing. Leave them blank; a blank
    // secret on save keeps the existing value.
    const secretKeys = new Set(
      (plugin?.manifest?.settings_schema ?? []).filter((f) => f.secret).map((f) => f.key),
    );
    const seeded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(settingsData)) {
      if (!secretKeys.has(k)) seeded[k] = v;
    }
    setFormValues(seeded);
  }, [settingsData, plugin]);

  const saveSettings = async () => {
    setSaving(true);
    setSaveError(null);
    setTestMsg(null);
    try {
      const schema = plugin?.manifest?.settings_schema ?? [];
      // Persist every schema field (default + edits), so visible defaults stick.
      // Skip secret fields the user left blank — that keeps the existing secret.
      const payload: Record<string, unknown> = {};
      for (const f of schema) {
        const edited = formValues[f.key];
        if (f.secret) {
          if (typeof edited === 'string' && edited.trim() !== '') payload[f.key] = edited;
        } else {
          payload[f.key] = edited ?? f.default;
        }
      }

      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/plugins/${pluginId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!res.ok || json?.error) {
        setSaveError(json?.error?.message ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['plugin-settings', pluginId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/plugins/route/${pluginId}/validate-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: '{}',
      });
      const text = await res.text();
      type ValidateResp = { ok?: boolean; message?: string; error?: { message?: string } };
      let parsed: ValidateResp | null = null;
      try { parsed = JSON.parse(text) as ValidateResp; } catch { /* non-JSON */ }
      if (!res.ok) {
        setTestMsg({ ok: false, text: parsed?.error?.message ?? `HTTP ${res.status}: ${text.slice(0, 160)}` });
      } else if (parsed?.ok) {
        setTestMsg({ ok: true, text: 'Connection OK — provider key works.' });
      } else {
        setTestMsg({ ok: false, text: parsed?.message ?? 'Connection failed.' });
      }
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading || !plugin) {
    return (
      <div style={{ maxWidth: 680 }}>
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  const schema = plugin.manifest?.settings_schema ?? [];

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13 }}>
        <Link href="/settings/plugins" style={{ color: 'var(--text2)', textDecoration: 'none' }}>
          ← Plugins
        </Link>
        <span style={{ color: 'var(--text3)' }}>/</span>
        <span style={{ fontWeight: 600 }}>{plugin.name}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>
        {/* Left: Plugin info */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'var(--surface2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--text2)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 7h2.5a1.5 1.5 0 0 1 0 3H14v3.5a1.5 1.5 0 0 1-3 0V14H7.5a1.5 1.5 0 0 1 0-3H11V7.5a2.5 2.5 0 0 0-5 0V7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2h.5a2.5 2.5 0 0 0 0-5H16V9a2 2 0 0 0-2-2z" />
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{plugin.name}</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                v{plugin.version} · {plugin.plugin_id}
              </p>
              {plugin.manifest?.host_version && (
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                  Requires host {plugin.manifest.host_version}
                </span>
              )}
            </div>
          </div>

          {plugin.manifest?.description && (
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 16px', lineHeight: 1.6 }}>
              {plugin.manifest.description}
            </p>
          )}

          {plugin.manifest?.author && (
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
              By {plugin.manifest.author}
              {plugin.manifest.homepage && (
                <span>
                  {' · '}
                  <a href={plugin.manifest.homepage} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>
                    Website
                  </a>
                </span>
              )}
            </p>
          )}

          {(plugin.manifest?.permissions?.length ?? 0) > 0 && (
            <div>
              <p
                style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '0 0 8px',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
              >
                Permissions
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {plugin.manifest.permissions!.map((perm) => (
                  <div
                    key={perm.key}
                    style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--green)', flexShrink: 0, display: 'inline-block',
                      }}
                    />
                    {perm.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {((plugin.manifest?.provides?.length ?? 0) > 0 || (plugin.manifest?.consumes?.length ?? 0) > 0) && (
            <div style={{ marginTop: 16 }}>
              <p
                style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '0 0 8px',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
              >
                Shares data
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(plugin.manifest?.provides ?? []).map((p) => {
                  const stat = (plugin.hub_stats ?? []).find((s) => s.contract === p.contract);
                  return (
                    <div key={`prov-${p.contract}`} style={{ fontSize: 12, color: 'var(--text2)' }}>
                      <span
                        style={{
                          display: 'inline-block', padding: '1px 7px', marginRight: 6,
                          borderRadius: 999, fontSize: 11, fontWeight: 600,
                          background: 'var(--green-bg)', color: 'var(--green)',
                        }}
                      >
                        Publishes
                      </span>
                      {contractLabel(p.contract)}
                      {stat && (
                        <span style={{ color: 'var(--text3)' }}>
                          {' · '}{stat.record_count.toLocaleString()} records
                          {stat.last_published_at
                            ? ` · last sync ${new Date(stat.last_published_at).toLocaleString()}`
                            : ' · never synced'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {(plugin.manifest?.consumes ?? []).map((c) => (
                  <div key={`cons-${c.contract}`} style={{ fontSize: 12, color: 'var(--text2)' }}>
                    <span
                      style={{
                        display: 'inline-block', padding: '1px 7px', marginRight: 6,
                        borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: 'var(--blue-bg)', color: 'var(--blue)',
                      }}
                    >
                      Reads
                    </span>
                    {contractLabel(c.contract)} from other plugins
                    {c.optional ? ' (optional)' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Settings form */}
        <div>
          {schema.length === 0 ? (
            <div
              style={{
                padding: '24px 16px', textAlign: 'center',
                border: '1px dashed var(--border)', borderRadius: 10,
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No configurable settings.</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 16px' }}>Settings</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {schema.map((field) => (
                  <SettingsFieldInput
                    key={field.key}
                    field={field}
                    value={formValues[field.key]}
                    onChange={(val) => setFormValues((prev) => ({ ...prev, [field.key]: val }))}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 500,
                    background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8,
                    cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
                </button>
                <button
                  onClick={testConnection}
                  disabled={testing}
                  title="Saves nothing — checks the configured provider key"
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 500,
                    background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
                    cursor: testing ? 'default' : 'pointer', opacity: testing ? 0.6 : 1,
                  }}
                >
                  {testing ? 'Testing…' : 'Test connection'}
                </button>
              </div>

              {saveError && (
                <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--red)' }}>{saveError}</p>
              )}
              {testMsg && (
                <p style={{ margin: '10px 0 0', fontSize: 12.5, color: testMsg.ok ? 'var(--green)' : 'var(--red)' }}>
                  {testMsg.ok ? '✓ ' : '✕ '}{testMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsFieldInput({
  field, value, onChange,
}: {
  field: PluginSettingsField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
  };

  if (field.type === 'boolean') {
    const checked = typeof value === 'boolean' ? value : (field.default as boolean | undefined) ?? false;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 13, color: 'var(--text)' }}>{field.label}</label>
        <button
          onClick={() => onChange(!checked)}
          style={{
            position: 'relative', width: 44, height: 24, borderRadius: 999,
            background: checked ? 'var(--green)' : 'var(--border)',
            border: 'none', cursor: 'pointer', transition: 'background .2s', flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute', top: 3,
              left: checked ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              transition: 'left .2s',
            }}
          />
        </button>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        <label style={labelStyle}>{field.label}</label>
        <select
          value={(value as string | undefined) ?? (field.default as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label style={labelStyle}>{field.label}</label>
      <input
        type={field.type === 'number' ? 'number' : field.secret ? 'password' : 'text'}
        value={(value as string | number | undefined) ?? (field.secret ? '' : (field.default as string | number | undefined) ?? '')}
        placeholder={field.secret ? 'Enter to set — leave blank to keep current' : undefined}
        min={field.min}
        max={field.max}
        autoComplete={field.secret ? 'new-password' : undefined}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}
