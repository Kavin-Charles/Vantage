'use client';

import { useState } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepBranding({ state, dispatch }: Props) {
  const { branding } = state;
  const [error, setError] = useState('');

  const set = (partial: Partial<SetupState['branding']>) =>
    dispatch({ type: 'SET_BRANDING', value: { ...branding, ...partial } });

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set({ logoUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleFaviconFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set({ faviconUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div data-step-id="branding">
      <h2 style={heading}>Branding</h2>
      <p style={subtext}>Customize how your Vencore instance looks.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="App name *">
          <input
            style={input}
            value={branding.name}
            onChange={e => set({ name: e.target.value })}
            placeholder="Acme CRM"
          />
        </Field>

        <Field label="Logo" hint="Upload an image or paste a URL">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {branding.logoUrl && !branding.logoUrl.startsWith('data:') && (
              <img src={branding.logoUrl} alt="logo preview" style={{ height: 40, borderRadius: 4, border: '1px solid var(--border)' }} />
            )}
            <input type="file" accept="image/*" onChange={handleLogoFile} style={{ fontSize: 13 }} />
          </div>
          <input
            style={{ ...input, marginTop: 8 }}
            value={branding.logoUrl.startsWith('data:') ? '' : branding.logoUrl}
            onChange={e => set({ logoUrl: e.target.value })}
            placeholder="/logo.png or https://..."
          />
        </Field>

        <Field label="Favicon" hint="Optional — 32×32 or 64×64 PNG/ICO">
          <input type="file" accept="image/*,.ico" onChange={handleFaviconFile} style={{ fontSize: 13 }} />
        </Field>

        <Field label="Primary brand color">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="color"
              value={branding.primaryColor}
              onChange={e => set({ primaryColor: e.target.value })}
              style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }}
            />
            <input
              style={{ ...input, width: 110 }}
              value={branding.primaryColor}
              onChange={e => set({ primaryColor: e.target.value })}
              placeholder="#0b1330"
            />
          </div>
        </Field>

        <Field label="Tagline" hint="Optional — shown on login page">
          <input
            style={input}
            value={branding.tagline}
            onChange={e => set({ tagline: e.target.value })}
            placeholder="One platform to run your business."
          />
        </Field>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: hint ? 2 : 6 }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 6px' }}>{hint}</p>}
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'IBM Plex Sans, sans-serif',
  boxSizing: 'border-box',
};
