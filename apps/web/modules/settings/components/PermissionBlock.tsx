'use client';

import React from 'react';

interface Permission {
  key: string;
  label: string;
  granted: boolean;
}

interface Props {
  title: string;
  permissions: Permission[];
  onToggle: (key: string, granted: boolean) => void;
  disabled?: boolean;
}

export function PermissionBlock({ title, permissions, onToggle, disabled = false }: Props) {
  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {permissions.map((perm) => (
          <div
            key={perm.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--surface2)',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{perm.label}</span>
            <button
              onClick={() => !disabled && onToggle(perm.key, !perm.granted)}
              disabled={disabled}
              style={{
                position: 'relative', width: 36, height: 20, borderRadius: 999,
                background: perm.granted ? 'var(--green)' : 'var(--border)',
                border: 'none',
                cursor: disabled ? 'default' : 'pointer',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: perm.granted ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left .15s',
                }}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
