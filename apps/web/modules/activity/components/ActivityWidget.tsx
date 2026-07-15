'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listActivity } from '@vencore/api-client';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

const TYPE_ICON: Record<string, string> = {
  email: 'message-square',
  call: 'contacts',
  note: 'edit',
  meeting: 'tasks',
  deal_change: 'pipeline',
  infra_alert: 'alerts',
};

function relativeTime(value: Date | string): string {
  const diff = Date.now() - new Date(value).getTime();
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ActivityWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const enabled = isEnabled('activity');
  const getToken = useApiToken();

  const query = useQuery({
    queryKey: ['widget', 'activity'],
    queryFn: async () => listActivity(await getToken(), { limit: 8 }),
    refetchInterval: config.refreshInterval ?? 120_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    enabled,
  });

  if (!enabled) return <EmptyState href="/settings/modules" label="Enable the Activity module" />;
  if (query.isLoading) return <WidgetSkeleton />;
  if (query.isError) return <WidgetError onRetry={() => void query.refetch()} />;

  const items = query.data?.data ?? [];
  if (items.length === 0) return <EmptyState href="/activity" label="No activity yet" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 6, background: 'var(--surface2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text2)', flexShrink: 0,
          }}>
            <Icon name={TYPE_ICON[item.type] ?? 'activity'} size={12} />
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.body ?? item.type.replace('_', ' ')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
            {relativeTime(item.created_at)}
          </span>
        </div>
      ))}
      <Link
        href="/activity"
        style={{
          marginTop: 'auto', fontSize: 12, color: 'var(--text3)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border)',
        }}
      >
        <Icon name="open" size={11} />
        View all activity
      </Link>
    </div>
  );
}
