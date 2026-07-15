'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from '@vencore/api-client';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { Button } from '@/modules/shared/components/ui/Button';
import { Input, FormField } from '@/modules/shared/components/ui/FormField';

export default function WorkspacePage() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => getMe(await getToken()),
  });

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dataSharing, setDataSharing] = useState(true);
  const [togglingSharing, setTogglingSharing] = useState(false);

  useEffect(() => {
    if (data?.data.workspace) {
      setName(data.data.workspace.name);
      setDomain(data.data.workspace.domain ?? '');
      setDataSharing(data.data.workspace.plugin_data_sharing ?? true);
    }
  }, [data?.data.workspace]);

  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/workspace', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), domain: domain.trim() || null }),
        token,
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
    } catch {
      setError('Could not save workspace settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleDataSharing() {
    const next = !dataSharing;
    setTogglingSharing(true);
    setDataSharing(next);
    try {
      const token = await getToken();
      await apiFetch('/api/workspace', {
        method: 'PATCH',
        body: JSON.stringify({ plugin_data_sharing: next }),
        token,
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch {
      setDataSharing(!next);
      setError('Could not update plugin data sharing.');
    } finally {
      setTogglingSharing(false);
    }
  }

  const unchanged = name === (data?.data.workspace.name ?? '') && domain === (data?.data.workspace.domain ?? '');

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Workspace</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Settings for your entire workspace.</p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
        <FormField label="Workspace name">
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={255} />
        </FormField>
        <FormField label="Domain" error={error ?? undefined}>
          <Input value={domain} onChange={e => setDomain(e.target.value)} maxLength={255} placeholder="acme.com" />
        </FormField>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" onClick={() => void handleSave()} disabled={isSaving || !name.trim() || unchanged}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Plugin data sharing</p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              Lets installed plugins publish and read shared data (contacts, deals, companies)
              through the data hub. Turning this off blocks all cross-plugin data access.
            </p>
          </div>
          <button
            onClick={() => void toggleDataSharing()}
            disabled={togglingSharing}
            aria-label="Toggle plugin data sharing"
            style={{
              position: 'relative', width: 44, height: 24, borderRadius: 999, flexShrink: 0,
              background: dataSharing ? 'var(--green)' : 'var(--border)',
              border: 'none', cursor: togglingSharing ? 'default' : 'pointer', transition: 'background .2s',
              opacity: togglingSharing ? 0.6 : 1,
            }}
          >
            <span
              style={{
                position: 'absolute', top: 3, left: dataSharing ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left .2s',
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
