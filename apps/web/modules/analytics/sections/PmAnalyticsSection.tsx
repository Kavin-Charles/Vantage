'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPmAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--text)';
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color }}>{value}</div>
    </div>
  );
}

export function PmAnalyticsSection({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics-pm', period],
    queryFn: async () => getPmAnalytics(await getToken(), period),
  });

  if (isError) {
    return (
      <div style={{ ...card, padding: '20px 24px', color: 'var(--text2)', fontSize: 13 }}>
        Failed to load project analytics.
      </div>
    );
  }

  const d = data?.data;
  const maxVelocity = Math.max(1, ...(d?.velocity ?? []).map(v => v.velocity ?? 0));

  return (
    <div style={{ ...card, padding: '20px 24px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
        Projects
      </div>
      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <Stat label="Active projects" value={String(d?.projects.active ?? 0)} />
            <Stat label="Open tasks" value={String(d?.tasks.open ?? 0)} />
            <Stat label="Done" value={String(d?.tasks.done ?? 0)} tone="green" />
            <Stat label="Overdue" value={String(d?.tasks.overdue ?? 0)} tone={d?.tasks.overdue ? 'red' : undefined} />
            <Stat label="Completion" value={`${d?.tasks.completion_rate ?? 0}%`} />
          </div>

          {(d?.velocity.length ?? 0) > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Sprint velocity (recent)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d!.velocity.map((v, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text2)', width: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {v.sprint_name}
                    </div>
                    <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${((v.velocity ?? 0) / maxVelocity) * 100}%`, height: '100%', background: 'var(--green)', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text)', width: 32, textAlign: 'right' }}>{v.velocity ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(d?.workload.length ?? 0) > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Workload (open tasks by assignee)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d!.workload.map(w => (
                  <div key={w.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <div style={{ color: 'var(--text)', width: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                    <div style={{ color: 'var(--text2)' }}>{w.total - w.done} open</div>
                    {w.overdue > 0 && <div style={{ color: 'var(--red)' }}>{w.overdue} overdue</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
