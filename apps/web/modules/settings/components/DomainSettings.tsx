'use client';

import React, { useEffect, useState } from 'react';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

interface ContributedField {
  key: string;
  type: 'text' | 'boolean' | 'number' | 'select';
  label: string;
  options?: string[];
  min?: number;
  max?: number;
  secret?: boolean;
  shared?: boolean;
  value: unknown;
}

interface ContributedSection {
  plugin_id: string;
  plugin_name: string;
  section: string;
  label: string;
  fields: ContributedField[];
}

/**
 * Renders settings sections contributed by installed plugins for a domain.
 * With no plugins installed this renders an empty-state note, so core domain
 * settings pages look identical to before.
 */
export function DomainSettings({ domain }: { domain: string }) {
  const getToken = useApiToken();
  const apiUrl = (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ?? '';
  const [sections, setSections] = useState<ContributedSection[]>([]);
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/api/settings/domain/${domain}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        const json = (await res.json()) as { data?: { sections?: ContributedSection[] } };
        if (!active) return;
        const secs = json.data?.sections ?? [];
        setSections(secs);
        const seeded: Record<string, Record<string, unknown>> = {};
        for (const s of secs) {
          seeded[s.plugin_id] ??= {};
          for (const f of s.fields) seeded[s.plugin_id]![f.key] = f.value;
        }
        setValues(seeded);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [domain, apiUrl, getToken]);

  async function save(pluginId: string) {
    setSavingId(pluginId);
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/settings/domain/${domain}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ plugin_id: pluginId, values: values[pluginId] ?? {} }),
      });
      setSavedId(pluginId);
      setTimeout(() => setSavedId(null), 2000);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  if (sections.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No plugin settings for this domain.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sections.map((s) => (
        <div key={`${s.plugin_id}:${s.section}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{s.label}</p>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{s.plugin_name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {s.fields.map((f) => {
              const v = values[s.plugin_id]?.[f.key];
              const set = (val: unknown) => setValues((prev) => ({ ...prev, [s.plugin_id]: { ...prev[s.plugin_id], [f.key]: val } }));
              return (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
                    {f.label}{f.shared && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>shared</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select value={String(v ?? '')} onChange={(e) => set(e.target.value)} style={inputStyle}>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'boolean' ? (
                    <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : f.secret ? 'password' : 'text'}
                      value={String(v ?? '')}
                      min={f.min} max={f.max}
                      onChange={(e) => set(f.type === 'number' ? Number(e.target.value) : e.target.value)}
                      style={inputStyle}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => void save(s.plugin_id)}
              disabled={savingId === s.plugin_id}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              {savingId === s.plugin_id ? 'Saving…' : 'Save'}
            </button>
            {savedId === s.plugin_id && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
};
