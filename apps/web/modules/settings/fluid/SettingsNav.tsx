'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { getSettingsEntries, type SettingsEntryDef } from '@/modules/shared/fluid/settings-registry';
import { GlassCard, MSIcon } from '@/modules/shared/fluid/ui';

function useVisible(scope: 'personal' | 'workspace'): SettingsEntryDef[] {
  const { hasPermission, user } = useAuth();
  return getSettingsEntries(scope).filter(e => {
    if (e.adminOnly && !user?.isAdmin) return false;
    if (e.permission && !hasPermission(e.permission)) return false;
    return true;
  });
}

export function SettingsNav() {
  const pathname = usePathname();
  const personal = useVisible('personal');
  const workspace = useVisible('workspace');

  const section = (label: string, items: SettingsEntryDef[]) =>
    items.length === 0 ? null : (
      <div style={{ marginBottom: 20 }}>
        <p
          style={{
            margin: '0 0 8px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fl-outline)',
          }}
        >
          {label}
        </p>
        {items.map(e => {
          const href = `/settings/${e.id}`;
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={e.id}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 'var(--fl-radius-pill)',
                textDecoration: 'none',
                color: active ? 'var(--fl-on-primary)' : 'var(--fl-on-surface-variant)',
                background: active ? 'var(--fl-primary)' : 'transparent',
              }}
            >
              <MSIcon name={e.icon} size={20} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.label}</span>
            </Link>
          );
        })}
      </div>
    );

  return (
    <GlassCard style={{ width: 260, alignSelf: 'flex-start' }}>
      {section('Personal', personal)}
      {section('Workspace', workspace)}
    </GlassCard>
  );
}
