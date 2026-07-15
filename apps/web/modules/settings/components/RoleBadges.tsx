'use client';

import type { RoleSummary } from '@vencore/api-client';

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

export function RoleBadges({ role }: { role: Pick<RoleSummary, 'is_system' | 'grants_all' | 'is_default'> }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {role.grants_all && <Pill label="Administrator" bg="var(--blue-bg)" fg="var(--blue)" />}
      {role.is_default && <Pill label="Default" bg="var(--green-bg)" fg="var(--green)" />}
      {role.is_system && <Pill label="System" bg="var(--purple-bg)" fg="var(--purple)" />}
    </span>
  );
}
