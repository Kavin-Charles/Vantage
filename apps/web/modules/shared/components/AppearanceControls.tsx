'use client';

import { PRESETS } from '@vencore/config';
import { Dropzone } from '@/modules/shared/components/ui/Dropzone';

export interface AppearanceValues {
  accentColor: string;
  preset: string;
  radius: 'sharp' | 'rounded' | 'pill';
  density: 'comfortable' | 'compact';
  sidebarStyle: 'light' | 'dark' | 'brand';
  login: {
    background: string | null;
    backgroundImage: string | null;
  };
}

export interface AppearanceControlsProps {
  value: AppearanceValues;
  onChange: (partial: Partial<AppearanceValues>) => void;
  disabled?: boolean;
}

const SWATCHES = ['#0b1330', '#1e3a8a', '#2d6a4f', '#92400e', '#991b1b', '#4c1d95', '#0f766e', '#1a1814'];

const RADIUS_OPTIONS = [
  { id: 'sharp', label: 'Sharp' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'pill', label: 'Pill' },
] as const;

const DENSITY_OPTIONS = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
] as const;

const SIDEBAR_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'brand', label: 'Brand' },
] as const;

export function AppearanceControls({ value, onChange, disabled }: AppearanceControlsProps) {
  const { accentColor, preset, radius, density, sidebarStyle, login } = value;

  const setLogin = (partial: Partial<AppearanceValues['login']>) =>
    onChange({ login: { ...login, ...partial } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section label="Preset" hint="Start from a preset, then customize below.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
          {PRESETS.map(p => {
            const selected = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ accentColor: p.seed, preset: p.id, ...(p.sidebarStyle ? { sidebarStyle: p.sidebarStyle } : {}) })}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: selected ? '1px solid var(--text)' : '1px solid var(--border)',
                  background: selected ? 'var(--surface2)' : 'var(--surface)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  transition: 'all .15s',
                }}
              >
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.seed, border: '2px solid var(--border)' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Accent color" hint="Used for buttons, links, and highlights.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <input
            type="color"
            aria-label="Pick custom accent color"
            value={accentColor}
            disabled={disabled}
            onChange={e => onChange({ accentColor: e.target.value, preset: 'custom' })}
            style={{ width: 40, height: 32, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 4 }}
          />
          <input
            aria-label="Accent color hex value"
            value={accentColor}
            disabled={disabled}
            onChange={e => onChange({ accentColor: e.target.value, preset: 'custom' })}
            style={{
              width: 110,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
            placeholder="#0b1330"
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {SWATCHES.map(swatch => (
            <button
              key={swatch}
              type="button"
              aria-label={`Use color ${swatch}`}
              disabled={disabled}
              onClick={() => onChange({ accentColor: swatch, preset: 'custom' })}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: swatch,
                border: accentColor.toLowerCase() === swatch ? '2px solid var(--text)' : '2px solid var(--border)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                padding: 0,
                transform: accentColor.toLowerCase() === swatch ? 'scale(1.12)' : 'scale(1)',
                transition: 'transform .15s, border-color .15s',
              }}
            />
          ))}
        </div>
      </Section>

      <ToggleRow
        label="Corner radius"
        description="Shape of buttons, cards, and inputs."
        options={RADIUS_OPTIONS}
        selected={radius}
        disabled={disabled}
        onSelect={id => onChange({ radius: id })}
      />

      <ToggleRow
        label="Density"
        description="Spacing used throughout the app."
        options={DENSITY_OPTIONS}
        selected={density}
        disabled={disabled}
        onSelect={id => onChange({ density: id })}
      />

      <ToggleRow
        label="Sidebar style"
        description="Background treatment for the navigation sidebar."
        options={SIDEBAR_OPTIONS}
        selected={sidebarStyle}
        disabled={disabled}
        onSelect={id => onChange({ sidebarStyle: id })}
      />

      <Section
        label="Login page background"
        hint="If an image is set, it takes precedence over the background color."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <input
            type="color"
            aria-label="Pick login background color"
            value={login.background ?? '#ffffff'}
            disabled={disabled}
            onChange={e => setLogin({ background: e.target.value })}
            style={{ width: 40, height: 32, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 4 }}
          />
          <input
            aria-label="Login background color hex value"
            value={login.background ?? ''}
            disabled={disabled}
            onChange={e => setLogin({ background: e.target.value || null })}
            style={{
              width: 110,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
            placeholder="#f7f6f2"
          />
          {login.background && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setLogin({ background: null })}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text2)',
                fontSize: 12,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>

        <Dropzone
          label="Background image"
          hint="Optional — shown behind the login card, overrides the color above"
          value={login.backgroundImage ?? ''}
          onChange={dataUrl => setLogin({ backgroundImage: dataUrl })}
          onRemove={() => setLogin({ backgroundImage: null })}
          previewHeight={56}
        />
      </Section>
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</p>
      {hint && <p style={{ margin: '2px 0 10px', fontSize: 12, color: 'var(--text3)' }}>{hint}</p>}
      {children}
    </div>
  );
}

function ToggleRow<T extends string>({
  label,
  description,
  options,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  description: string;
  options: readonly { id: T; label: string }[];
  selected: T;
  disabled?: boolean;
  onSelect: (id: T) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>{description}</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {options.map(option => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option.id)}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: isSelected ? '1px solid var(--text)' : '1px solid var(--border)',
                background: isSelected ? 'var(--text)' : 'var(--surface)',
                color: isSelected ? 'var(--bg)' : 'var(--text)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 500,
                opacity: disabled ? 0.6 : 1,
                transition: 'all .15s',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
