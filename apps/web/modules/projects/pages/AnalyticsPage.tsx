'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface HealthData {
  total_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
  open_tasks: number;
  member_count: number;
  completion_rate: number;
}

interface StatusData {
  id: string;
  name: string;
  color: string | null;
  count: number;
}

interface WorkloadMember {
  user_id: string;
  name: string | null;
  email: string | null;
  total: number;
  done: number;
  overdue: number;
}

interface Sprint {
  id: string;
  name: string;
  velocity: number | null;
  start_date: string;
  end_date: string;
  status: string;
}

function KpiCard({
  label, value, sub, accent, trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  trend?: { dir: 'up' | 'down'; label: string };
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, overflow: 'hidden', flex: 1, minWidth: 0,
    }}>
      <div style={{ height: 4, background: accent ?? 'var(--green)' }} />
      <div style={{ padding: '20px 22px 22px' }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          {label}
        </div>
        <div style={{ fontFamily: 'Instrument Serif', fontSize: 36, color: 'var(--text)', lineHeight: 1, marginBottom: 6 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>{sub}</div>
        )}
        {trend && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            color: trend.dir === 'up' ? 'var(--green)' : 'var(--red)',
            background: trend.dir === 'up' ? 'var(--green-bg)' : 'var(--red-bg)',
            borderRadius: 6, padding: '3px 8px',
          }}>
            {trend.dir === 'up' ? '↑' : '↓'} {trend.label}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'Instrument Serif', fontSize: 17, color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ padding: '20px 22px' }}>
        {children}
      </div>
    </div>
  );
}

function BarChart({ rows, max }: { rows: StatusData[]; max: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(r => {
        const pct = max > 0 ? Math.round((r.count / max) * 100) : 0;
        return (
          <div key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>{r.name}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{r.count}</span>
            </div>
            <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: r.color ?? 'var(--green)',
                width: `${pct}%`,
                transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WorkloadRow({ member }: { member: WorkloadMember }) {
  const pct = member.total > 0 ? Math.round((member.done / member.total) * 100) : 0;
  const label = member.name ?? member.email ?? member.user_id.slice(0, 8);
  const initials = label.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: 'var(--surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'var(--text2)', flexShrink: 0,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', flexShrink: 0, marginLeft: 12 }}>
            {member.done}/{member.total} done
            {member.overdue > 0 && (
              <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 600 }}>+{member.overdue} overdue</span>
            )}
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            background: pct === 100 ? 'var(--green)' : 'var(--blue)',
            width: `${pct}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
      <div style={{
        flexShrink: 0, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
        color: pct === 100 ? 'var(--green)' : 'var(--text2)', width: 36, textAlign: 'right',
      }}>
        {pct}%
      </div>
    </div>
  );
}

function VelocityChart({ sprints }: { sprints: Sprint[] }) {
  const maxV = Math.max(...sprints.map(s => s.velocity ?? 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, padding: '0 4px' }}>
      {sprints.map(s => {
        const h = Math.max(Math.round(((s.velocity ?? 0) / maxV) * 96), 4);
        const isActive = s.status === 'ACTIVE';
        return (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>
              {s.velocity ?? 0}
            </span>
            <div style={{
              width: '100%', height: h, borderRadius: '5px 5px 0 0',
              background: isActive ? 'var(--blue)' : 'var(--green)',
              opacity: isActive ? 1 : 0.75,
              transition: 'height 0.4s ease',
            }} />
            <span style={{
              fontFamily: 'DM Sans', fontSize: 10, color: isActive ? 'var(--text2)' : 'var(--text3)',
              fontWeight: isActive ? 600 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '100%', textAlign: 'center',
            }}>
              {s.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ pct }: { pct: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--surface2)" strokeWidth="12" />
        <circle
          cx="64" cy="64" r={r} fill="none"
          stroke="var(--green)" strokeWidth="12"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Instrument Serif', fontSize: 24, color: 'var(--text)', lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>done</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();

  const healthQ = useQuery({
    queryKey: ['analytics-health', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: HealthData }>(`/api/projects/${projectId}/analytics/health`, { token });
    },
  });

  const statusQ = useQuery({
    queryKey: ['analytics-by-status', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: StatusData[] }>(`/api/projects/${projectId}/analytics/by-status`, { token });
    },
  });

  const workloadQ = useQuery({
    queryKey: ['analytics-workload', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: WorkloadMember[] }>(`/api/projects/${projectId}/analytics/workload`, { token });
    },
  });

  const velocityQ = useQuery({
    queryKey: ['analytics-velocity', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Sprint[] }>(`/api/projects/${projectId}/analytics/velocity`, { token });
    },
  });

  const health = healthQ.data?.data;
  const statuses = statusQ.data?.data ?? [];
  const workload = workloadQ.data?.data ?? [];
  const velocity = velocityQ.data?.data ?? [];
  const maxStatusCount = Math.max(...statuses.map(s => s.count), 1);
  const isLoading = healthQ.isLoading || statusQ.isLoading;

  if (isLoading) {
    return (
      <div style={{ padding: 32, fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>
        Loading analytics…
      </div>
    );
  }

  const completionRate = health?.completion_rate ?? 0;

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        <KpiCard
          label="Completion"
          value={`${completionRate}%`}
          sub={`${health?.done_tasks ?? 0} of ${health?.total_tasks ?? 0} tasks done`}
          accent="var(--green)"
        />
        <KpiCard
          label="Open tasks"
          value={health?.open_tasks ?? 0}
          sub={health?.overdue_tasks ? `${health.overdue_tasks} overdue` : 'all on track'}
          accent={health?.overdue_tasks ? 'var(--red)' : 'var(--blue)'}
          trend={health?.overdue_tasks ? { dir: 'down', label: `${health.overdue_tasks} overdue` } : undefined}
        />
        <KpiCard
          label="Total tasks"
          value={health?.total_tasks ?? 0}
          sub="across all statuses"
          accent="var(--blue)"
        />
        <KpiCard
          label="Team members"
          value={health?.member_count ?? 0}
          sub="active on project"
          accent="var(--amber)"
        />
      </div>

      {/* Completion ring + status breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 16, marginBottom: 16 }}>
        <Section title="Overall progress">
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <DonutChart pct={completionRate} />
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Done</div>
                <div style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--green)' }}>{health?.done_tasks ?? 0}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Remaining</div>
                <div style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>{health?.open_tasks ?? 0}</div>
              </div>
              {(health?.overdue_tasks ?? 0) > 0 && (
                <div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Overdue</div>
                  <div style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--red)' }}>{health?.overdue_tasks ?? 0}</div>
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section title="Tasks by status">
          {statuses.length === 0 ? (
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>No statuses yet.</p>
          ) : (
            <BarChart rows={statuses} max={maxStatusCount} />
          )}
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}>
        {/* Workload */}
        <Section title="Team workload">
          {workload.length === 0 ? (
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>No assigned tasks yet.</p>
          ) : (
            <div>
              {workload.map(m => <WorkloadRow key={m.user_id} member={m} />)}
            </div>
          )}
        </Section>

        {/* Velocity */}
        <Section title="Sprint velocity">
          {velocity.length === 0 ? (
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>No completed sprints yet.</p>
          ) : (
            <VelocityChart sprints={[...velocity].reverse()} />
          )}
        </Section>
      </div>
    </div>
  );
}
