'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { crossModuleApi, type CrossModuleSettingKey } from '@/modules/projects/lib/api';

interface SettingMeta {
  key: CrossModuleSettingKey;
  label: string;
  description: string;
  group: string;
}

const SETTINGS: SettingMeta[] = [
  {
    key: 'pm.deal_link_enabled',
    label: 'Link projects to deals and contacts',
    description: 'Allow a project to be linked to a CRM deal or contact. Linked projects appear in the deal and contact detail panels.',
    group: 'CRM → Projects',
  },
  {
    key: 'pm.deal_close_auto_spawn',
    label: 'Auto-create project when deal is won',
    description: 'When a deal moves to a Won stage, automatically create a linked project for it. Requires "Link projects to deals" to be enabled.',
    group: 'CRM → Projects',
  },
  {
    key: 'pm.project_complete_deal_stage',
    label: 'Move deal to Won when project completes',
    description: 'When a project is marked complete, automatically advance its linked deal to the pipeline\'s Won stage.',
    group: 'CRM → Projects',
  },
  {
    key: 'crm.project_health_on_record',
    label: 'Show project health on CRM records',
    description: 'Display the linked project\'s health status (On Track / At Risk / Off Track) inside the contact and deal detail panels.',
    group: 'Projects → CRM',
  },
];

type CrossModuleSettingsResponse = { data: Record<CrossModuleSettingKey, boolean> };

export default function IntegrationsSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<CrossModuleSettingsResponse>({
    queryKey: ['cross-module-settings'],
    queryFn: async () => crossModuleApi.list(await getToken()),
  });

  const settings = data?.data ?? ({} as Record<CrossModuleSettingKey, boolean>);

  function isEnabled(key: CrossModuleSettingKey) {
    return settings[key] ?? false;
  }

  const toggleMut = useMutation({
    mutationFn: async ({ key, enabled }: { key: CrossModuleSettingKey; enabled: boolean }) => {
      const token = await getToken();
      return crossModuleApi.patch(token, key, enabled);
    },
    onSuccess: (_, { key, enabled }) => {
      qc.setQueryData<CrossModuleSettingsResponse>(['cross-module-settings'], prev => {
        if (!prev) return prev;
        return { ...prev, data: { ...prev.data, [key]: enabled } };
      });
    },
  });

  const groups = Array.from(new Set(SETTINGS.map(s => s.group)));

  return (
    <div style={{ maxWidth: 640 }}>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Integrations</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, marginTop: 0 }}>
        Configure how modules interact with each other. Changes apply workspace-wide.
      </p>

      {isLoading && (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      )}

      {!isLoading && groups.map((group, gi) => (
        <div key={group} style={{ marginBottom: 28, animation: 'fadeInUp .25s ease both', animationDelay: `${gi * 40}ms` }}>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
            color: 'var(--text3)', textTransform: 'uppercase',
            letterSpacing: '0.07em', margin: '0 0 10px',
          }}>
            {group}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SETTINGS.filter(s => s.group === group).map((s, i) => {
              const enabled = isEnabled(s.key);
              const pending = toggleMut.isPending && toggleMut.variables?.key === s.key;
              return (
                <div
                  key={s.key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    animation: 'fadeInUp .25s ease both',
                    animationDelay: `${(gi * 4 + i) * 35}ms`,
                  }}
                >
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>{s.description}</p>
                  </div>
                  <button
                    disabled={pending}
                    onClick={() => toggleMut.mutate({ key: s.key, enabled: !enabled })}
                    style={{
                      position: 'relative', width: 44, height: 24, borderRadius: 999,
                      background: enabled ? 'var(--green)' : 'var(--border)',
                      border: 'none', cursor: pending ? 'default' : 'pointer',
                      transition: 'background .2s', flexShrink: 0,
                      opacity: pending ? 0.6 : 1,
                    }}
                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${s.label}`}
                  >
                    <span style={{
                      position: 'absolute', top: 3,
                      left: enabled ? 23 : 3,
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fff', transition: 'left .2s',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
