'use client';
import type { ProjectWithProgress } from '@/modules/projects/lib/api';

const HEALTH = {
  ON_TRACK:  { dot: '#2d6a4f', bg: '#d8f3dc', label: 'On Track'  },
  AT_RISK:   { dot: '#92400e', bg: '#fef3c7', label: 'At Risk'   },
  OFF_TRACK: { dot: '#991b1b', bg: '#fee2e2', label: 'Off Track' },
} as const;

function hex2rgb(hex: string): string {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProjectCard({ project, onClick }: { project: ProjectWithProgress; onClick: () => void }) {
  const health = HEALTH[project.health as keyof typeof HEALTH] ?? HEALTH.ON_TRACK;
  const accent = project.color ?? '#6b665c';
  const rgb = accent.startsWith('#') && accent.length === 7 ? hex2rgb(accent) : null;
  const end = formatDate(project.end_date);
  const isOverdue = project.end_date && new Date(project.end_date) < new Date() && project.status !== 'archived';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: `1.5px solid ${rgb ? `rgba(${rgb}, 0.18)` : 'var(--border)'}`,
        borderRadius: 18, cursor: 'pointer', overflow: 'hidden',
        transition: 'box-shadow 0.18s ease, transform 0.14s ease, border-color 0.18s ease',
        position: 'relative',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = `0 8px 28px rgba(${rgb ?? '0,0,0'}, 0.13)`;
        el.style.transform = 'translateY(-2px)';
        el.style.borderColor = rgb ? `rgba(${rgb}, 0.36)` : 'var(--border)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = 'none';
        el.style.transform = 'translateY(0)';
        el.style.borderColor = rgb ? `rgba(${rgb}, 0.18)` : 'var(--border)';
      }}
    >
      {/* Accent strip */}
      <div style={{ height: 5, background: `linear-gradient(90deg, ${accent} 0%, ${accent}99 100%)` }} />

      <div style={{ padding: '18px 20px 20px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <h3 style={{ fontFamily: 'Instrument Serif', fontSize: 19, color: 'var(--text)', margin: 0, lineHeight: 1.25, flex: 1 }}>
            {project.name}
          </h3>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: health.bg, color: health.dot, flexShrink: 0, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
            {health.label}
          </span>
        </div>

        {/* Description */}
        {project.description ? (
          <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--text2)', margin: '0 0 16px', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {project.description}
          </p>
        ) : <div style={{ marginBottom: 16 }} />}

        {/* Progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>Progress</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: project.progress >= 100 ? 'var(--green)' : 'var(--text2)' }}>
              {project.progress}%
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: project.progress >= 100 ? 'var(--green)' : `linear-gradient(90deg, ${accent} 0%, ${accent}cc 100%)`,
              width: `${Math.max(project.progress, 2)}%`,
              transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: project.status === 'archived' ? 'var(--text3)' : accent, flexShrink: 0 }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: project.status === 'archived' ? 'var(--text3)' : 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {project.status === 'archived' ? 'Archived' : 'Active'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {project.budget && (
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 8, padding: '3px 8px' }}>
                ${Number(project.budget).toLocaleString()}
              </span>
            )}
            {end && (
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: isOverdue ? 'var(--red)' : 'var(--text3)', background: isOverdue ? 'var(--red-bg)' : 'var(--surface2)', borderRadius: 8, padding: '3px 8px', fontWeight: isOverdue ? 600 : 400 }}>
                {isOverdue ? 'Overdue · ' : ''}{end}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
