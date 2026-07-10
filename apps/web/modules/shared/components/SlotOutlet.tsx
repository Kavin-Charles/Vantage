'use client';

import React, { useEffect, useState } from 'react';
import { usePluginRegistry } from '@/modules/shared/contexts/PluginRuntimeContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

interface ResolvedSection {
  plugin_id: string;
  id: string;
  slot_id: string;
  label: string | null;
  priority: number;
}

interface Props {
  /** Page id from the slot catalog, e.g. "contact-detail". */
  page: string;
  /** Slot id within the page, e.g. "sidebar". */
  slot: string;
  /** Record context passed to section components. */
  recordId?: string;
  recordType?: string;
}

/**
 * Renders plugin-contributed sections for a page slot. Additive: it mounts
 * around existing page content and renders nothing when no plugin targets the
 * slot. The backend resolver decides which sections render and in what order;
 * the actual components come from the in-process plugin registry
 * (registered by each plugin's client bundle via vencore.registerSection).
 */
export function SlotOutlet({ page, slot, recordId, recordType }: Props) {
  const { registry } = usePluginRegistry();
  const getToken = useApiToken();
  const apiUrl = (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ?? '';
  const [sections, setSections] = useState<ResolvedSection[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/api/hub/sections/${page}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: ResolvedSection[] };
        if (active) setSections((json.data ?? []).filter((s) => s.slot_id === slot));
      } catch {
        /* sections are optional — never break the page */
      }
    })();
    return () => { active = false; };
  }, [page, slot, apiUrl, getToken]);

  // Re-render when a plugin bundle registers its section component late
  useEffect(() => {
    const handler = () => force((n) => n + 1);
    window.addEventListener('vencore:section:registered', handler);
    return () => window.removeEventListener('vencore:section:registered', handler);
  }, []);

  if (sections.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sections.map((s) => {
        const def = registry.sections.get(`${s.plugin_id}:${s.id}`);
        if (!def) return null; // component not registered yet
        const Component = def.component;
        return (
          <div key={`${s.plugin_id}:${s.id}`}>
            <Component recordId={recordId} recordType={recordType} />
          </div>
        );
      })}
    </div>
  );
}
