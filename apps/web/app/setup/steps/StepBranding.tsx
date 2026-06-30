'use client';

import { useEffect, useState } from 'react';
import type { SetupState, WizardAction } from '../types';
import { Dropzone } from '@/modules/shared/components/ui/Dropzone';

type Props = {
  state: SetupState;
  dispatch: React.Dispatch<WizardAction>;
  validateRef: React.MutableRefObject<() => boolean>;
  onValidChange: (valid: boolean) => void;
};

const SWATCHES = ['#0b1330', '#1e3a8a', '#2d6a4f', '#92400e', '#991b1b', '#4c1d95', '#0f766e', '#1a1814'];

export function StepBranding({ state, dispatch, validateRef, onValidChange }: Props) {
  const { branding } = state;
  const [touched, setTouched] = useState(false);

  const nameValid = branding.name.trim().length > 0;

  useEffect(() => {
    validateRef.current = () => {
      setTouched(true);
      return nameValid;
    };
    return () => { validateRef.current = () => true; };
  }, [nameValid, validateRef]);

  useEffect(() => {
    onValidChange(nameValid);
  }, [nameValid, onValidChange]);

  const set = (partial: Partial<SetupState['branding']>) =>
    dispatch({ type: 'SET_BRANDING', value: { ...branding, ...partial } });

  return (
    <div data-step-id="branding">
      <h2 style={heading}>Branding</h2>
      <p style={subtext}>Customize how your Vencore instance looks.</p>

      <div className="setup-branding-cols" style={{ display: 'flex', gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, minWidth: 0 }}>
          <Field label="App name" htmlFor="branding-name" required>
            <div style={{ position: 'relative' }}>
              <input
                id="branding-name"
                style={input}
                value={branding.name}
                onChange={e => set({ name: e.target.value })}
                onBlur={() => setTouched(true)}
                placeholder="Acme CRM"
              />
              {nameValid && <ValidCheck />}
            </div>
            {touched && !nameValid && <p style={fieldError}>App name is required.</p>}
          </Field>

          <Dropzone
            label="Logo"
            hint="Drag & drop an image, or click to browse"
            value={branding.logoUrl.startsWith('data:') ? branding.logoUrl : ''}
            onChange={dataUrl => set({ logoUrl: dataUrl })}
            onRemove={() => set({ logoUrl: '/logo.png' })}
          />
          {!branding.logoUrl.startsWith('data:') && (
            <input
              style={input}
              value={branding.logoUrl}
              onChange={e => set({ logoUrl: e.target.value })}
              placeholder="/logo.png or https://..."
              aria-label="Logo URL"
            />
          )}

          <Dropzone
            label="Favicon"
            hint="Optional — 32×32 or 64×64 PNG/ICO"
            accept="image/*,.ico"
            value={branding.faviconUrl}
            onChange={dataUrl => set({ faviconUrl: dataUrl })}
            onRemove={() => set({ faviconUrl: '' })}
            previewHeight={36}
          />

          <Field label="Primary brand color" htmlFor="branding-color-hex">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <input
                type="color"
                aria-label="Pick custom color"
                value={branding.primaryColor}
                onChange={e => set({ primaryColor: e.target.value })}
                style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }}
              />
              <input
                id="branding-color-hex"
                style={{ ...input, width: 110 }}
                value={branding.primaryColor}
                onChange={e => set({ primaryColor: e.target.value })}
                placeholder="#0b1330"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {SWATCHES.map(swatch => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Use color ${swatch}`}
                  onClick={() => set({ primaryColor: swatch })}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', background: swatch,
                    border: branding.primaryColor.toLowerCase() === swatch ? '2px solid var(--text)' : '2px solid var(--border)',
                    cursor: 'pointer', padding: 0,
                    transform: branding.primaryColor.toLowerCase() === swatch ? 'scale(1.12)' : 'scale(1)',
                    transition: 'transform var(--motion-fast) var(--motion-ease), border-color var(--motion-fast) var(--motion-ease)',
                  }}
                />
              ))}
            </div>
          </Field>

          <Field label="Tagline" htmlFor="branding-tagline" hint="Optional — shown on login page">
            <input
              id="branding-tagline"
              style={input}
              value={branding.tagline}
              onChange={e => set({ tagline: e.target.value })}
              placeholder="One platform to run your business."
            />
          </Field>
        </div>

        <div className="setup-branding-preview" style={{ flex: '0 0 260px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Live preview
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
            <div style={{ height: 4, background: branding.primaryColor }} />
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={branding.logoUrl} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4 }} onError={e => (e.currentTarget.style.visibility = 'hidden')} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {branding.name || 'Your App Name'}
              </span>
            </div>
            {branding.tagline && (
              <div style={{ padding: '0 16px 14px', fontSize: 12, color: 'var(--text2)' }}>{branding.tagline}</div>
            )}
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{
                padding: '7px 0', textAlign: 'center', borderRadius: 6,
                background: branding.primaryColor, color: '#fff', fontSize: 12, fontWeight: 600,
              }}>
                Sign in
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidCheck() {
  return (
    <span style={{
      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
      color: 'var(--green)', fontSize: 13, fontWeight: 700, animation: 'widgetIn .15s ease both',
    }}>
      ✓
    </span>
  );
}

function Field({ label, hint, children, htmlFor, required }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: hint ? 2 : 6 }}>
        {label}{required && ' *'}
      </label>
      {hint && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 6px' }}>{hint}</p>}
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const fieldError: React.CSSProperties = { fontSize: 12, color: 'var(--red)', margin: '4px 0 0' };
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
