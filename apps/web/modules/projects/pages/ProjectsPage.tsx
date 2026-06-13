'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { pmApi, type ProjectWithProgress } from '@/modules/projects/lib/api';
import { ProjectCard } from '@/modules/projects/components/ProjectCard';

export default function ProjectsPage() {
  const router = useRouter();
  const getToken = useApiToken();

  const { data: projects = [], isLoading } = useQuery<ProjectWithProgress[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await pmApi.listProjects(await getToken());
      return res.data ?? [];
    },
  });
  const active = projects.filter(p => p.status !== 'archived');
  const archived = projects.filter(p => p.status === 'archived');

  return (
    <>
      <Topbar
        action={
          <button
            onClick={() => router.push('/projects/new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--text)', color: '#fff',
              border: 'none', borderRadius: 10, padding: '7px 14px',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={14} color="#fff" />
            New Project
          </button>
        }
      />
      <div style={{ padding: 24 }}>
        {isLoading ? (
          <div style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading projects…</div>
        ) : active.length === 0 && archived.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14,
          }}>
            <div style={{ marginBottom: 12, opacity: 0.4 }}><Icon name="tasks" size={40} /></div>
            <p style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text2)' }}>No projects yet</p>
            <button
              onClick={() => router.push('/projects/new')}
              style={{
                background: 'var(--text)', color: '#fff', border: 'none',
                borderRadius: 10, padding: '8px 18px', fontFamily: 'DM Sans',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Create your first project
            </button>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>
                  Active — {active.length}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {active.map(p => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onClick={() => router.push(`/projects/${p.id}/board`)}
                    />
                  ))}
                </div>
              </div>
            )}
            {archived.length > 0 && (
              <div>
                <h2 style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>
                  Archived — {archived.length}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, opacity: 0.6 }}>
                  {archived.map(p => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onClick={() => router.push(`/projects/${p.id}/board`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
