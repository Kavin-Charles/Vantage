'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type Milestone } from '@/modules/projects/lib/api';

const STATUS_COLORS: Record<string, string> = {
  PENDING:   '#93c5fd',
  COMPLETED: '#6ee7b7',
  MISSED:    '#fca5a5',
};

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const QUARTER_MONTHS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface AddMilestoneModalProps {
  onClose: () => void;
  onSave: (data: { name: string; due_date: string; description?: string }) => void;
  loading: boolean;
  defaultYear: number;
}

function AddMilestoneModal({ onClose, onSave, loading, defaultYear }: AddMilestoneModalProps) {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState(`${defaultYear}-01-01`);
  const [description, setDescription] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;
    onSave({ name: name.trim(), due_date: dueDate, description: description.trim() || undefined });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: 28,
        width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <h3 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 20px' }}>
          Add milestone
        </h3>
        <form onSubmit={submit}>
          <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            Name *
          </label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Milestone name"
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)',
              background: 'var(--surface2)', outline: 'none', boxSizing: 'border-box', marginBottom: 14,
            }}
          />

          <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            Due date *
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)',
              background: 'var(--surface2)', outline: 'none', boxSizing: 'border-box', marginBottom: 14,
            }}
          />

          <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)',
              background: 'var(--surface2)', outline: 'none', boxSizing: 'border-box',
              resize: 'none', marginBottom: 20,
            }}
          />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8,
                fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer',
                background: 'none', color: 'var(--text2)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !dueDate}
              style={{
                padding: '8px 18px', border: 'none', borderRadius: 8,
                fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer',
                background: 'var(--text)', color: '#fff',
                opacity: loading || !name.trim() || !dueDate ? 0.5 : 1,
              }}
            >
              {loading ? 'Saving…' : 'Add milestone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await pmApi.listMilestones(token, projectId);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; due_date: string; description?: string }) => {
      const token = await getToken();
      return pmApi.createMilestone(token, projectId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] });
      setShowModal(false);
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
        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
          {yearMilestones.length} milestone{yearMilestones.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowModal(true)}
          style={{
            marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
            background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '7px 16px', cursor: 'pointer',
          }}
        >
          + Add milestone
        </button>
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

      {showModal && (
        <AddMilestoneModal
          onClose={() => setShowModal(false)}
          onSave={body => createMutation.mutate(body)}
          loading={createMutation.isPending}
          defaultYear={year}
        />
      )}
    </div>
  );
}
