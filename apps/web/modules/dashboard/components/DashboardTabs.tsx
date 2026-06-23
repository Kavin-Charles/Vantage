'use client';

import Link from 'next/link';
import type { DashboardSummary } from '../lib/dashboard-api';

interface Props {
  dashboards: DashboardSummary[];
  currentId: string;
}

export function DashboardTabs({ dashboards, currentId }: Props) {
  if (dashboards.length <= 1) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 28px',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}
    >
      {dashboards.map(d => {
        const active = d.id === currentId;
        return (
          <Link
            key={d.id}
            href={`/dashboard/${d.id}`}
            style={{
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--text)' : 'var(--text2)',
              borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {d.name}
          </Link>
        );
      })}
    </div>
  );
}
