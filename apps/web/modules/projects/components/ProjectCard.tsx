'use client';
import type { ProjectWithProgress } from '@/modules/projects/lib/api';

const HEALTH_COLORS = {
  ON_TRACK: { dot: '#2d6a4f', bg: '#d8f3dc', label: 'On Track' },
  AT_RISK:  { dot: '#92400e', bg: '#fef3c7', label: 'At Risk'  },
  OFF_TRACK:{ dot: '#991b1b', bg: '#fee2e2', label: 'Off Track' },
} as const;

export function ProjectCard({ project, onClick }: { project: ProjectWithProgress; onClick: () => void }) {
  const health = HEALTH_COLORS[project.health as keyof typeof HEALTH_COLORS] ?? HEALTH_COLORS.ON_TRACK;
  return (
    <div
      onClick={onClick}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {project.color && <div style={{ width: 12, height: 12, borderRadius: 4, background: project.color, flexShrink: 0 }} />}
        <p style={{ fontFamily: 'Instrument Serif', fontSize: 17, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{project.name}</p>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, padding: '3px 8px', borderRadius: 6, background: health.bg, color: health.dot, flexShrink: 0 }}>{health.label}</span>
      </div>
      <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, marginBottom: 10 }}>
        <div style={{ height: '100%', borderRadius: 2, background: project.color ?? 'var(--green)', width: `${project.progress}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>{project.progress}% complete</span>
        {project.end_date && <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>Due {new Date(project.end_date).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
