'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';

const TABS = [
  { href: '/crm/pipeline',  label: 'Pipeline',  permission: 'pipelines:view' },
  { href: '/crm/contacts',  label: 'Contacts',  permission: 'contacts:view' },
  { href: '/crm/companies', label: 'Companies', permission: 'companies:view' },
  { href: '/crm/tasks',     label: 'Tasks',     permission: 'tasks:view' },
];

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const tabs = TABS.filter(t => hasPermission(t.permission));

  return (
    <ModuleGuard moduleId="crm">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{
          display: 'flex', gap: 4, padding: '6px 20px 0',
          borderBottom: '1px solid var(--border)', background: 'var(--surface)',
          flexShrink: 0,
        }}>
          {tabs.map(t => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  padding: '8px 14px', fontSize: 13.5, textDecoration: 'none',
                  color: active ? 'var(--text)' : 'var(--text2)',
                  fontWeight: active ? 500 : 400,
                  borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
      </div>
    </ModuleGuard>
  );
}
