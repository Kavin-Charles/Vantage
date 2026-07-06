'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type AutomationRule } from '@/modules/projects/lib/api';
import { RuleCard } from '@/modules/projects/components/RuleCard';
import { RuleBuilder } from '@/modules/projects/components/RuleBuilder';
import { AutomationLogViewer } from '@/modules/projects/components/AutomationLogViewer';

const MAX_RULES = 20;

export default function AutomationPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['automation-rules', projectId],
    queryFn: async () => pmApi.listAutomationRules(await getToken(), projectId),
  });
  const rules: AutomationRule[] = data?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: async (rule: AutomationRule) => {
      const token = await getToken();
      return pmApi.updateAutomationRule(token, projectId, rule.id, { is_active: !rule.is_active });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['automation-rules', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const token = await getToken();
      return pmApi.deleteAutomationRule(token, projectId, ruleId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['automation-rules', projectId] }),
  });

  function handleDelete(rule: AutomationRule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    deleteMutation.mutate(rule.id);
  }

  if (isLoading) {
    return <div style={{ padding: 24, fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: "'IBM Plex Serif', serif", fontSize: 22, color: 'var(--text)', margin: '0 0 4px' }}>Automation</h2>
          <p style={{ fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>
            {rules.length}/{MAX_RULES} rules
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingRule(null); setBuilderOpen(true); }}
          disabled={rules.length >= MAX_RULES}
          style={{
            fontFamily: 'IBM Plex Sans', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer',
            opacity: rules.length >= MAX_RULES ? 0.5 : 1,
          }}
        >
          New Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div style={{ fontFamily: 'IBM Plex Sans', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', padding: '40px 0', textAlign: 'center' }}>
          No automation rules yet. Click "New Rule" to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              isToggling={toggleMutation.isPending && toggleMutation.variables?.id === rule.id}
              onToggle={() => toggleMutation.mutate(rule)}
              onEdit={() => { setEditingRule(rule); setBuilderOpen(true); }}
              onDelete={() => handleDelete(rule)}
            />
          ))}
        </div>
      )}

      <AutomationLogViewer projectId={projectId} />

      {builderOpen && (
        <RuleBuilder
          projectId={projectId}
          rule={editingRule ?? undefined}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </div>
  );
}
