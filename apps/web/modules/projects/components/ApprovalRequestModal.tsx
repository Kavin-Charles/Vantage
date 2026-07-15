'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskWithAssignees, type Milestone } from '@/modules/projects/lib/api';

interface Props {
  projectId: string;
  portalId: string;
  onClose: () => void;
}

const INPUT: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13, padding: '8px 10px',
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
  color: 'var(--text2)', display: 'block', marginBottom: 6,
};

export function ApprovalRequestModal({ projectId, portalId, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    task_id: '',
    milestone_id: '',
    recipient_email: '',
  });

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => pmApi.listTasks(await getToken(), projectId),
  });

  const { data: milestonesData } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => pmApi.listMilestones(await getToken(), projectId),
  });

  const mut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.createApproval(token, projectId, {
        portal_id: portalId,
        task_id: form.task_id || undefined,
        milestone_id: form.milestone_id || undefined,
        recipient_email: form.recipient_email.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals', projectId, portalId] });
      onClose();
    },
  });

  const tasks = tasksData?.data ?? [];
  const milestones = milestonesData?.data ?? [];

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300 }}
      />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 301, width: 460, maxWidth: '90vw',
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)', margin: 0 }}>
            New Approval Request
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL}>
              Linked Task{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span>
            </label>
            <select
              value={form.task_id}
              onChange={e => setForm(f => ({ ...f, task_id: e.target.value }))}
              style={{ ...INPUT, cursor: 'pointer' }}
            >
              <option value="">— None —</option>
              {tasks.map((t: TaskWithAssignees) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL}>
              Linked Milestone{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span>
            </label>
            <select
              value={form.milestone_id}
              onChange={e => setForm(f => ({ ...f, milestone_id: e.target.value }))}
              style={{ ...INPUT, cursor: 'pointer' }}
            >
              <option value="">— None —</option>
              {milestones.map((m: Milestone) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL}>
              Send approval link to{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional — client will get email with approve/reject links)</span>
            </label>
            <input
              type="email"
              value={form.recipient_email}
              onChange={e => setForm(f => ({ ...f, recipient_email: e.target.value }))}
              placeholder="client@example.com"
              style={INPUT}
            />
          </div>

          {mut.isError && (
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: 0 }}>
              Failed to create approval request.
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, padding: '8px 16px',
                borderRadius: 8, background: 'none',
                color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              style={{
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                padding: '8px 16px', borderRadius: 8,
                background: 'var(--text)', color: '#fff',
                border: 'none', cursor: 'pointer',
                opacity: mut.isPending ? 0.6 : 1,
              }}
            >
              {mut.isPending ? 'Creating…' : 'Create Request'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
