'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi } from '@/modules/projects/lib/api';
import type { ApprovalRequest } from '@/modules/projects/lib/api';
import { ApprovalBadge } from './ApprovalBadge';
import { ApprovalRequestModal } from './ApprovalRequestModal';

interface Props {
  projectId: string;
  portalId: string;
}

const STATUS_STYLES: Record<ApprovalRequest['status'], { bg: string; color: string; label: string }> = {
  PENDING:  { bg: 'var(--amber-bg, #fef3c7)',  color: 'var(--amber, #92400e)',  label: 'Pending'  },
  APPROVED: { bg: 'var(--green-bg, #d8f3dc)',  color: 'var(--green, #2d6a4f)',  label: 'Approved' },
  REJECTED: { bg: 'var(--red-bg, #fee2e2)',    color: 'var(--red, #991b1b)',    label: 'Rejected' },
};

export function ApprovalsPanel({ projectId, portalId }: Props) {
  const getToken = useApiToken();
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', projectId, portalId],
    queryFn: async () => pmApi.listApprovals(await getToken(), projectId, portalId),
  });

  const approvals: ApprovalRequest[] = data?.data ?? [];
  const pending = approvals.filter((a: ApprovalRequest) => a.status === 'PENDING').length;

  return (
    <>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Approvals
          </span>
          <ApprovalBadge pending={pending} total={approvals.length} />
          <button
            onClick={() => setShowModal(true)}
            style={{
              marginLeft: 'auto',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
              padding: '4px 10px', borderRadius: 6,
              background: 'var(--text)', color: '#fff',
              border: 'none', cursor: 'pointer',
            }}
          >
            + New Request
          </button>
        </div>

        {isLoading && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
        )}

        {!isLoading && approvals.length === 0 && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
            No approval requests yet.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {approvals.map((a: ApprovalRequest, i: number) => {
            const s = STATUS_STYLES[a.status] ?? STATUS_STYLES.PENDING;
            return (
              <div
                key={a.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bg)', borderRadius: 8,
                  border: '1px solid var(--border)',
                  animation: 'fadeInUp .22s ease both',
                  animationDelay: `${i * 25}ms`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                    Requested {new Date(a.created_at).toLocaleDateString()}
                    {a.recipient_email && (
                      <span style={{ marginLeft: 8, color: 'var(--text3)' }}>→ {a.recipient_email}</span>
                    )}
                  </div>
                  {a.note && (
                    <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)', margin: '4px 0 0', fontStyle: 'italic' }}>
                      "{a.note}"
                    </p>
                  )}
                  {a.responded_at && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                      Responded {new Date(a.responded_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                    padding: '2px 8px', borderRadius: 20,
                    background: s.bg, color: s.color, flexShrink: 0,
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <ApprovalRequestModal
          projectId={projectId}
          portalId={portalId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
