'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from '@vencore/api-client';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { GlassCard, PageHeader, FluidInput, FluidButton, MSIcon } from '@/modules/shared/fluid/ui';

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontFamily: 'var(--fl-font-body)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fl-on-surface-variant)',
};

/**
 * Workspace settings panel — registered into the Foundation settings
 * registry (workspace scope, admin-only). Takes no props; mounted directly
 * by apps/web/app/(fluid)/settings/workspace/page.tsx.
 *
 * Reuses the exact backend surface as the legacy
 * apps/web/app/(dashboard)/settings/workspace/page.tsx it replaces:
 *   - GET /api/me            → workspace name/domain/plugin_data_sharing
 *   - PATCH /api/workspace    → { name, domain } and/or { plugin_data_sharing }
 *
 * There is no per-workspace branding/white-label edit endpoint in this
 * codebase — app branding (logo, favicon, primary color) is a one-time,
 * instance-wide value set by the installer (apps/web/app/setup) and only
 * exposed read-only via GET /api/config afterward. So there is nothing
 * branding-related to reuse or restyle here; this panel intentionally
 * covers only the fields the legacy page actually edited.
 */
export function WorkspacePanel() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: async () => getMe(await getToken()),
  });

  const workspace = data?.data.workspace;

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  // Tracks the last workspace we synced name/domain from, so the prefill
  // only re-runs when the source value actually changes — mirrors the
  // pattern used by ProfilePanel for the same reason (adjust state during
  // render instead of in an effect).
  const [syncedWorkspaceId, setSyncedWorkspaceId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [togglingSharing, setTogglingSharing] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  // Optimistic override for the sharing toggle; cleared once it matches the
  // server value again (including on rollback after a failed save).
  const [sharingOverride, setSharingOverride] = useState<boolean | null>(null);

  if (workspace && workspace.id !== syncedWorkspaceId) {
    setSyncedWorkspaceId(workspace.id);
    setName(workspace.name);
    setDomain(workspace.domain ?? '');
  }

  if (isLoading) {
    return (
      <GlassCard>
        <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>Loading…</p>
      </GlassCard>
    );
  }

  if (isError || !workspace) {
    return (
      <GlassCard>
        <p style={{ fontSize: 13, color: 'var(--fl-error)' }}>Could not load workspace settings.</p>
      </GlassCard>
    );
  }

  const dataSharing = sharingOverride ?? workspace.plugin_data_sharing ?? true;
  const unchanged = name === workspace.name && domain === (workspace.domain ?? '');

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
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not save workspace settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleDataSharing() {
    const next = !dataSharing;
    setTogglingSharing(true);
    setSharingError(null);
    setSharingOverride(next);
    try {
      const token = await getToken();
      await apiFetch('/api/workspace', {
        method: 'PATCH',
        body: JSON.stringify({ plugin_data_sharing: next }),
        token,
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setSharingOverride(null);
    } catch {
      setSharingOverride(!next);
      setSharingError('Could not update plugin data sharing.');
    } finally {
      setTogglingSharing(false);
    }
  }

  return (
    <>
      <PageHeader title="Workspace" subtitle="Settings for your entire workspace." />

      <GlassCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
          <div>
            <label style={LABEL_STYLE}>Workspace name</label>
            <FluidInput value={name} onChange={setName} icon="domain" placeholder="Acme Inc." />
          </div>
          <div>
            <label style={LABEL_STYLE}>Domain</label>
            <FluidInput value={domain} onChange={setDomain} icon="language" placeholder="acme.com" />
            {error ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--fl-error)' }}>{error}</p> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FluidButton onClick={() => void handleSave()} disabled={isSaving || !name.trim() || unchanged} icon="save">
              {isSaving ? 'Saving…' : 'Save'}
            </FluidButton>
            {saved ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fl-font-body)', fontSize: 13, color: 'var(--fl-primary)' }}>
                <MSIcon name="check_circle" size={16} /> Saved
              </span>
            ) : null}
          </div>
        </div>
      </GlassCard>

      <GlassCard style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--fl-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--fl-on-surface)' }}>
              Plugin data sharing
            </p>
            <p style={{ margin: '4px 0 0', fontFamily: 'var(--fl-font-body)', fontSize: 12.5, color: 'var(--fl-on-surface-variant)', lineHeight: 1.5 }}>
              Lets installed plugins publish and read shared data (contacts, deals, companies)
              through the data hub. Turning this off blocks all cross-plugin data access.
            </p>
            {sharingError ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--fl-error)' }}>{sharingError}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => void toggleDataSharing()}
            disabled={togglingSharing}
            aria-label="Toggle plugin data sharing"
            style={{
              position: 'relative', width: 44, height: 24, borderRadius: 'var(--fl-radius-pill)', flexShrink: 0,
              background: dataSharing ? 'var(--fl-primary)' : 'var(--fl-outline-variant)',
              border: 'none', cursor: togglingSharing ? 'default' : 'pointer', transition: 'background .2s',
              opacity: togglingSharing ? 0.6 : 1,
            }}
          >
            <span
              style={{
                position: 'absolute', top: 3, left: dataSharing ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: 'var(--fl-on-primary)',
                transition: 'left .2s',
              }}
            />
          </button>
        </div>
      </GlassCard>
    </>
  );
}
