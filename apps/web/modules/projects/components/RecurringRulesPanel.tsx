'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type RecurringRule } from '@/modules/projects/lib/api';
import { RecurringRuleModal } from './RecurringRuleModal';
import { Icon } from '@/modules/shared/components/ui/Icon';

const FREQUENCY_LABEL: Record<string, (n: number) => string> = {
  DAILY: n => (n === 1 ? 'Daily' : `Every ${n} days`),
  WEEKLY: n => (n === 1 ? 'Weekly' : `Every ${n} weeks`),
  MONTHLY: n => (n === 1 ? 'Monthly' : `Every ${n} months`),
};

interface Props {
  projectId: string;
}

export function RecurringRulesPanel({ projectId }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: rulesData } = useQuery({
    queryKey: ['recurring-rules', projectId],
    queryFn: async () => {
      const token = await getToken();
      return pmApi.listRecurringRules(token, projectId);
    },
  });
  const rules: RecurringRule[] = rulesData?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: async ({ ruleId, is_active }: { ruleId: string; is_active: boolean }) => {
      const token = await getToken();
      return pmApi.updateRecurringRule(token, projectId, ruleId, { is_active });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recurring-rules', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const token = await getToken();
      return pmApi.deleteRecurringRule(token, projectId, ruleId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recurring-rules', projectId] }),
  });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
          Recurring Tasks
        </p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 7, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Icon name="plus" size={12} color="#fff" /> New Rule
        </button>
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
        Automatically create tasks on a schedule.
      </p>

      {rules.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No recurring rules yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map(rule => (
            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <button
                type="button"
                onClick={() => toggleMutation.mutate({ ruleId: rule.id, is_active: !rule.is_active })}
                title={rule.is_active ? 'Active — click to pause' : 'Paused — click to activate'}
                style={{
                  width: 32, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: rule.is_active ? 'var(--green)' : 'var(--border)', position: 'relative',
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: rule.is_active ? 16 : 2,
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.15s ease',
                }} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.title}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>
                  {(FREQUENCY_LABEL[rule.frequency] ?? (() => rule.frequency))(rule.interval)}
                </div>
              </div>
              <button onClick={() => setEditingRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4 }} title="Edit rule">
                <Icon name="edit" size={13} />
              </button>
              <button onClick={() => deleteMutation.mutate(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4 }} title="Delete rule">
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && <RecurringRuleModal projectId={projectId} onClose={() => setShowCreate(false)} />}
      {editingRule && <RecurringRuleModal projectId={projectId} rule={editingRule} onClose={() => setEditingRule(null)} />}
    </div>
  );
}
