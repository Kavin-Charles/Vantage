'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useModules } from '@/modules/shared/contexts/modules';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { Icon } from '@/modules/shared/components/ui/Icon';

interface SubModuleMeta { id: string; name: string }
interface ModuleMeta {
  id: string;
  name: string;
  description: string;
  settingsHref: string | null;
  subModules?: SubModuleMeta[];
}

const CRM_SUBMODULES: SubModuleMeta[] = [
  { id: 'crm:pipeline',  name: 'Pipeline' },
  { id: 'crm:contacts',  name: 'Contacts' },
  { id: 'crm:companies', name: 'Companies' },
  { id: 'crm:tasks',     name: 'Tasks' },
];

const INFRA_SUBMODULES: SubModuleMeta[] = [
  { id: 'infra:servers',   name: 'Servers' },
  { id: 'infra:databases', name: 'Databases' },
  { id: 'infra:websites',  name: 'Websites' },
  { id: 'infra:alerts',    name: 'Alerts' },
];

const MODULE_META: ModuleMeta[] = [
  { id: 'dashboard', name: 'Dashboard', description: 'Custom dashboards and widget layouts.', settingsHref: '/settings/dashboards' },
  { id: 'crm', name: 'CRM', description: 'Contacts, companies, deals pipeline, and tasks.', settingsHref: '/settings/pipelines', subModules: CRM_SUBMODULES },
  { id: 'infra', name: 'Infrastructure', description: 'Servers, databases, website uptime, and alerting.', settingsHref: null, subModules: INFRA_SUBMODULES },
  { id: 'analytics', name: 'Analytics', description: 'Revenue, pipeline stats, and team leaderboard.',     settingsHref: null },
  { id: 'activity',  name: 'Activity',  description: 'Unified activity feed across all workspace records.', settingsHref: null },
  { id: 'projects',  name: 'Project Management', description: 'Projects, tasks, sprints, automations, and client portals.', settingsHref: '/settings/project-management/hooks' },
  { id: 'messaging', name: 'Messaging',          description: 'Real-time team messaging, channels, and direct messages.',  settingsHref: '/settings/messaging' },
];

export default function ModulesSettingsPage() {
  const { isEnabled, setEnabled, modules } = useModules();
  const rawEnabled = (id: string): boolean => modules.find(m => m.module_id === id)?.enabled ?? true;
  const getToken = useApiToken();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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
          <div key={mod.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            onContextMenu={e => {
              const items: ContextMenuItem[] = [
                { icon: 'check', label: isEnabled(mod.id) ? 'Disable' : 'Enable', onClick: () => void toggle(mod.id) },
                ...(mod.settingsHref ? [{ icon: 'open', label: 'View details', onClick: () => router.push(mod.settingsHref!) }] : []),
                { type: 'separator' as const },
                { icon: 'copy', label: 'Copy module name', onClick: () => navigator.clipboard.writeText(mod.name) },
              ];
              openMenu(e, items);
            }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {mod.subModules && mod.subModules.length > 0 && (
                <button
                  onClick={() => toggleExpanded(mod.id)}
                  title={expanded.has(mod.id) ? 'Hide pages' : 'Show pages'}
                  style={{
                    color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', padding: 2, transition: 'color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                  aria-label={expanded.has(mod.id) ? `Hide ${mod.name} pages` : `Show ${mod.name} pages`}
                  aria-expanded={expanded.has(mod.id)}
                >
                  <Icon name={expanded.has(mod.id) ? 'chevron' : 'chevron-right'} size={14} />
                </button>
              )}
              {mod.settingsHref && (
                <Link
                  href={mod.settingsHref}
                  title={`${mod.name} settings`}
                  style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center', transition: 'color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </Link>
              )}
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
          </div>
          {expanded.has(mod.id) && mod.subModules?.map(sub => {
            const parentOn = isEnabled(mod.id);
            const subOn = rawEnabled(sub.id);
            return (
              <div
                key={sub.id}
                onContextMenu={e => {
                  const items: ContextMenuItem[] = [
                    { icon: 'check', label: subOn ? 'Disable' : 'Enable', onClick: () => { if (parentOn) void toggle(sub.id); } },
                  ];
                  openMenu(e, items);
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 16px', marginLeft: 24, borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  opacity: parentOn ? 1 : 0.5,
                }}
              >
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>{sub.name}</p>
                <button
                  disabled={!parentOn || pending === sub.id}
                  onClick={() => void toggle(sub.id)}
                  style={{
                    position: 'relative', width: 38, height: 21, borderRadius: 999,
                    background: parentOn && subOn ? 'var(--green)' : 'var(--border)',
                    border: 'none', cursor: !parentOn || pending === sub.id ? 'default' : 'pointer',
                    transition: 'background .2s', flexShrink: 0, opacity: pending === sub.id ? 0.6 : 1,
                  }}
                  aria-label={`${subOn ? 'Disable' : 'Enable'} ${sub.name}`}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: parentOn && subOn ? 20 : 3,
                    width: 15, height: 15, borderRadius: '50%', background: '#fff',
                    transition: 'left .2s',
                  }} />
                </button>
              </div>
            );
          })}
          </div>
        ))}
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
