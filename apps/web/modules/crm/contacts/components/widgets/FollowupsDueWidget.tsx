'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function FollowupsDueWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 10;
  const cutoff = new Date(Date.now() - 7 * 86_400_000);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'followups-due'],
    queryFn: async () => listContacts(await getToken(), { limit: '100' }),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = (data?.data ?? []).filter(c =>
    c.status !== 'churned' && (!c.last_contacted_at || new Date(c.last_contacted_at) < cutoff)
  ).slice(0, limit);

  if (contacts.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
      ✓ All contacts followed up
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label={`Follow-ups Due (${contacts.length})`} href="/crm/contacts" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {contacts.map(c => {
          const daysAgo = c.last_contacted_at
            ? Math.floor((Date.now() - new Date(c.last_contacted_at).getTime()) / 86_400_000)
            : null;
          return (
            <button
              key={c.id}
              onClick={() => router.push(`/crm/contacts/${c.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span style={{ fontSize: 11, color: 'var(--red)', background: 'var(--red-bg)', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>
                {daysAgo === null ? 'Never' : `${daysAgo}d ago`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:contacts-followups',
  label: 'Follow-ups Due',
  description: 'Contacts not reached in 7+ days — prioritise your outreach',
  icon: 'clock',
  category: 'sales',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 10 },
  component: FollowupsDueWidget,
});
