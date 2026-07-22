'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/modules/shared/contexts/ThemeContext';
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu';
import { settingRowMenu } from '@/modules/shared/lib/settingsMenu';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useConfig } from '@/modules/shared/lib/useConfig';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { AppearanceControls, type AppearanceValues } from '@/modules/shared/components/AppearanceControls';

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  async function handleToggle(next: 'light' | 'dark') {
    if (next === theme) return;
    setIsSaving(true);
    setError(null);
    try {
      await setTheme(next);
    } catch {
      setError('Could not save your theme preference. It will reset on next reload.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Appearance</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Choose how Vencore looks on this device.</p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
        <div
          onContextMenu={e => openMenu(e, settingRowMenu({ label: 'Theme', value: theme, onReset: () => void handleToggle('light') }))}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Theme</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>Light or dark interface.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['light', 'dark'] as const).map(option => (
              <button
                key={option}
                disabled={isSaving}
                onClick={() => void handleToggle(option)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  border: theme === option ? '1px solid var(--text)' : '1px solid var(--border)',
                  background: theme === option ? 'var(--text)' : 'var(--surface)',
                  color: theme === option ? 'var(--bg)' : 'var(--text)',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  textTransform: 'capitalize',
                  opacity: isSaving ? 0.6 : 1,
                  transition: 'all .15s',
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>{error}</p>}
      </div>

      <BrandAppearanceSection />

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}

function BrandAppearanceSection() {
  const { user } = useAuth();
  const { data: config } = useConfig();
  const getToken = useApiToken();
  const router = useRouter();

  const [values, setValues] = useState<AppearanceValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config?.app.appearance) {
      const { accentColor, preset, radius, density, sidebarStyle, login } = config.app.appearance;
      setValues({ accentColor, preset, radius, density, sidebarStyle, login });
    }
  }, [config]);

  if (!user?.isAdmin) return null;

  function handleChange(partial: Partial<AppearanceValues>) {
    setSaved(false);
    setValues(current => (current ? { ...current, ...partial } : current));
  }

  async function handleSave() {
    if (!values) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/config', {
        method: 'PATCH',
        body: JSON.stringify({ appearance: values }),
        token,
      });
      setSaved(true);
      router.refresh();
    } catch {
      setError('Could not save brand appearance. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Brand appearance</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text2)' }}>
        Customize the accent color, shape, and layout for everyone in this workspace.
      </p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
        {values ? (
          <AppearanceControls value={values} onChange={handleChange} disabled={isSaving} />
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Loading current appearance…</p>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 16 }}>{error}</p>}
        {saved && !error && <p style={{ fontSize: 12, color: 'var(--green)', marginTop: 16 }}>Saved.</p>}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={isSaving || !values}
            onClick={() => void handleSave()}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid var(--text)',
              background: 'var(--text)',
              color: 'var(--bg)',
              cursor: isSaving || !values ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 500,
              opacity: isSaving || !values ? 0.6 : 1,
              transition: 'all .15s',
            }}
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
