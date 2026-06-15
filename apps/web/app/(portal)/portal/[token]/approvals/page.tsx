'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ApprovalRequest {
  id: string;
  project_id: string;
  portal_id: string;
  task_id: string | null;
  milestone_id: string | null;
  attachment_id: string | null;
  status: string;
  note: string | null;
  responded_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  PENDING:  { label: 'Pending',  bg: 'var(--amber-bg, #fef3c7)',  color: 'var(--amber, #92400e)' },
  APPROVED: { label: 'Approved', bg: 'var(--green-bg, #d8f3dc)',  color: 'var(--green, #2d6a4f)' },
  REJECTED: { label: 'Rejected', bg: 'var(--red-bg, #fee2e2)',    color: 'var(--red, #991b1b)'   },
};

export default function PortalApprovalsPage() {
  const { token } = useParams<{ token: string }>();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responding, setResponding] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    loadApprovals();
  }, [token]);

  function loadApprovals() {
    fetch(`/api/portal/${token}/approvals`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error.message); return; }
        setApprovals(json.data ?? []);
      })
      .catch(() => setError('Failed to load approvals'))
      .finally(() => setLoading(false));
  }

  async function respond(approvalId: string, status: 'APPROVED' | 'REJECTED') {
    setResponding(approvalId);
    try {
      const res = await fetch(`/api/portal/${token}/approvals/${approvalId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, note: noteMap[approvalId] ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message ?? 'Failed to respond'); return; }
      setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status, note: noteMap[approvalId] ?? null, responded_at: new Date().toISOString() } : a));
    } finally {
      setResponding(null);
    }
  }

  if (loading) return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text3, #9e998f)' }}>Loading…</p>;
  if (error)   return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--red, #991b1b)' }}>{error}</p>;

  if (approvals.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3, #9e998f)', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
        No approval requests at this time.
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', marginBottom: 16 }}>
        Approvals
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {approvals.map(approval => {
          const style = STATUS_STYLES[approval.status] ?? STATUS_STYLES.PENDING;
          const isPending = approval.status === 'PENDING';
          return (
            <div
              key={approval.id}
              style={{
                background: 'var(--surface, #fff)',
                border: '1px solid var(--border, #e4e0d8)',
                borderRadius: 10,
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isPending ? 12 : 0 }}>
                <span style={{ flex: 1, fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text2, #6b665c)' }}>
                  Requested {new Date(approval.created_at).toLocaleDateString()}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: style.bg,
                  color: style.color,
                }}>
                  {style.label}
                </span>
              </div>

              {approval.note && !isPending && (
                <p style={{ fontSize: 13, color: 'var(--text2, #6b665c)', margin: '8px 0 0', fontStyle: 'italic' }}>
                  "{approval.note}"
                </p>
              )}

              {isPending && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    placeholder="Add a note (optional)"
                    value={noteMap[approval.id] ?? ''}
                    onChange={e => setNoteMap(prev => ({ ...prev, [approval.id]: e.target.value }))}
                    rows={2}
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 13,
                      padding: '8px 10px',
                      borderRadius: 7,
                      border: '1px solid var(--border, #e4e0d8)',
                      background: 'var(--bg, #f7f6f2)',
                      color: 'var(--text, #1a1814)',
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => respond(approval.id, 'APPROVED')}
                      disabled={responding === approval.id}
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        padding: '7px 14px',
                        borderRadius: 7,
                        background: 'var(--green-bg, #d8f3dc)',
                        color: 'var(--green, #2d6a4f)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {responding === approval.id ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => respond(approval.id, 'REJECTED')}
                      disabled={responding === approval.id}
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        padding: '7px 14px',
                        borderRadius: 7,
                        background: 'var(--red-bg, #fee2e2)',
                        color: 'var(--red, #991b1b)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {responding === approval.id ? '…' : 'Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
