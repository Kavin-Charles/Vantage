'use client';

import { useState } from 'react';
import { useTheme } from '@/modules/shared/contexts/ThemeContext';
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu';
import { settingRowMenu } from '@/modules/shared/lib/settingsMenu';

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
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
