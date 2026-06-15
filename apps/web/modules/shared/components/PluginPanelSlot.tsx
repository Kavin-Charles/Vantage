'use client';

import React, { useState } from 'react';
import { usePluginRegistry, PluginIframeSlot } from '@/modules/shared/contexts/PluginRuntimeContext';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';

interface Props {
  recordType: string;
  recordId: string;
}

export function PluginPanelSlot({ recordType, recordId }: Props) {
  const { registry } = usePluginRegistry();
  const { data: plugins = [] } = useInstalledPlugins();
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

  const installedPanelIds = new Set(
    plugins.flatMap((p) =>
      (p.manifest?.surfaces?.panels ?? [])
        .filter((panel) => panel.record_type === recordType)
        .map((panel) => panel.id),
    ),
  );

  const panels = [...registry.panels.values()].filter(
    (p) => p.recordType === recordType && installedPanelIds.has(p.id),
  );

  if (panels.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
      {panels.map((panel) => {
        const isOpen = openPanels.has(panel.id);

        return (
          <div
            key={panel.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--surface)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() =>
                setOpenPanels((prev) => {
                  const next = new Set(prev);
                  if (next.has(panel.id)) next.delete(panel.id);
                  else next.add(panel.id);
                  return next;
                })
              }
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text)',
              }}
            >
              <span>{panel.label}</span>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', height: 300 }}>
                <PluginIframeSlot
                  pluginId={panel.pluginId}
                  surfaceType="panel"
                  surfaceId={`${panel.recordType}:${panel.id}`}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
