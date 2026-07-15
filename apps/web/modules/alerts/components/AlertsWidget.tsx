'use client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { WidgetSkeleton, WidgetError, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { Alert } from '@vencore/types';

const SEVERITY_STYLE: Record<string, { fg: string; bg: string }> = {
  critical: { fg: 'var(--red)', bg: 'var(--red-bg)' },
  warning: { fg: 'var(--amber)', bg: 'var(--amber-bg)' },
};

function relativeTime(value: Date | string): string {
  const diff = Date.now() - new Date(value).getTime();
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AlertsWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const enabled = isEnabled('alerts');
  const getToken = useApiToken();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['widget', 'alerts'],
    queryFn: async () =>
      apiFetch<{ data: Alert[]; total: number; error: null }>(
        '/api/alerts?resolved=false&severity=critical,warning&limit=6',
        { token: await getToken() },
      ),
    refetchInterval: config.refreshInterval ?? 60_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    enabled,
  });

  const ackMut = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/alerts/${id}/acknowledge`, { method: 'PATCH', token: await getToken() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['widget', 'alerts'] }),
  });

  if (!enabled) return <EmptyState href="/settings/modules" label="Enable the Alerts module" />;
  if (query.isLoading) return <WidgetSkeleton />;
  if (query.isError) return <WidgetError onRetry={() => void query.refetch()} />;

  const alerts = query.data?.data ?? [];
  if (alerts.length === 0) return <EmptyState href="/alerts" label="No unresolved alerts" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      {alerts.map(alert => {
        const style = SEVERITY_STYLE[alert.severity] ?? { fg: 'var(--text2)', bg: 'var(--surface2)' };
        return (
          <div
            key={alert.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--surface)' }}
          >
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
              color: style.fg, background: style.bg, borderRadius: 6, padding: '2px 7px', flexShrink: 0,
            }}>
              {alert.severity}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alert.message}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
              {relativeTime(alert.created_at)}
            </span>
            {!alert.acknowledged && (
              <button
                title="Acknowledge"
                onClick={() => ackMut.mutate(alert.id)}
                disabled={ackMut.isPending}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', color: 'var(--text2)', padding: '2px 6px',
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                }}
              >
                <Icon name="check" size={12} />
              </button>
            )}
          </div>
        );
      })}
      <Link
        href="/alerts"
        style={{
          marginTop: 'auto', fontSize: 12, color: 'var(--text3)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border)',
        }}
      >
        <Icon name="open" size={11} />
        View all alerts
      </Link>
    </div>
  );
}

registerDashboardWidget({
  id: 'core:alerts',
  label: 'Alerts',
  description: 'Unresolved critical and warning alerts with quick acknowledge',
  icon: 'warning',
  category: 'insights',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['refreshInterval'],
  defaultConfig: { refreshInterval: 60_000 },
  component: AlertsWidget,
});
