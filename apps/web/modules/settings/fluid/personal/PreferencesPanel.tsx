'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useTheme } from '@/modules/shared/contexts/ThemeContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { GlassCard, PageHeader, FluidSelect, FluidButton, MSIcon } from '@/modules/shared/fluid/ui';

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontFamily: 'var(--fl-font-body)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fl-on-surface-variant)',
};

const LANDING_PAGE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Dashboard', value: '/dashboard' },
  { label: 'Contacts', value: '/crm/contacts' },
  { label: 'Pipeline', value: '/crm/pipeline' },
  { label: 'Activity', value: '/activity' },
  { label: 'Infra', value: '/infra' },
];

/**
 * Personal "Preferences" settings panel — registered into the Foundation
 * settings registry (personal scope). Takes no props; mounted directly by
 * apps/web/app/(fluid)/settings/preferences/page.tsx.
 */
export function PreferencesPanel() {
  const { user, isLoading, refetch } = useAuth();
  const { theme, setTheme } = useTheme();
  const getToken = useApiToken();

  const [landingPage, setLandingPage] = useState(LANDING_PAGE_OPTIONS[0]!.value);
  // Tracks the last user.default_landing_page we synced `landingPage` from,
  // so the prefill only re-runs when the source value actually changes (e.g.
  // after a refetch) — adjusting state during render per React's guidance,
  // instead of doing it in an effect.
  const [syncedLandingPage, setSyncedLandingPage] = useState<string | null | undefined>(undefined);
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [isSavingLanding, setIsSavingLanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (user && user.default_landing_page && user.default_landing_page !== syncedLandingPage) {
    setSyncedLandingPage(user.default_landing_page);
    setLandingPage(user.default_landing_page);
  }

  // Ensure default_landing_page is populated even if the user object in the
  // store was set by the login flow before that field existed on it (see
  // AuthContext.fetchUser).
  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleThemeChange(next: 'light' | 'dark') {
    if (next === theme) return;
    setIsSavingTheme(true);
    setError(null);
    try {
      await setTheme(next);
    } catch {
      setError('Could not save your theme preference. It will reset on next reload.');
    } finally {
      setIsSavingTheme(false);
    }
  }

  async function handleSaveLandingPage() {
    setIsSavingLanding(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ default_landing_page: landingPage }),
        token,
      });
      await refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not save your default landing page. Please try again.');
    } finally {
      setIsSavingLanding(false);
    }
  }

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
        <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>Could not load your preferences.</p>
      </GlassCard>
    );
  }

  return (
    <>
      <PageHeader title="Preferences" subtitle="Personalize how Vencore behaves for you." />
      <GlassCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 420 }}>
          <div>
            <label style={LABEL_STYLE}>Theme</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['light', 'dark'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  disabled={isSavingTheme}
                  onClick={() => void handleThemeChange(option)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 'var(--fl-radius-pill)',
                    border: theme === option ? '1px solid transparent' : '1px solid var(--fl-outline-variant)',
                    background: theme === option ? 'var(--fl-primary)' : 'var(--fl-surface-container-lowest)',
                    color: theme === option ? 'var(--fl-on-primary)' : 'var(--fl-on-surface)',
                    cursor: isSavingTheme ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--fl-font-body)',
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    opacity: isSavingTheme ? 0.6 : 1,
                    transition: 'all .15s',
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Default landing page</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FluidSelect value={landingPage} onChange={setLandingPage} options={LANDING_PAGE_OPTIONS} />
              <FluidButton
                onClick={() => void handleSaveLandingPage()}
                disabled={isSavingLanding || landingPage === (user.default_landing_page ?? LANDING_PAGE_OPTIONS[0]!.value)}
                icon="save"
              >
                {isSavingLanding ? 'Saving…' : 'Save'}
              </FluidButton>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>Where you land after signing in.</p>
          </div>

          {saved ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fl-font-body)', fontSize: 13, color: 'var(--fl-primary)' }}>
              <MSIcon name="check_circle" size={16} /> Saved
            </span>
          ) : null}
          {error ? <p style={{ margin: 0, fontSize: 12, color: 'var(--fl-error)' }}>{error}</p> : null}
        </div>
      </GlassCard>
    </>
  );
}
