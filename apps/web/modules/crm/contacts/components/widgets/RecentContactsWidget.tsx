'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function RecentContactsWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 8;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'contacts-recent', limit],
    queryFn: async () => listContacts(await getToken(), { limit: String(limit) }),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = data?.data ?? [];
  if (contacts.length === 0) return <EmptyState href="/crm/contacts/new" label="Add your first contact" icon="users" />;

  const STATUS_COLOR: Record<string, string> = {
    prospect: 'var(--blue)', customer: 'var(--green)', cold: 'var(--text3)', churned: 'var(--red)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Recent Contacts" href="/crm/contacts" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {contacts.map(c => (
          <button
            key={c.id}
            onClick={() => router.push(`/crm/contacts/${c.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
              background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
              cursor: 'pointer', textAlign: 'left', width: '100%', borderRadius: 4,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: 'var(--surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--text2)', flexShrink: 0,
            }}>
              {c.name[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
              color: STATUS_COLOR[c.status] ?? 'var(--text3)', background: 'var(--surface2)',
              textTransform: 'capitalize',
            }}>{c.status}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{relativeTime(c.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:contacts-recent',
  label: 'Recent Contacts',
  description: 'Latest contacts added to your workspace with status badges',
  icon: 'users',
  category: 'sales',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 8 },
  component: RecentContactsWidget,
});
