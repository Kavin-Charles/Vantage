'use client';

import { useState } from 'react';
import { useModules } from '@/modules/shared/contexts/modules';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

const MODULE_META = [
  { id: 'contacts',  name: 'Contacts',  description: 'Contact management, profiles, and history.'       },
  { id: 'companies', name: 'Companies', description: 'Company records and relationships.'                 },
  { id: 'pipelines', name: 'Pipelines', description: 'Deals pipeline, items, and conversions.'            },
  { id: 'tasks',     name: 'Tasks',     description: 'Task management and due date tracking.'             },
  { id: 'websites',   name: 'Websites',   description: 'Website uptime monitoring and SSL expiry.'          },
  { id: 'servers',    name: 'Servers',    description: 'Server monitoring and agent heartbeats.'            },
  { id: 'databases',  name: 'Databases',  description: 'Database health monitoring and connection management.' },
  { id: 'analytics', name: 'Analytics', description: 'Revenue, pipeline stats, and team leaderboard.'    },
  { id: 'activity',  name: 'Activity',  description: 'Unified activity feed across all workspace records.'},
];

export default function ModulesSettingsPage() {
  const { isEnabled, setEnabled } = useModules();
  const getToken = useApiToken();
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(moduleId: string) {
    const next = !isEnabled(moduleId);
    setPending(moduleId);
    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';
      const res = await fetch(`${apiUrl}/api/workspace/modules/${moduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setEnabled(moduleId, next);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Modules</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, marginTop: 0 }}>
        Enable or disable features for your workspace.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MODULE_META.map(mod => (
          <div
            key={mod.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{mod.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{mod.description}</p>
            </div>
            <button
              disabled={pending === mod.id}
              onClick={() => void toggle(mod.id)}
              style={{
                position: 'relative', width: 44, height: 24, borderRadius: 999,
                background: isEnabled(mod.id) ? 'var(--green)' : 'var(--border)',
                border: 'none', cursor: pending === mod.id ? 'default' : 'pointer',
                transition: 'background .2s', flexShrink: 0, opacity: pending === mod.id ? 0.6 : 1,
              }}
              aria-label={`${isEnabled(mod.id) ? 'Disable' : 'Enable'} ${mod.name}`}
            >
              <span style={{
                position: 'absolute', top: 3, left: isEnabled(mod.id) ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left .2s',
              }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
