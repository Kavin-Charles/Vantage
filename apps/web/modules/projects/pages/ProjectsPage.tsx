'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { pmApi, type ProjectWithProgress } from '@/modules/projects/lib/api';
import { ProjectCard } from '@/modules/projects/components/ProjectCard';

type Filter = 'all' | 'active' | 'archived' | 'at-risk';

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All', active: 'Active', archived: 'Archived', 'at-risk': 'At Risk',
};

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: 'Instrument Serif', fontSize: 28, color: 'var(--text)', lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>{sub}</span>}
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const getToken = useApiToken();
  const [filter, setFilter] = useState<Filter>('all');

  const { data: projects = [], isLoading } = useQuery<ProjectWithProgress[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await pmApi.listProjects(await getToken());
      return res.data ?? [];
    },
  });

  const active = projects.filter(p => p.status !== 'archived');
  const archived = projects.filter(p => p.status === 'archived');
  const atRisk = projects.filter(p => p.health === 'AT_RISK' || p.health === 'OFF_TRACK');
  const onTrack = projects.filter(p => p.health === 'ON_TRACK');

  const filtered = filter === 'all' ? projects
    : filter === 'active' ? active
    : filter === 'archived' ? archived
    : atRisk;

  const isEmpty = projects.length === 0 && !isLoading;

  return (
    <>
      <Topbar
        action={
          <button
            onClick={() => router.push('/projects/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            <Icon name="plus" size={14} color="#fff" />
            New Project
          </button>
        }
      />

      <div style={{ padding: 24 }}>
        {isLoading ? (
          <div style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14, padding: '60px 0', textAlign: 'center' }}>Loading…</div>
        ) : isEmpty ? (
          <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <div style={{ marginBottom: 16, opacity: 0.3 }}><Icon name="tasks" size={48} /></div>
            <p style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 8px' }}>No projects yet</p>
            <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)', margin: '0 0 24px' }}>Create a project to start tracking work</p>
            <button onClick={() => router.push('/projects/new')} style={{ background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Create your first project
            </button>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
              <StatCard label="Total" value={projects.length} sub="projects" />
              <StatCard label="Active" value={active.length} sub="in progress" />
              <StatCard label="On track" value={onTrack.length} sub="healthy" />
              <StatCard label="At risk" value={atRisk.length} sub={atRisk.length === 0 ? 'all good' : 'need attention'} />
            </div>

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
              {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    border: filter === f ? '1.5px solid var(--text)' : '1.5px solid var(--border)',
                    background: filter === f ? 'var(--text)' : 'var(--surface)',
                    color: filter === f ? '#fff' : 'var(--text2)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {FILTER_LABELS[f]}
                  {f !== 'all' && (
                    <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>
                      {f === 'active' ? active.length : f === 'archived' ? archived.length : atRisk.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Grid */}
            {filtered.length === 0 ? (
              <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)', padding: '40px 0', textAlign: 'center' }}>
                No projects match this filter.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {filtered.map(p => (
                  <ProjectCard key={p.id} project={p} onClick={() => router.push(`/projects/${p.id}/tasks`)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
