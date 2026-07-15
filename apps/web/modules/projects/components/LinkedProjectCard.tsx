'use client';

import Link from 'next/link';
import type { ProjectWithProgress } from '@/modules/projects/lib/api';

interface Props {
  project: ProjectWithProgress;
  animationDelay?: number;
}

const HEALTH_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  ON_TRACK:  { bg: 'var(--green-bg, #d8f3dc)',  color: 'var(--green, #2d6a4f)',  label: 'On Track'  },
  AT_RISK:   { bg: 'var(--amber-bg, #fef3c7)',  color: 'var(--amber, #92400e)',  label: 'At Risk'   },
  OFF_TRACK: { bg: 'var(--red-bg, #fee2e2)',    color: 'var(--red, #991b1b)',    label: 'Off Track' },
};

export function LinkedProjectCard({ project, animationDelay = 0 }: Props) {
  const health = HEALTH_STYLES[project.health] ?? HEALTH_STYLES.ON_TRACK;

  return (
    <Link
      href={`/projects/${project.id}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        animation: 'fadeInUp .22s ease both',
        animationDelay: `${animationDelay}ms`,
        transition: 'border-color .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--text3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {project.color && (
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: project.color, flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            color: 'var(--text)', flex: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {project.name}
        </span>
        <span
          style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            padding: '2px 7px', borderRadius: 20,
            background: health.bg, color: health.color, flexShrink: 0,
          }}
        >
          {health.label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            flex: 1, height: 4,
            background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${project.progress}%`,
              background: project.color ?? 'var(--green)',
              borderRadius: 2,
              transition: 'width .4s ease',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: 'DM Sans', fontSize: 11,
            color: 'var(--text3)', flexShrink: 0,
          }}
        >
          {project.progress}%
        </span>
      </div>
    </Link>
  );
}
