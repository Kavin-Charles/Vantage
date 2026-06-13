'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PortalMilestone {
  id: string;
  name: string;
  description: string | null;
  due_date: string;
  status: string;
  position: number;
}

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  PENDING:   { label: 'Pending',   bg: 'var(--blue-bg, #dbeafe)',  color: 'var(--blue, #1e3a8a)'  },
  COMPLETED: { label: 'Completed', bg: 'var(--green-bg, #d8f3dc)', color: 'var(--green, #2d6a4f)' },
  MISSED:    { label: 'Missed',    bg: 'var(--red-bg, #fee2e2)',   color: 'var(--red, #991b1b)'   },
};

export default function PortalRoadmapPage() {
  const { token } = useParams<{ token: string }>();
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portal/${token}/milestones`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error.message); return; }
        setMilestones(json.data ?? []);
      })
      .catch(() => setError('Failed to load roadmap'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text3, #9e998f)' }}>Loading…</p>;
  if (error)   return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--red, #991b1b)' }}>{error}</p>;

  if (milestones.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3, #9e998f)', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
        No milestones are shared with you yet.
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', marginBottom: 16 }}>
        Roadmap
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {milestones.map((m, i) => {
          const style = STATUS_STYLES[m.status] ?? STATUS_STYLES.PENDING;
          const isLast = i === milestones.length - 1;
          return (
            <div key={m.id} style={{ display: 'flex', gap: 16 }}>
              {/* Timeline line + dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: style.color,
                  border: `2px solid ${style.color}`,
                  marginTop: 16,
                  flexShrink: 0,
                }} />
                {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--border, #e4e0d8)', minHeight: 16 }} />}
              </div>

              {/* Content */}
              <div style={{
                flex: 1,
                background: 'var(--surface, #fff)',
                border: '1px solid var(--border, #e4e0d8)',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: isLast ? 0 : 8,
                marginTop: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--text, #1a1814)' }}>
                    {m.name}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: style.bg,
                    color: style.color,
                  }}>
                    {style.label}
                  </span>
                </div>
                {m.description && (
                  <p style={{ fontSize: 13, color: 'var(--text2, #6b665c)', margin: '4px 0', lineHeight: 1.5 }}>
                    {m.description}
                  </p>
                )}
                <span style={{ fontSize: 12, color: 'var(--text3, #9e998f)' }}>
                  Due {new Date(m.due_date).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
