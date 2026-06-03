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

interface PluginDetail {
  id: string;
  plugin_id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed_at: string;
  manifest: {
    description?: string;
    icon?: string;
    author?: string;
    homepage?: string;
    permissions?: PluginPermDef[];
    settings_schema?: PluginSettingsField[];
  };
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

  useEffect(() => {
    if (settingsData) setFormValues(settingsData);
  }, [settingsData]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/plugins/${pluginId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(formValues),
      });
      await queryClient.invalidateQueries({ queryKey: ['plugin-settings', pluginId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !plugin) {
    return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
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
                alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}
            >
              📦
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{plugin.name}</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                v{plugin.version} · {plugin.plugin_id}
              </p>
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
                <>
                  {' · '}
                  <a href={plugin.manifest.homepage} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>
                    Website
                  </a>
                </>
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
              <button
                onClick={saveSettings}
                disabled={saving}
                style={{
                  marginTop: 20, padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8,
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
              </button>
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
        value={field.secret ? '' : ((value as string | number | undefined) ?? (field.default as string | number | undefined) ?? '')}
        placeholder={field.secret ? '••••••••' : undefined}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}
