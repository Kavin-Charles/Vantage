'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface GroupRow {
  id: string;
  name: string;
  color: string;
  dashboard_id: string | null;
}

interface DashboardOption {
  id: string;
  name: string;
}

interface GroupAssignmentsResponse {
  groups: GroupRow[];
  dashboards: DashboardOption[];
}

function dedupeGroups(rows: GroupRow[]): GroupRow[] {
  const byId = new Map<string, GroupRow>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export default function DashboardSettingsPage() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-group-assignments'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch<{ data: GroupAssignmentsResponse; error: null }>(
        '/api/dashboards/group-assignments',
        { token },
      );
      return res.data;
    },
  });

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'saved' | 'error' | undefined>>({});

  const groups = dedupeGroups(data?.groups ?? []);

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, string> = {};
    for (const g of dedupeGroups(data.groups)) {
      initial[g.id] = g.dashboard_id ?? '';
    }
    setSelections(initial);
  }, [data]);

  async function handleSave(groupId: string) {
    setSaving(groupId);
    setFeedback(prev => ({ ...prev, [groupId]: undefined }));
    try {
      const token = await getToken();
      const value = selections[groupId] ?? '';
      await apiFetch(`/api/groups/${groupId}/dashboard`, {
        method: 'PUT',
        body: JSON.stringify({ dashboard_id: value || null }),
        token,
      });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-group-assignments'] });
      setFeedback(prev => ({ ...prev, [groupId]: 'saved' }));
    } catch {
      setFeedback(prev => ({ ...prev, [groupId]: 'error' }));
    } finally {
      setSaving(null);
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Dashboard assignments</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Choose which dashboard each group sees by default.
      </p>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div style={{ ...card, color: 'var(--text3)', fontSize: 13 }}>
          No groups yet. Create one in{' '}
          <a href="/settings/users" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Settings &rarr; Users &amp; Groups
          </a>
          .
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map(group => {
          const unchanged = (selections[group.id] ?? '') === (group.dashboard_id ?? '');
          return (
            <div key={group.id} style={card}>
              <span
                style={{ width: 10, height: 10, borderRadius: '50%', background: group.color, flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1, minWidth: 120 }}>
                {group.name}
              </span>
              <select
                aria-label={`Dashboard for ${group.name}`}
                value={selections[group.id] ?? ''}
                onChange={e => setSelections(prev => ({ ...prev, [group.id]: e.target.value }))}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 13,
                  minWidth: 180,
                }}
              >
                <option value="">No default</option>
                {(data?.dashboards ?? []).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button
                onClick={() => void handleSave(group.id)}
                disabled={unchanged || saving === group.id}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--text)',
                  color: 'var(--bg)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: unchanged || saving === group.id ? 'not-allowed' : 'pointer',
                  opacity: unchanged || saving === group.id ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                {saving === group.id ? 'Saving…' : 'Save'}
              </button>
              {feedback[group.id] === 'saved' && (
                <span style={{ fontSize: 12, color: 'var(--green)', flexShrink: 0 }}>Saved</span>
              )}
              {feedback[group.id] === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--red)', flexShrink: 0 }}>Could not save</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
