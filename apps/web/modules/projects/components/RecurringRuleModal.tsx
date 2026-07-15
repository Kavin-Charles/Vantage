'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskStatus, type ProjectMember, type RecurringRule } from '@/modules/projects/lib/api';

const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

interface Props {
  projectId: string;
  rule?: RecurringRule | null;
  onClose: () => void;
}

export function RecurringRuleModal({ projectId, rule, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [title, setTitle] = useState(rule?.title ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [statusId, setStatusId] = useState(rule?.status_id ?? '');
  const [priority, setPriority] = useState(rule?.priority ?? 'MEDIUM');
  const [frequency, setFrequency] = useState<typeof FREQUENCIES[number]>(rule?.frequency ?? 'WEEKLY');
  const [interval_, setInterval_] = useState(rule?.interval ?? 1);
  const [selectedIds, setSelectedIds] = useState<string[]>(rule?.assignee_ids ?? []);
  const [visible, setVisible] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 150);
  }, [onClose]);

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const res = await pmApi.listStatuses(await getToken(), projectId);
      return res.data ?? [];
    },
  });

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ['members', projectId],
    queryFn: async () => {
      const res = await pmApi.listMembers(await getToken(), projectId);
      return res.data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        status_id: statusId || undefined,
        priority,
        assignee_ids: selectedIds,
        frequency,
        interval: interval_,
      };
      return rule
        ? pmApi.updateRecurringRule(token, projectId, rule.id, body)
        : pmApi.createRecurringRule(token, projectId, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recurring-rules', projectId] });
      handleClose();
    },
  });

  function toggleMember(userId: string) {
    setSelectedIds(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));
  }

  const canSubmit = title.trim().length > 0 && interval_ >= 1 && !saveMutation.isPending;

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
    fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: `rgba(0,0,0,${visible ? 0.3 : 0})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>
            {rule ? 'Edit Recurring Task' : 'New Recurring Task'}
          </span>
          <button type="button" onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div>
          <label style={labelStyle}>Title *</label>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Repeats</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as typeof FREQUENCIES[number])} style={{ ...inputStyle, cursor: 'pointer' }}>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div style={{ width: 100 }}>
            <label style={labelStyle}>Every</label>
            <input type="number" min={1} max={365} value={interval_} onChange={e => setInterval_(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <select value={statusId} onChange={e => setStatusId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Default</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Assignees</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {members.map(m => {
              const selected = selectedIds.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleMember(m.user_id)}
                  style={{
                    padding: '5px 11px', borderRadius: 20,
                    border: `1px solid ${selected ? 'var(--text)' : 'var(--border)'}`,
                    background: selected ? 'var(--text)' : 'var(--bg)',
                    color: selected ? '#fff' : 'var(--text2)',
                    fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {m.name ?? m.email}
                </button>
              );
            })}
            {members.length === 0 && (
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>No members in this project.</span>
            )}
          </div>
        </div>

        {saveMutation.isError && (
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', margin: 0 }}>Failed to save rule.</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleClose}
            style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'none', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: 8,
              background: canSubmit ? 'var(--text)' : 'var(--surface2)',
              color: canSubmit ? '#fff' : 'var(--text3)',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {saveMutation.isPending ? 'Saving…' : rule ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
