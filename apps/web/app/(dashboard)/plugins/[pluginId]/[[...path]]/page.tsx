'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { usePluginRegistry } from '@/modules/shared/contexts/PluginRuntimeContext';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';

export default function PluginPage() {
  const params = useParams<{ pluginId: string; path?: string[] }>();
  const pluginId = params.pluginId;
  const subPath = '/' + (params.path?.join('/') ?? '');

  const { registry, loading } = usePluginRegistry();
  const { data: plugins = [] } = useInstalledPlugins();

  const plugin = plugins.find((p) => p.plugin_id === pluginId);

  if (!plugin) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Plugin not found.</p>
      </div>
    );
  }

  if (!plugin.enabled) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>This plugin is disabled.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading plugin…</p>
      </div>
    );
  }

  const Component = registry.pages.get(subPath) ?? registry.pages.get('/');

  if (!Component) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>
          No UI registered for this plugin. Make sure the plugin has a{' '}
          <code style={{ background: 'var(--surface2)', padding: '1px 4px', borderRadius: 4 }}>
            client
          </code>{' '}
          bundle.
        </p>
      </div>
    );
  }

  return (
    <React.Suspense
      fallback={<div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>}
    >
      <div className="plugin-surface-root" style={{ width: '100%', height: '100%' }}>
        <Component />
      </div>
    </React.Suspense>
  );
}
