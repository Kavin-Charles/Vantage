'use client';

import { useState } from 'react';

export function FormField({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</p>}
    </div>
  );
}

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--border)',
  background: 'var(--bg)',
  fontSize: 13,
  color: 'var(--text)',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color .15s, box-shadow .15s, background .15s',
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      {...props}
      onFocus={e => { setFocus(true); props.onFocus?.(e); }}
      onBlur={e => { setFocus(false); props.onBlur?.(e); }}
      style={{
        ...baseInputStyle,
        ...(focus ? {
          borderColor: 'var(--text2)',
          background: 'var(--surface)',
          boxShadow: '0 0 0 3px rgba(11,19,48,0.06)',
        } : {}),
        ...props.style,
      }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...baseInputStyle, ...props.style }}>
      {props.children}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea
      {...props}
      onFocus={e => { setFocus(true); props.onFocus?.(e); }}
      onBlur={e => { setFocus(false); props.onBlur?.(e); }}
      style={{
        ...baseInputStyle,
        minHeight: 80, resize: 'vertical',
        ...(focus ? {
          borderColor: 'var(--text2)',
          background: 'var(--surface)',
          boxShadow: '0 0 0 3px rgba(11,19,48,0.06)',
        } : {}),
        ...props.style,
      }}
    />
  );
}
