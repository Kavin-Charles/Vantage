'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { pmApi, type TaskWithAssignees, type TaskStatus, type Comment } from '@/modules/projects/lib/api';

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};

interface Props {
  projectId: string;
  task: TaskWithAssignees;
  statuses: TaskStatus[];
  onClose: () => void;
  onUpdate: (patch: Partial<TaskWithAssignees>) => void;
}

export function TaskDetailPanel({ projectId, task, statuses, onClose, onUpdate }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(task.title);
  const [commentBody, setCommentBody] = useState('');

  useEffect(() => { setTitleVal(task.title); }, [task.title]);

  const { data: commentsData } = useQuery({
    queryKey: ['comments', projectId, task.id],
    queryFn: async () => pmApi.listComments(await getToken(), projectId, task.id),
  });
  const comments: Comment[] = commentsData?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: async (patch: Parameters<typeof pmApi.updateTask>[3]) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, task.id, patch);
    },
    onSuccess: (res) => {
      onUpdate(res.data as Partial<TaskWithAssignees>);
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (body: string) => {
      const token = await getToken();
      return pmApi.createComment(token, projectId, task.id, body);
    },
    onSuccess: () => {
      setCommentBody('');
      void qc.invalidateQueries({ queryKey: ['comments', projectId, task.id] });
    },
  });

  function saveTitle() {
    setEditingTitle(false);
    if (titleVal.trim() && titleVal !== task.title) {
      updateMutation.mutate({ title: titleVal.trim() });
    }
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 460,
    background: 'var(--surface)', borderLeft: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', zIndex: 50,
    boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
  };

  const selectStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px',
    fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
    cursor: 'pointer', outline: 'none',
  };

  const currentStatus = statuses.find(s => s.id === task.status_id);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'transparent' }}
      />
      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {editingTitle ? (
            <input
              autoFocus
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              style={{
                fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px',
                background: 'var(--bg)', outline: 'none', flex: 1,
              }}
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              style={{
                fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)',
                margin: 0, cursor: 'text', flex: 1, paddingRight: 12,
              }}
              title="Click to edit"
            >
              {task.title}
            </h2>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 6, flexShrink: 0 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Status */}
            <div>
              <div style={labelStyle}>Status</div>
              <select
                style={{ ...selectStyle, width: '100%' }}
                value={task.status_id}
                onChange={e => updateMutation.mutate({ status_id: e.target.value })}
              >
                {statuses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {currentStatus && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: currentStatus.color }} />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)' }}>{currentStatus.name}</span>
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <div style={labelStyle}>Priority</div>
              <select
                style={{ ...selectStyle, width: '100%', color: PRIORITY_COLORS[task.priority] ?? 'var(--text)' }}
                value={task.priority}
                onChange={e => updateMutation.mutate({ priority: e.target.value })}
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>

            {/* Due date */}
            <div>
              <div style={labelStyle}>Due date</div>
              <input
                type="date"
                style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}
                value={task.due_date ?? ''}
                onChange={e => updateMutation.mutate({ due_date: e.target.value || null })}
              />
            </div>

            {/* Client visible */}
            <div>
              <div style={labelStyle}>Client visible</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 8 }}>
                <input
                  type="checkbox"
                  checked={task.client_visible}
                  onChange={e => updateMutation.mutate({ client_visible: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)' }}>
                  {task.client_visible ? 'Visible' : 'Hidden'}
                </span>
              </label>
            </div>
          </div>

          {/* Assignees */}
          {task.assignees.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={labelStyle}>Assignees</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {task.assignees.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'var(--surface2)', borderRadius: 20,
                      padding: '4px 10px 4px 6px', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', background: 'var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600, color: 'var(--text2)',
                    }}>
                      {(a.name || a.email)[0]?.toUpperCase()}
                    </div>
                    {a.name || a.email}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <div style={{ ...labelStyle, marginBottom: 12 }}>Comments ({comments.length})</div>
            {comments.length === 0 ? (
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>No comments yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {comments.map(c => (
                  <div key={c.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                        {c.author_name ?? 'Unknown'}
                      </span>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', margin: 0 }}>
                      {typeof c.body === 'string' ? c.body : JSON.stringify(c.body)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <textarea
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              placeholder="Add a comment…"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
                borderRadius: 10, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)',
                background: 'var(--bg)', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => { if (commentBody.trim()) commentMutation.mutate(commentBody.trim()); }}
              disabled={!commentBody.trim() || commentMutation.isPending}
              style={{
                marginTop: 8, background: 'var(--text)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '7px 16px', fontFamily: 'DM Sans', fontSize: 13,
                cursor: 'pointer', opacity: !commentBody.trim() || commentMutation.isPending ? 0.5 : 1,
              }}
            >
              {commentMutation.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
