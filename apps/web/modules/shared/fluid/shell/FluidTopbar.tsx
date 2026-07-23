'use client';
import { useState } from 'react';
import { useTheme } from '@/modules/shared/contexts/ThemeContext';
import { MSIcon, FluidInput, FluidButton } from '@/modules/shared/fluid/ui';

export function FluidTopbar() {
  const { theme, setTheme } = useTheme();
  const [q, setQ] = useState('');
  return (
    <header
      className="glass-panel"
      style={{
        position: 'fixed', top: 16, left: 104, right: 16, zIndex: 30, height: 56,
        borderRadius: 'var(--fl-radius-pill)', display: 'flex', alignItems: 'center',
        gap: 16, padding: '0 20px',
      }}
    >
      <div style={{ flex: 1, maxWidth: 420 }}>
        <FluidInput value={q} onChange={setQ} placeholder="Search…" icon="search" />
      </div>
      <div style={{ flex: 1 }} />
      <button
        aria-label="Toggle theme"
        onClick={() => { void setTheme(theme === 'dark' ? 'light' : 'dark'); }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 8 }}
      >
        <MSIcon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={22} />
      </button>
      <button aria-label="Notifications" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 8 }}>
        <MSIcon name="notifications" size={22} />
      </button>
      <FluidButton icon="add" onClick={() => { /* quick-add wired in spec 2 */ }}>New</FluidButton>
    </header>
  );
}
