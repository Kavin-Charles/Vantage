'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  pmApi, type AutomationRule, type AutomationTrigger, type AutomationAction,
  type TaskStatus, type ProjectMember, type Milestone, type CustomField,
} from '@/modules/projects/lib/api';

const TRIGGER_TYPES: AutomationTrigger['type'][] = [
  'task_status_changed', 'task_overdue', 'task_assigned', 'milestone_completed',
  'client_approved', 'client_rejected', 'sprint_started', 'sprint_ended',
];

const ACTION_TYPES: AutomationAction['type'][] = [
  'send_notification', 'change_task_status', 'assign_task', 'mark_milestone_complete',
  'send_webhook', 'create_task', 'set_custom_field',
];

function defaultAction(type: AutomationAction['type']): AutomationAction {
  switch (type) {
    case 'send_notification': return { type, user_ids: [], message: '' };
    case 'change_task_status': return { type, status_id: '' };
    case 'assign_task': return { type, user_id: '' };
    case 'mark_milestone_complete': return { type, milestone_id: '' };
    case 'send_webhook': return { type, url: '' };
    case 'create_task': return { type, title: '' };
    case 'set_custom_field': return { type, custom_field_id: '', value: '' };
  }
}

interface Props {
  projectId: string;
  rule?: AutomationRule;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
  fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'IBM Plex Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

export function RuleBuilder({ projectId, rule, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);

  const [name, setName] = useState(rule?.name ?? '');
  const [triggerType, setTriggerType] = useState<AutomationTrigger['type']>(rule?.trigger.type ?? 'task_status_changed');
  const [toStatusId, setToStatusId] = useState(rule?.trigger.to_status_id ?? '');
  const [actions, setActions] = useState<AutomationAction[]>(rule?.actions ?? [defaultAction('send_notification')]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    nameRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 150);
  }, [onClose]);

  const { data: statusesData } = useQuery({
    queryKey: ['statuses', projectId],
    queryFn: async () => pmApi.listStatuses(await getToken(), projectId),
  });
  const statuses: TaskStatus[] = statusesData?.data ?? [];

  const { data: membersData } = useQuery({
    queryKey: ['members', projectId],
    queryFn: async () => pmApi.listMembers(await getToken(), projectId),
  });
  const members: ProjectMember[] = membersData?.data ?? [];

  const { data: milestonesData } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => pmApi.listMilestones(await getToken(), projectId),
  });
  const milestones: Milestone[] = milestonesData?.data ?? [];

  const { data: fieldsData } = useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: async () => pmApi.listCustomFields(await getToken(), projectId),
  });
  const customFields: CustomField[] = fieldsData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const trigger: AutomationTrigger = triggerType === 'task_status_changed'
        ? { type: triggerType, ...(toStatusId ? { to_status_id: toStatusId } : {}) }
        : { type: triggerType };
      const body = { name: name.trim(), trigger, actions };
      return rule
        ? pmApi.updateAutomationRule(token, projectId, rule.id, body)
        : pmApi.createAutomationRule(token, projectId, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['automation-rules', projectId] });
      handleClose();
    },
  });

  function updateAction(index: number, next: AutomationAction) {
    setActions(prev => prev.map((a, i) => (i === index ? next : a)));
  }

  function removeAction(index: number) {
    setActions(prev => prev.filter((_, i) => i !== index));
  }

  function toggleUserId(action: AutomationAction & { type: 'send_notification' }, index: number, userId: string) {
    const next = action.user_ids.includes(userId)
      ? action.user_ids.filter(id => id !== userId)
      : [...action.user_ids, userId];
    updateAction(index, { ...action, user_ids: next });
  }

  const canSave = name.trim().length > 0 && actions.length > 0 && actions.length <= 10 && !saveMutation.isPending;

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
          width: 600, maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'IBM Plex Serif', fontSize: 18, color: 'var(--text)' }}>
            {rule ? 'Edit Rule' : 'New Rule'}
          </span>
          <button type="button" aria-label="Close" onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div>
          <label style={labelStyle}>Rule Name *</label>
          <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Notify on overdue" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>When</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={triggerType} onChange={e => setTriggerType(e.target.value as AutomationTrigger['type'])} style={{ ...inputStyle, cursor: 'pointer' }}>
              {TRIGGER_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            {triggerType === 'task_status_changed' && (
              <select value={toStatusId} onChange={e => setToStatusId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">any status</option>
                {statuses.map(s => <option key={s.id} value={s.id}>→ {s.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Then ({actions.length}/10)</label>
            <button
              type="button"
              onClick={() => setActions(prev => [...prev, defaultAction('send_notification')])}
              disabled={actions.length >= 10}
              style={{ fontFamily: 'IBM Plex Sans', fontSize: 12, fontWeight: 600, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', opacity: actions.length >= 10 ? 0.5 : 1 }}
            >
              + Add action
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actions.map((action, index) => (
              <div key={index} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select
                    value={action.type}
                    onChange={e => updateAction(index, defaultAction(e.target.value as AutomationAction['type']))}
                    style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}
                  >
                    {ACTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button type="button" onClick={() => removeAction(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '0 4px' }}>×</button>
                </div>

                {action.type === 'send_notification' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {members.map(m => (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => toggleUserId(action, index, m.user_id)}
                          style={{
                            fontFamily: 'IBM Plex Sans', fontSize: 12, padding: '4px 10px', borderRadius: 20,
                            border: '1px solid var(--border)', cursor: 'pointer',
                            background: action.user_ids.includes(m.user_id) ? 'var(--text)' : 'var(--surface)',
                            color: action.user_ids.includes(m.user_id) ? '#fff' : 'var(--text2)',
                          }}
                        >
                          {m.name ?? m.email}
                        </button>
                      ))}
                    </div>
                    <input
                      value={action.message}
                      onChange={e => updateAction(index, { ...action, message: e.target.value })}
                      placeholder="Notification message…"
                      style={inputStyle}
                    />
                  </div>
                )}

                {action.type === 'change_task_status' && (
                  <select value={action.status_id} onChange={e => updateAction(index, { ...action, status_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">select status…</option>
                    {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}

                {action.type === 'assign_task' && (
                  <select value={action.user_id} onChange={e => updateAction(index, { ...action, user_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">select member…</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name ?? m.email}</option>)}
                  </select>
                )}

                {action.type === 'mark_milestone_complete' && (
                  <select value={action.milestone_id} onChange={e => updateAction(index, { ...action, milestone_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">select milestone…</option>
                    {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}

                {action.type === 'send_webhook' && (
                  <input
                    type="url"
                    value={action.url}
                    onChange={e => updateAction(index, { ...action, url: e.target.value })}
                    placeholder="https://…"
                    style={inputStyle}
                  />
                )}

                {action.type === 'create_task' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      value={action.title}
                      onChange={e => updateAction(index, { ...action, title: e.target.value })}
                      placeholder="New task title…"
                      style={inputStyle}
                    />
                    <select
                      value={action.status_id ?? ''}
                      onChange={e => updateAction(index, { ...action, status_id: e.target.value || undefined })}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="">default status</option>
                      {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {action.type === 'set_custom_field' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={action.custom_field_id}
                      onChange={e => updateAction(index, { ...action, custom_field_id: e.target.value })}
                      style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}
                    >
                      <option value="">select field…</option>
                      {customFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <input
                      value={action.value}
                      onChange={e => updateAction(index, { ...action, value: e.target.value })}
                      placeholder="Value…"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {saveMutation.isError && (
          <p style={{ fontFamily: 'IBM Plex Sans', fontSize: 12, color: 'var(--red)', margin: 0 }}>Failed to save rule.</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button type="button" onClick={handleClose} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'none', fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: 8,
              background: canSave ? 'var(--text)' : 'var(--surface2)',
              color: canSave ? '#fff' : 'var(--text3)',
              fontFamily: 'IBM Plex Sans', fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saveMutation.isPending ? 'Saving…' : rule ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
