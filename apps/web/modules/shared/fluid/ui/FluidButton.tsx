'use client';
import { useState } from 'react';
import { MSIcon } from './MSIcon';

type Variant = 'primary' | 'ghost' | 'dark';

const BASE: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--fl-primary)', color: 'var(--fl-on-primary)', border: '1px solid transparent', boxShadow: 'var(--fl-shadow-primary)' },
  ghost:   { background: 'transparent', color: 'var(--fl-on-surface-variant)', border: '1px solid var(--fl-outline-variant)' },
  dark:    { background: '#102a43', color: '#ffffff', border: '1px solid transparent' },
};

export function FluidButton({
  children, variant = 'primary', onClick, type = 'button', disabled, icon, style,
}: {
  children: React.ReactNode;
  variant?: Variant;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  icon?: string;
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
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '12px 24px', borderRadius: 'var(--fl-radius-pill)',
        fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform .2s, opacity .2s', whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        ...BASE[variant],
        ...(hover && !disabled ? { transform: 'scale(1.03)', opacity: 0.95 } : {}),
        ...style,
      }}
    >
      {icon ? <MSIcon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}
