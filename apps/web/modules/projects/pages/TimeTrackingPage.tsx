'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TimeSummary } from '@/modules/projects/lib/api';

function formatHM(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', flex: 1, minWidth: 0 }}>
      <div style={{ height: 4, background: 'var(--blue)' }} />
      <div style={{ padding: '20px 22px 22px' }}>
        <div style={{ fontFamily: 'IBM Plex Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          {label}
        </div>
        <div style={{ fontFamily: 'IBM Plex Serif', fontSize: 36, color: 'var(--text)', lineHeight: 1, marginBottom: 6 }}>
          {value}
        </div>
        {sub && <div style={{ fontFamily: 'IBM Plex Sans', fontSize: 12, color: 'var(--text3)' }}>{sub}</div>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'IBM Plex Serif', fontSize: 17, color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  );
}

export default function TimeTrackingPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['time-summary', projectId],
    queryFn: async () => pmApi.getTimeSummary(await getToken(), projectId),
  });
  const summary: TimeSummary | undefined = data?.data;

  if (isLoading) {
    return <div style={{ padding: 32, fontFamily: 'IBM Plex Sans', fontSize: 14, color: 'var(--text3)' }}>Loading time tracking…</div>;
  }

  const byTask = summary?.by_task ?? [];
  const byUser = summary?.by_user ?? [];
  const maxTaskMinutes = Math.max(...byTask.map(t => t.total_minutes), 1);

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        <KpiCard label="Total Logged" value={formatHM(summary?.total_minutes ?? 0)} sub="across all tasks" />
        <KpiCard label="Tasks With Time" value={String(byTask.length)} sub="tasks logged against" />
        <KpiCard label="Contributors" value={String(byUser.length)} sub="people logging time" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <Section title="By Task">
          {byTask.length === 0 ? (
            <p style={{ fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>No time logged yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {byTask.map(t => {
                const pct = Math.round((t.total_minutes / maxTaskMinutes) * 100);
                return (
                  <div key={t.task_id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontFamily: 'IBM Plex Sans', fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>{t.title}</span>
                      <span style={{ fontFamily: 'IBM Plex Sans', fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{formatHM(t.total_minutes)}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: 'var(--blue)', width: `${pct}%`, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="By Person">
          {byUser.length === 0 ? (
            <p style={{ fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>No time logged yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {byUser.map(u => (
                <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text)' }}>{u.user_name ?? 'Unknown'}</span>
                  <span style={{ fontFamily: 'IBM Plex Sans', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{formatHM(u.total_minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
