'use client';

import React from 'react';
import { usePluginRegistry } from '@/modules/shared/contexts/PluginRuntimeContext';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';

export function PluginWidgetGrid() {
  const { registry, loading } = usePluginRegistry();
  const { data: plugins = [] } = useInstalledPlugins();

  const installedWidgetIds = new Set(
    plugins.flatMap((p) => (p.manifest?.surfaces?.widgets ?? []).map((w) => w.id)),
  );

  const widgets = [...registry.widgets.entries()].filter(([id]) => installedWidgetIds.has(id));

  if (loading || widgets.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text2)',
          margin: '0 0 12px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Plugins
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {widgets.map(([id, Component]) => (
          <div
            key={id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              minHeight: 120,
            }}
          >
            <React.Suspense
              fallback={<div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>}
            >
              <Component />
            </React.Suspense>
          </div>
        ))}
      </div>
    </div>
  );
}
