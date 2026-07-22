'use client';
import { useState } from 'react';
import { MSIcon } from './MSIcon';

export function FluidInput({
  value, onChange, placeholder, icon, type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: string;
  type?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%' }}>
      {icon ? (
        <span style={{ position: 'absolute', left: 14, display: 'flex', color: 'var(--fl-outline)' }}>
          <MSIcon name={icon} size={20} />
        </span>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: '100%', padding: icon ? '12px 16px 12px 44px' : '12px 16px',
          borderRadius: 'var(--fl-radius-input)', fontFamily: 'var(--fl-font-body)', fontSize: 15,
          color: 'var(--fl-on-surface)', background: 'var(--fl-surface-container-lowest)',
          border: `1px solid ${focus ? 'var(--fl-primary)' : 'var(--fl-outline-variant)'}`,
          boxShadow: focus ? '0 0 0 3px rgba(0,72,206,0.15)' : 'none',
          outline: 'none', transition: 'border-color .2s, box-shadow .2s',
        }}
      />
    </div>
  );
}
