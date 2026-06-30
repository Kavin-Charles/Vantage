'use client';

import { useState, useEffect } from 'react';
import type { SetupState, WizardAction } from '../types';
import { PasswordStrengthMeter } from '@/modules/shared/components/ui/PasswordStrength';
import { Icon } from '@/modules/shared/components/ui/Icon';

type Props = {
  state: SetupState;
  dispatch: React.Dispatch<WizardAction>;
  validateRef: React.MutableRefObject<() => boolean>;
  onValidChange: (valid: boolean) => void;
};

export function StepAdminAccount({ state, dispatch, validateRef, onValidChange }: Props) {
  const { admin } = state;
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const nameValid = admin.name.trim().length > 0;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email.trim());
  const passwordValid = admin.password.length >= 8;
  const confirmValid = confirm.length > 0 && admin.password === confirm;
  const isValid = nameValid && emailValid && passwordValid && confirmValid;

  useEffect(() => {
    validateRef.current = () => {
      setTouched(true);
      return isValid;
    };
    return () => { validateRef.current = () => true; };
  }, [isValid, validateRef]);

  useEffect(() => {
    onValidChange(isValid);
  }, [isValid, onValidChange]);

  const set = (partial: Partial<typeof admin>) =>
    dispatch({ type: 'SET_ADMIN', value: { ...admin, ...partial } });

  return (
    <div>
      <h2 style={heading}>Admin Account</h2>
      <p style={subtext}>Create the first administrator account for your Vencore instance.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Full name" htmlFor="admin-name" required>
          <input id="admin-name" style={input} value={admin.name} onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(true)} placeholder="Jane Smith" />
          {touched && !nameValid && <p style={fieldError}>Full name is required.</p>}
        </Field>

        <Field label="Email" htmlFor="admin-email" required>
          <input id="admin-email" style={input} type="email" value={admin.email} onChange={e => set({ email: e.target.value })} onBlur={() => setTouched(true)} placeholder="admin@yourcompany.com" />
          {touched && admin.email.length > 0 && !emailValid && <p style={fieldError}>Enter a valid email address.</p>}
        </Field>

        <Field label="Password" htmlFor="admin-password" hint="Minimum 8 characters" required>
          <PasswordInput
            id="admin-password"
            value={admin.password}
            onChange={v => set({ password: v })}
            visible={showPassword}
            onToggleVisible={() => setShowPassword(v => !v)}
          />
          <PasswordStrengthMeter password={admin.password} />
        </Field>

        <Field label="Confirm password" htmlFor="admin-confirm" required>
          <PasswordInput
            id="admin-confirm"
            value={confirm}
            onChange={setConfirm}
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm(v => !v)}
          />
          {confirm.length > 0 && (
            <p style={{ fontSize: 12, marginTop: 6, color: confirmValid ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 700 }}>{confirmValid ? '✓' : '✗'}</span>
              {confirmValid ? 'Passwords match' : "Passwords don't match"}
            </p>
          )}
        </Field>
      </div>
    </div>
  );
}

function PasswordInput({
  id, value, onChange, visible, onToggleVisible,
}: { id: string; value: string; onChange: (v: string) => void; visible: boolean; onToggleVisible: () => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        style={{ ...input, paddingRight: 38 }}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
          display: 'flex', padding: 4,
        }}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
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
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
