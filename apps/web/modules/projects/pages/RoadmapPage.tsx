'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string;
  status: string;
  client_visible: boolean;
  position: number;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   '#93c5fd',
  COMPLETED: '#6ee7b7',
  MISSED:    '#fca5a5',
};

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const QUARTER_MONTHS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function RoadmapPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch<{ data: Milestone[] }>(
        `/api/projects/${projectId}/milestones`,
        { token }
      );
      return res.data;
    },
  });

  const milestones: Milestone[] = data ?? [];

  const byQuarterMonth: Record<number, Record<number, Milestone[]>> = {};
  for (const m of milestones) {
    const d = new Date(m.due_date);
    if (d.getFullYear() !== year) continue;
    const mo = d.getMonth();
    const q = Math.floor(mo / 3);
    if (!byQuarterMonth[q]) byQuarterMonth[q] = {};
    if (!byQuarterMonth[q]![mo]) byQuarterMonth[q]![mo] = [];
    byQuarterMonth[q]![mo]!.push(m);
  }

  const yearMilestones = milestones.filter(m => new Date(m.due_date).getFullYear() === year);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <button
          onClick={() => setYear(y => y - 1)}
          style={{
            border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13,
            color: 'var(--text)',
          }}
        >
          ‹
        </button>
        <span style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', minWidth: 60, textAlign: 'center' }}>
          {year}
        </span>
        <button
          onClick={() => setYear(y => y + 1)}
          style={{
            border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13,
            color: 'var(--text)',
          }}
        >
          ›
        </button>
        <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
          {yearMilestones.length} milestone{yearMilestones.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: 32, fontFamily: 'DM Sans', color: 'var(--text3)' }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {QUARTERS.map((q, qi) => {
              const months = QUARTER_MONTHS[qi]!;
              return (
                <div
                  key={q}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, overflow: 'hidden',
                  }}
                >
                  {/* Quarter header */}
                  <div style={{
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    background: 'var(--surface2)',
                  }}>
                    <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>
                      {q} {year}
                    </span>
                  </div>

                  {/* Months */}
                  {months.map(mo => {
                    const mItems = byQuarterMonth[qi]?.[mo] ?? [];
                    return (
                      <div key={mo} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{
                          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                          color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6,
                        }}>
                          {MONTH_NAMES[mo]}
                        </div>
                        {mItems.length === 0 ? (
                          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                            No milestones
                          </div>
                        ) : (
                          mItems.map(ms => (
                            <div
                              key={ms.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                marginBottom: 4, padding: '4px 6px',
                                background: 'var(--surface2)', borderRadius: 6,
                              }}
                            >
                              <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: STATUS_COLORS[ms.status] ?? '#94a3b8',
                                flexShrink: 0,
                              }} />
                              <span style={{
                                fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {ms.name}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {yearMilestones.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <p style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>
                No milestones in {year}
              </p>
              <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>
                Add milestones to populate the roadmap.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
