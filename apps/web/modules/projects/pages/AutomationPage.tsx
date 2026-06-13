'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface AutomationRule {
  id: string;
  project_id: string;
  name: string;
  is_active: boolean;
  trigger: { type: string; to_status_id?: string };
  actions: Array<{ type: string; [key: string]: unknown }>;
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  task_status_changed: 'Task status changed',
  task_overdue: 'Task becomes overdue',
  task_assigned: 'Task assigned',
  milestone_completed: 'Milestone completed',
  client_approved: 'Client approved',
  client_rejected: 'Client rejected',
  sprint_started: 'Sprint started',
  sprint_ended: 'Sprint ended',
};

const ACTION_LABELS: Record<string, string> = {
  send_notification: 'Send notification',
  change_task_status: 'Change task status',
  assign_task: 'Assign task',
  mark_milestone_complete: 'Mark milestone complete',
  send_webhook: 'Send webhook',
};

function formatTrigger(trigger: AutomationRule['trigger']): string {
  return TRIGGER_LABELS[trigger.type] ?? trigger.type;
}

function formatActions(actions: AutomationRule['actions']): string {
  return actions.map(a => ACTION_LABELS[a.type] ?? a.type).join(', ');
}

export default function AutomationPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    try {
      setIsLoading(true);
      const token = await getToken();
      const res = await apiFetch<{ data: AutomationRule[] }>(
        `/api/projects/${projectId}/automations`,
        { token },
      );
      setRules(res.data ?? []);
      setError(null);
    } catch {
      setError('Failed to load automation rules.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function toggleActive(rule: AutomationRule) {
    setToggling(rule.id);
    try {
      const token = await getToken();
      await apiFetch<{ data: AutomationRule }>(
        `/api/projects/${projectId}/automations/${rule.id}`,
        {
          token,
          method: 'PATCH',
          body: JSON.stringify({ is_active: !rule.is_active }),
        },
      );
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    } catch {
      // ignore — keep state unchanged
    } finally {
      setToggling(null);
    }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm('Delete this automation rule?')) return;
    setDeleting(ruleId);
    try {
      const token = await getToken();
      await apiFetch<{ data: { success: boolean } }>(
        `/api/projects/${projectId}/automations/${ruleId}`,
        { token, method: 'DELETE' },
      );
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  const MAX = 20;

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>
            Automations
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
            {rules.length}/{MAX} rules
          </p>
        </div>
      </div>

      {isLoading && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</p>
      )}

      {!isLoading && error && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--red)' }}>{error}</p>
      )}

      {!isLoading && !error && rules.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14,
        }}>
          No automation rules yet. Rules are created via the API.
        </div>
      )}

      {!isLoading && !error && rules.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map(rule => (
            <div
              key={rule.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '14px 16px',
                opacity: rule.is_active ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {rule.name}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                    <span style={{ color: 'var(--text2)' }}>When:</span> {formatTrigger(rule.trigger)}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    <span style={{ color: 'var(--text2)' }}>Then:</span> {formatActions(rule.actions)}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleActive(rule)}
                    disabled={toggling === rule.id}
                    style={{
                      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                      padding: '6px 10px', borderRadius: 6,
                      background: rule.is_active ? 'var(--surface2)' : 'var(--surface2)',
                      color: rule.is_active ? 'var(--green)' : 'var(--text3)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                  >
                    {toggling === rule.id ? '…' : rule.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    disabled={deleting === rule.id}
                    style={{
                      fontFamily: 'DM Sans', fontSize: 12,
                      padding: '6px 10px', borderRadius: 6,
                      background: 'transparent', color: 'var(--red)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                  >
                    {deleting === rule.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
