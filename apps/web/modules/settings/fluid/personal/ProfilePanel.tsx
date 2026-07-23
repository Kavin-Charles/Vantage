'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { GlassCard, PageHeader, FluidInput, FluidButton, FluidBadge, Avatar, MSIcon } from '@/modules/shared/fluid/ui';

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontFamily: 'var(--fl-font-body)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fl-on-surface-variant)',
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 0',
  borderTop: '1px solid var(--fl-outline-variant)',
};

/**
 * Personal "Profile" settings panel — registered into the Foundation
 * settings registry (personal scope). Takes no props; mounted directly by
 * apps/web/app/(fluid)/settings/profile/page.tsx.
 *
 * There is no avatar-upload endpoint in this codebase, so the avatar is
 * display-only (initials via the Avatar primitive).
 */
export function ProfilePanel() {
  const { user, isLoading, refetch } = useAuth();
  const getToken = useApiToken();

  const [name, setName] = useState('');
  // Tracks the last user.name we synced `name` from, so the prefill only
  // re-runs when the source value actually changes (e.g. after a refetch) —
  // adjusting state during render per React's guidance, instead of doing it
  // in an effect (which would fire an extra, unnecessary re-render).
  const [syncedName, setSyncedName] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (user && user.name !== syncedName) {
    setSyncedName(user.name);
    setName(user.name);
  }

  // Ensure workspaceId/default_landing_page are populated even if the user
  // object in the store was set by the login flow before those fields existed
  // on it (see AuthContext.fetchUser).
  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <GlassCard>
        <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>Loading…</p>
      </GlassCard>
    );
  }

  if (!user) {
    return (
      <GlassCard>
        <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>Could not load your profile.</p>
      </GlassCard>
    );
  }

  async function handleSave() {
    if (!name.trim() || !user) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/me', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }), token });
      await refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not save your name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyWorkspaceId() {
    if (!user?.workspaceId) return;
    await navigator.clipboard.writeText(user.workspaceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account details." />
      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Avatar name={user.name} size={56} />
          <div>
            <div style={{ fontFamily: 'var(--fl-font-display)', fontSize: 20, fontWeight: 600, color: 'var(--fl-on-surface)' }}>
              {user.name}
            </div>
            <div style={{ marginTop: 4 }}>
              <FluidBadge tone={user.isAdmin ? 'blue' : 'neutral'}>{user.isAdmin ? 'Admin' : 'Member'}</FluidBadge>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
          <div>
            <label style={LABEL_STYLE}>Full name</label>
            <FluidInput value={name} onChange={setName} icon="badge" placeholder="Your name" />
            {error ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--fl-error)' }}>{error}</p> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FluidButton onClick={() => void handleSave()} disabled={isSaving || !name.trim() || name === user.name} icon="save">
              {isSaving ? 'Saving…' : 'Save'}
            </FluidButton>
            {saved ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fl-font-body)', fontSize: 13, color: 'var(--fl-primary)' }}>
                <MSIcon name="check_circle" size={16} /> Saved
              </span>
            ) : null}
          </div>

          <div style={{ marginTop: 4 }}>
            <div style={ROW_STYLE}>
              <span style={{ fontSize: 12, color: 'var(--fl-outline)', fontWeight: 500 }}>Email</span>
              <span style={{ fontSize: 13, color: 'var(--fl-on-surface)' }}>{user.email}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={{ fontSize: 12, color: 'var(--fl-outline)', fontWeight: 500 }}>Workspace ID</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--fl-on-surface)' }}>
                  {user.workspaceId ?? '—'}
                </span>
                <button
                  type="button"
                  title="Copy workspace ID"
                  disabled={!user.workspaceId}
                  onClick={() => void handleCopyWorkspaceId()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    cursor: user.workspaceId ? 'pointer' : 'not-allowed',
                    color: copied ? 'var(--fl-primary)' : 'var(--fl-outline)',
                    padding: 2,
                  }}
                >
                  <MSIcon name={copied ? 'check' : 'content_copy'} size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </>
  );
}
