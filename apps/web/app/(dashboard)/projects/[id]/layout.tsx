import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ProjectWithProgress } from '@/modules/projects/lib/api';

const NAV = [
  { href: 'board', label: 'Board' },
  { href: 'list', label: 'List' },
];

const HEALTH_COLORS = {
  ON_TRACK: { dot: '#2d6a4f', bg: '#d8f3dc', label: 'On Track' },
  AT_RISK:  { dot: '#92400e', bg: '#fef3c7', label: 'At Risk'  },
  OFF_TRACK:{ dot: '#991b1b', bg: '#fee2e2', label: 'Off Track' },
} as const;

async function getProject(id: string): Promise<ProjectWithProgress | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/projects/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: ProjectWithProgress };
    return json.data;
  } catch {
    return null;
  }
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  const health = project
    ? (HEALTH_COLORS[project.health as keyof typeof HEALTH_COLORS] ?? HEALTH_COLORS.ON_TRACK)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Project header */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 24px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56 }}>
          <Link
            href="/projects"
            style={{ color: 'var(--text3)', fontSize: 13, fontFamily: 'DM Sans', textDecoration: 'none' }}
          >
            Projects
          </Link>
          <span style={{ color: 'var(--border)', fontSize: 16 }}>/</span>
          {project ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {project.color && (
                <div style={{ width: 10, height: 10, borderRadius: 3, background: project.color, flexShrink: 0 }} />
              )}
              <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>
                {project.name}
              </span>
              {health && (
                <span style={{
                  fontFamily: 'DM Sans', fontSize: 11, padding: '2px 8px',
                  borderRadius: 6, background: health.bg, color: health.dot,
                }}>
                  {health.label}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text)' }}>Project</span>
          )}

          {project && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ height: 4, width: 100, background: 'var(--surface2)', borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: project.color ?? 'var(--green)',
                  width: `${project.progress}%`,
                }} />
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                {project.progress}%
              </span>
            </div>
          )}
        </div>

        {/* Sub-nav */}
        <div style={{ display: 'flex', gap: 2 }}>
          {NAV.map(n => (
            <Link
              key={n.href}
              href={`/projects/${id}/${n.href}`}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
                padding: '8px 14px', textDecoration: 'none',
                color: 'var(--text2)', borderBottom: '2px solid transparent',
                display: 'inline-block',
              }}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
