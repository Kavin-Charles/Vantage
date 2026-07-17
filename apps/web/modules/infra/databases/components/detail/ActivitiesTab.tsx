'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface ActivityEntry {
  id: string;
  user_id: string | null;
  type: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  user?: { name: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  database_added: 'Added this database',
  database_removed: 'Removed this database',
  database_settings_changed: 'Updated settings',
  database_connection_tested: 'Tested connection',
  infra_alert: 'Alert fired',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function avatarColor(userId: string): string {
  const colors = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)'];
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length] ?? 'var(--text3)';
}

export function DatabaseActivitiesTab({ databaseId }: { databaseId: string }) {
  const getToken = useApiToken();
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['db-activities', databaseId, page],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: ActivityEntry[]; error: null }>(
        `/api/activity?record_id=${databaseId}&limit=20&page=${page}`,
        { token },
      );
    },
    placeholderData: prev => prev,
  });

  const activities = data?.data ?? [];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4 }}>
        Activity
      </div>

      {isLoading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
      ) : activities.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No activity recorded yet.
        </div>
      ) : (
        <>
          {activities.map((activity, i) => {
            const label = ACTION_LABEL[activity.type] ?? activity.type;
            const initials = activity.user?.name
              ? activity.user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              : '?';
            const color = activity.user_id ? avatarColor(activity.user_id) : 'var(--text3)';

            return (
              <div
                key={activity.id}
                style={{
                  display: 'flex', gap: 12, padding: '12px 16px',
                  borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>
                    {activity.user?.name && (
                      <span style={{ fontWeight: 600 }}>{activity.user.name} </span>
                    )}
                    {label}
                  </div>
                  {activity.body && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      {activity.body}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', marginTop: 2 }}>
                  {relativeTime(activity.created_at)}
                </span>
              </div>
            );
          })}

          {activities.length === 20 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isFetching}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '6px 16px', fontSize: 12, cursor: 'pointer', color: 'var(--text2)',
                }}
              >
                {isFetching ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
