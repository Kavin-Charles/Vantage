'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getContact, updateContact } from '@/modules/contacts/lib/contacts';
import { listActivity, createActivity } from '@vencore/api-client';
import { listTasks, createTask, updateTask, deleteTask } from '@vencore/api-client';
import { ContactForm } from './ContactForm';
import type { Contact, Activity, Task } from '@vencore/types';

const ACTIVITY_ICONS: Record<string, string> = {
  email:   '✉',
  call:    '📞',
  note:    '📝',
  meeting: '🤝',
  deal_change: '💼',
  infra_alert: '⚠',
};

const ACTIVITY_TYPES = [
  { value: 'note',    label: 'Note' },
  { value: 'email',   label: 'Email' },
  { value: 'call',    label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
] as const;

interface Props {
  contactId: string;
  onClose: () => void;
}

export function ContactDrawer({ contactId, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<'note' | 'email' | 'call' | 'meeting'>('note');
  const [logBody, setLogBody] = useState('');
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const { data: contactData, isLoading: contactLoading } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => getContact(await getToken(), contactId),
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['contact-activity', contactId],
    queryFn: async () => listActivity(await getToken(), { contact_id: contactId, limit: 20 }),
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['contact-tasks', contactId],
    queryFn: async () => listTasks(await getToken(), { contact_id: contactId }),
  });

  const logMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createActivity(token, { type: logType, body: logBody || undefined, contact_id: contactId });
    },
    onSuccess: () => {
      setLogBody('');
      setLogOpen(false);
      void qc.invalidateQueries({ queryKey: ['contact-activity', contactId] });
      void qc.invalidateQueries({ queryKey: ['contact', contactId] });
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const addTaskMut = useMutation({
    mutationFn: async (title: string) => {
      const token = await getToken();
      return createTask(token, { title, contact_id: contactId });
    },
    onSuccess: () => {
      setNewTaskTitle('');
      setAddingTask(false);
      void qc.invalidateQueries({ queryKey: ['contact-tasks', contactId] });
    },
  });

  const toggleTaskMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'todo' | 'done' }) => {
      const token = await getToken();
      return updateTask(token, id, { status });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contact-tasks', contactId] });
    },
  });

  const deleteTaskMut = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return deleteTask(token, id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contact-tasks', contactId] });
    },
  });

  const contact = contactData?.data;
  const activities = activityData?.data ?? [];
  const tasks = tasksData?.data ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)',
          zIndex: 200, transition: 'opacity .15s',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 480, maxWidth: '95vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 201,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          {contact && (
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--text)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 600, flexShrink: 0,
            }}>
              {contact.name.charAt(0).toUpperCase()}
            </div>
          )}
          {!contact && <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface2)' }} />}

          <div style={{ flex: 1, minWidth: 0 }}>
            {contactLoading && <div style={{ height: 14, width: 140, borderRadius: 6, background: 'var(--surface2)' }} />}
            {contact && (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', lineHeight: 1.3 }}>{contact.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</div>
              </>
            )}
          </div>

          {contact && <Badge label={contact.status} color={statusColor[contact.status] ?? 'gray'} />}

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <Button onClick={() => setEditMode(true)} style={{ fontSize: 12, padding: '4px 10px' }}>Edit</Button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Meta row */}
        {contact && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, flexShrink: 0, flexWrap: 'wrap' }}>
            {contact.phone && (
              <MetaItem label="Phone" value={contact.phone} />
            )}
            <MetaItem
              label="Last contacted"
              value={contact.last_contacted_at ? new Date(contact.last_contacted_at).toLocaleDateString() : 'Never'}
            />
            <MetaItem
              label="Added"
              value={new Date(contact.created_at).toLocaleDateString()}
            />
          </div>
        )}

        {/* Log activity bar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {!logOpen ? (
            <Button onClick={() => setLogOpen(true)} style={{ fontSize: 12 }}>+ Log activity</Button>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {ACTIVITY_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setLogType(t.value)}
                    style={{
                      padding: '4px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: logType === t.value ? '1px solid var(--text)' : '1px solid var(--border)',
                      background: logType === t.value ? 'var(--text)' : 'var(--surface)',
                      color: logType === t.value ? '#fff' : 'var(--text2)',
                      fontWeight: 500,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                value={logBody}
                onChange={e => setLogBody(e.target.value)}
                placeholder="Add notes…"
                rows={3}
                style={{
                  width: '100%', resize: 'vertical',
                  padding: '8px 10px', fontSize: 13, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                <Button onClick={() => { setLogOpen(false); setLogBody(''); }}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={loggingActivity}
                  onClick={async () => {
                    setLoggingActivity(true);
                    await logMut.mutateAsync();
                    setLoggingActivity(false);
                  }}
                >
                  {loggingActivity ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tasks */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Tasks</span>
            <button
              onClick={() => setAddingTask(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text2)', padding: '2px 4px' }}
            >
              + Add
            </button>
          </div>

          {tasksLoading && <SkeletonLines count={2} />}

          {!tasksLoading && tasks.length === 0 && !addingTask && (
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>No tasks yet.</p>
          )}

          {tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => toggleTaskMut.mutate({ id: task.id, status: task.status === 'todo' ? 'done' : 'todo' })}
              onDelete={() => deleteTaskMut.mutate(task.id)}
            />
          ))}

          {addingTask && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                autoFocus
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTaskTitle.trim()) addTaskMut.mutate(newTaskTitle.trim());
                  if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle(''); }
                }}
                placeholder="Task title… (Enter to save)"
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none',
                }}
              />
              <Button onClick={() => { setAddingTask(false); setNewTaskTitle(''); }}>Cancel</Button>
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 12 }}>
            Activity
          </span>

          {activityLoading && <SkeletonLines count={4} />}

          {!activityLoading && activities.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>No activity yet. Log the first one above.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activities.map((a, i) => (
              <ActivityRow key={a.id} activity={a} last={i === activities.length - 1} />
            ))}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editMode && contact && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', width: 460, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-modal)' }}>
            <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Edit {contact.name}</span>
              <button onClick={() => setEditMode(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <ContactForm
                contact={contact}
                onDone={() => {
                  setEditMode(false);
                  void qc.invalidateQueries({ queryKey: ['contact', contactId] });
                  void qc.invalidateQueries({ queryKey: ['contacts'] });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
          border: task.status === 'done' ? 'none' : '1px solid var(--border2)',
          background: task.status === 'done' ? 'var(--green)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {task.status === 'done' && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </button>
      <span style={{ flex: 1, fontSize: 13, color: task.status === 'done' ? 'var(--text3)' : 'var(--text)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
        {task.title}
      </span>
      {task.due_date && (
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
          {new Date(task.due_date).toLocaleDateString()}
        </span>
      )}
      <button
        onClick={onDelete}
        title="Delete task"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
          color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hovered ? 1 : 0, transition: 'opacity .1s', flexShrink: 0,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  );
}

function ActivityRow({ activity, last }: { activity: Activity; last: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, paddingBottom: last ? 0 : 12, marginBottom: last ? 0 : 12, borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'var(--surface2)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12,
      }}>
        {ACTIVITY_ICONS[activity.type] ?? '•'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{activity.type}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(activity.created_at).toLocaleString()}</span>
        </div>
        {activity.body && (
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.4, margin: 0 }}>{activity.body}</p>
        )}
      </div>
    </div>
  );
}

function SkeletonLines({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: 12, borderRadius: 6, background: 'var(--surface2)', width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}
