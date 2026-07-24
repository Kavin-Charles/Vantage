'use client';

import type { GroupedPermission } from '@vencore/api-client';

interface Props {
  perm: GroupedPermission;
  disabled?: boolean;
  onToggle: (key: string, granted: boolean) => void;
}

export function PermissionRow({ perm, disabled = false, onToggle }: Props) {
  const inherited = perm.inherited;
  const readOnly = inherited || disabled;
  const on = perm.granted || perm.inherited;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px',
        borderRadius: 'var(--fl-radius-input)', background: 'var(--fl-surface-container-low)', opacity: readOnly ? 0.75 : 1,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, color: 'var(--fl-on-surface)' }}>{perm.key}</code>
        <span style={{ fontSize: 12, color: 'var(--fl-outline)' }}>
          {perm.label}
          {inherited ? ' · ⛓ inherited' : ''}
        </span>
      </span>
      <button
        onClick={() => !readOnly && onToggle(perm.key, !perm.granted)}
        disabled={readOnly}
        aria-label={inherited ? 'inherited' : on ? 'granted' : 'not granted'}
        style={{
          position: 'relative', width: 36, height: 20, borderRadius: 'var(--fl-radius-pill)',
          background: on ? '#2e7d32' : 'var(--fl-outline-variant)', border: 'none',
          cursor: readOnly ? 'default' : 'pointer', flexShrink: 0, transition: 'background .2s',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
            background: '#fff', transition: 'left .2s ease',
          }}
        />
      </button>
    </div>
  );
}
