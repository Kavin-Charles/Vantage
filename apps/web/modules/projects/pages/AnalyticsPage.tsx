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

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '20px 24px', flex: 1,
    }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Instrument Serif', fontSize: 32, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarChart({ rows, max }: { rows: StatusData[]; max: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 120, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name}
          </div>
          <div style={{ flex: 1, height: 20, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: r.color ?? 'var(--green)',
              width: max > 0 ? `${Math.round((r.count / max) * 100)}%` : '0%',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ width: 32, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', textAlign: 'right' }}>
            {r.count}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkloadRow({ member }: { member: WorkloadMember }) {
  const pct = member.total > 0 ? Math.round((member.done / member.total) * 100) : 0;
  const label = member.name ?? member.email ?? member.user_id.slice(0, 8);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: 'var(--surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
      }}>
        {label.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3 }}>
          <div style={{ height: '100%', borderRadius: 3, background: 'var(--green)', width: `${pct}%` }} />
        </div>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
        {member.done}/{member.total}
        {member.overdue > 0 && (
          <span style={{ color: 'var(--red)', marginLeft: 6 }}>+{member.overdue} overdue</span>
        )}
      </div>
    </div>
  );
}

function VelocityChart({ sprints }: { sprints: Sprint[] }) {
  const maxV = Math.max(...sprints.map(s => s.velocity ?? 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
      {sprints.map(s => {
        const h = Math.round(((s.velocity ?? 0) / maxV) * 80);
        return (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>{s.velocity ?? 0}</div>
            <div style={{
              width: '100%', height: h, minHeight: 4, borderRadius: '3px 3px 0 0',
              background: s.status === 'ACTIVE' ? 'var(--blue)' : 'var(--green)',
            }} />
            <div style={{
              fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text3)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '100%', textAlign: 'center',
            }}>
              {s.name}
            </div>
          </div>
        );
      })}
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

  const isLoading = healthQ.isLoading || statusQ.isLoading || workloadQ.isLoading || velocityQ.isLoading;

  if (isLoading) {
    return (
      <div style={{ padding: 32, fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>
        Loading analytics...
      </div>
    );
  }

  if (healthQ.error || statusQ.error || workloadQ.error || velocityQ.error) {
    return <div style={{ padding: '24px', color: 'var(--red)' }}>Failed to load analytics.</div>;
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960 }}>
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 24, color: 'var(--text)', margin: '0 0 24px' }}>
        Analytics
      </h2>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <KpiCard
          label="Completion"
          value={`${health?.completion_rate ?? 0}%`}
          sub={`${health?.done_tasks ?? 0} of ${health?.total_tasks ?? 0} tasks done`}
        />
        <KpiCard
          label="Open tasks"
          value={health?.open_tasks ?? 0}
          sub={health?.overdue_tasks ? `${health.overdue_tasks} overdue` : undefined}
        />
        <KpiCard
          label="Team members"
          value={health?.member_count ?? 0}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Tasks by status */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>
            Tasks by Status
          </div>
          {statuses.length === 0 ? (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>No statuses yet</div>
          ) : (
            <BarChart rows={statuses} max={maxStatusCount} />
          )}
        </div>

        {/* Sprint velocity */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>
            Sprint Velocity
          </div>
          {velocity.length === 0 ? (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>No completed sprints yet</div>
          ) : (
            <VelocityChart sprints={[...velocity].reverse()} />
          )}
        </div>

        {/* Workload per member */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, gridColumn: '1 / -1' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
            Workload per Member
          </div>
          {workload.length === 0 ? (
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>No assigned tasks yet</div>
          ) : (
            workload.map(m => <WorkloadRow key={m.user_id} member={m} />)
          )}
        </div>
      </div>
    </div>
  );
}
