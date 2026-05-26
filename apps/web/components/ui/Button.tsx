'use client';

import { useState } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BASE: Record<Variant, React.CSSProperties> = {
  primary:   { background: 'var(--text)',    color: '#fff',         border: '1px solid var(--text)' },
  secondary: { background: 'var(--surface)', color: 'var(--text)',  border: '1px solid var(--border)' },
  danger:    { background: 'var(--red-bg)',  color: 'var(--red)',   border: '1px solid var(--red-bg)' },
  ghost:     { background: 'transparent',    color: 'var(--text2)', border: '1px solid transparent' },
};

const HOVER_BG: Record<Variant, string> = {
  primary:   '#1a2244',
  secondary: 'var(--surface2)',
  danger:    '#fed7d7',
  ghost:     'var(--surface2)',
};

export function Button({
  children,
  variant = 'secondary',
  onClick,
  type = 'button',
  disabled,
  style,
}: {
  children: React.ReactNode;
  variant?: Variant;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 'var(--radius-md)',
        fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .15s',
        whiteSpace: 'nowrap',
        ...BASE[variant],
        ...(hover && !disabled ? { background: HOVER_BG[variant] } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
