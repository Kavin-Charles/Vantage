'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskStatus, type ProjectMember } from '@/modules/projects/lib/api';
import { AvatarGroup } from './AvatarGroup';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
type Priority = typeof PRIORITIES[number];

interface Props {
  projectId: string;
  defaultStatusId?: string;
  onClose: () => void;
}

export function TaskCreateModal({ projectId, defaultStatusId, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [statusId, setStatusId] = useState(defaultStatusId ?? '');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.createTask(token, projectId, {
        title: title.trim(),
        status_id: statusId || statuses[0]?.id,
        priority,
        assignee_ids: selectedIds,
        due_date: dueDate || null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      onClose();
    },
  });

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 150);
  }

  function toggleMember(userId: string) {
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  const selectedAssignees = members
    .filter(m => selectedIds.includes(m.user_id))
    .map(m => ({ id: m.user_id, name: m.name ?? '', email: m.email ?? '' }));

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
    fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
    outline: 'none', width: '100%', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
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
          width: 520, background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>New Task</span>
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: 4,
              transition: 'color 0.15s ease',
            }}
          >×</button>
        </div>

        {/* Title */}
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) createMutation.mutate(); }}
            placeholder="Task title…"
            style={inputStyle}
          />
        </div>

        {/* Status + Priority row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <select
              value={statusId}
              onChange={e => setStatusId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {statuses.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  style={{
                    flex: 1, padding: '7px 0', border: '1px solid var(--border)',
                    borderRadius: 6, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    background: priority === p ? 'var(--text)' : 'var(--bg)',
                    color: priority === p ? '#fff' : 'var(--text3)',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Assignees */}
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>Assignees</label>
          <button
            onClick={() => setMemberPickerOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
              background: 'var(--bg)', cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.15s ease',
            }}
          >
            {selectedAssignees.length > 0
              ? <AvatarGroup assignees={selectedAssignees} size={22} />
              : <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Select members…</span>
            }
          </button>
          {memberPickerOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              opacity: memberPickerOpen ? 1 : 0,
              transform: memberPickerOpen ? 'translateY(0)' : 'translateY(-4px)',
              transition: 'opacity 0.12s ease, transform 0.12s ease',
              maxHeight: 200, overflowY: 'auto',
            }}>
              {members.length === 0 && (
                <div style={{ padding: '12px 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>
                  No members in this project.
                </div>
              )}
              {members.map(m => {
                const selected = selectedIds.includes(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggleMember(m.user_id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', background: selected ? 'var(--surface2)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--surface2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
                    }}>
                      {((m.name ?? m.email ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('')).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: selected ? 600 : 400 }}>
                        {m.name ?? 'Unknown'}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>{m.email}</div>
                    </div>
                    {selected && (
                      <span style={{ marginLeft: 'auto', color: 'var(--text)', fontSize: 14 }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Due Date */}
        <div>
          <label style={labelStyle}>Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8,
              background: 'none', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: 8,
              background: canSubmit ? 'var(--text)' : 'var(--surface2)',
              color: canSubmit ? '#fff' : 'var(--text3)',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {createMutation.isPending ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
