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

  useEffect(() => {
    if (data?.data.workspace) {
      setName(data.data.workspace.name);
      setDomain(data.data.workspace.domain ?? '');
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
    </div>
  );
}
