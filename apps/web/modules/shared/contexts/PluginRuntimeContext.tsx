'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

if (typeof window !== 'undefined') {
  (window as any).React = require('react');
}

export type AnyComponent = React.ComponentType<any>;

export interface WidgetDef {
  id: string;
  pluginId: string;
  component: AnyComponent;
}

export interface PanelDef {
  recordType: string;
  id: string;
  label: string;
  pluginId: string;
  component: AnyComponent;
}

export interface FrontendSurfaceRegistry {
  pages: Map<string, AnyComponent>;
  widgets: Map<string, WidgetDef>;
  panels: Map<string, PanelDef>;
}

interface PluginRuntimeContextValue {
  registry: FrontendSurfaceRegistry;
  loading: boolean;
  dashboardWidgets: Map<string, DashboardWidgetDef>;
}

const defaultRegistry: FrontendSurfaceRegistry = {
  pages: new Map(),
  widgets: new Map(),
  panels: new Map(),
};

const PluginRuntimeCtx = createContext<PluginRuntimeContextValue>({
  registry: defaultRegistry,
  loading: false,
  dashboardWidgets: new Map(),
});

export function usePluginRegistry() {
  return useContext(PluginRuntimeCtx);
}

export function useDashboardWidgets(): Map<string, DashboardWidgetDef> {
  return useContext(PluginRuntimeCtx).dashboardWidgets;
}

export function PluginRuntimeProvider({ children }: { children: React.ReactNode }) {
  const { data: plugins = [], isLoading } = useInstalledPlugins();
  const getToken = useApiToken();
  const apiUrl = (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ?? '';
  const [registry] = useState<FrontendSurfaceRegistry>({
    pages: new Map(),
    widgets: new Map(),
    panels: new Map(),
  });
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(new Set<string>());
  const [dashboardWidgets, setDashboardWidgets] = useState<Map<string, DashboardWidgetDef>>(new Map());

  useEffect(() => {
    if (isLoading) return;

    // Expose React globally for plugins
    if (typeof window !== 'undefined') {
      (window as any).React = require('react');
      (window as any).ReactDOM = require('react-dom');
    }

    const enabledWithClient = plugins.filter(
      (p) => p.enabled && p.manifest?.build?.client,
    );

    if (enabledWithClient.length === 0) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      await Promise.allSettled(
        enabledWithClient.map(async (plugin) => {
          if (loadedRef.current.has(plugin.plugin_id)) return;

          try {
            const token = await getToken();
            const res = await fetch(`${apiUrl}/api/plugins/${plugin.id}/client.js`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              credentials: 'include',
            });
            if (!res.ok) return;

            const code = await res.text();

            const makeVencore = () => ({
              registerPage: (path: string, component: AnyComponent) => {
                registry.pages.set(path, component);
              },
              registerWidget: (id: string, component: AnyComponent) => {
                registry.widgets.set(id, { id, pluginId: plugin.plugin_id, component });
              },
              registerPanel: (recordType: string, id: string, component: AnyComponent) => {
                registry.panels.set(`${recordType}:${id}`, { recordType, id, label: id, pluginId: plugin.plugin_id, component });
              },
              toast: (message: string, type?: string) => {
                window.dispatchEvent(new CustomEvent('vencore:toast', { detail: { message, type } }));
              },
              navigate: (path: string) => {
                window.dispatchEvent(new CustomEvent('vencore:navigate', { detail: { path } }));
              },
              modal: {
                open: (opts: unknown) => window.dispatchEvent(new CustomEvent('vencore:modal:open', { detail: opts })),
                close: () => window.dispatchEvent(new CustomEvent('vencore:modal:close')),
              },
              settings: {
                get: async (key: string) => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'settings.get', payload: { key } }),
                  });
                  const json = await r.json() as { data?: unknown };
                  return json.data ?? null;
                },
              },
              user: {
                get: async () => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'user.get', payload: {} }),
                  });
                  const json = await r.json() as { data?: unknown };
                  return json.data;
                },
              },
              workspace: {
                get: async () => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'workspace.get', payload: {} }),
                  });
                  const json = await r.json() as { data?: unknown };
                  return json.data;
                },
              },
              bus: {
                on: (_event: string, _handler: (p: unknown) => void) => () => {},
              },
              // Call this plugin's own backend HTTP endpoints (registered via
              // http.onEndpoint) with the user's session. Returns the parsed body.
              invoke: async (path: string, payload?: unknown) => {
                const t = await getToken();
                const normalized = path.startsWith('/') ? path : `/${path}`;
                const r = await fetch(`${apiUrl}/api/plugins/route/${plugin.plugin_id}${normalized}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                  credentials: 'include',
                  body: JSON.stringify(payload ?? {}),
                });
                const text = await r.text();
                try {
                  return text ? JSON.parse(text) : null;
                } catch {
                  return text;
                }
              },
              list: async (resource: string, filter?: unknown) => {
                const t = await getToken();
                const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                  credentials: 'include',
                  body: JSON.stringify({ plugin_id: plugin.plugin_id, method: `${resource}.list`, payload: { filter } }),
                });
                const json = await r.json() as { data?: unknown[] };
                return json.data ?? [];
              },
              get: async (resource: string, id: string) => {
                const t = await getToken();
                const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                  credentials: 'include',
                  body: JSON.stringify({ plugin_id: plugin.plugin_id, method: `${resource}.get`, payload: { id } }),
                });
                const json = await r.json() as { data?: unknown };
                return json.data;
              },
              table: (name: string) => ({
                list: async (opts?: unknown) => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'table.list', payload: { name, ...(opts as Record<string, unknown> ?? {}) } }),
                  });
                  const json = await r.json() as { data?: unknown[] };
                  return json.data ?? [];
                },
                get: async (id: string) => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'table.get', payload: { name, id } }),
                  });
                  const json = await r.json() as { data?: unknown };
                  return json.data ?? null;
                },
                insert: async (data: Record<string, unknown>) => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'table.insert', payload: { name, data } }),
                  });
                  const json = await r.json() as { data?: unknown };
                  return json.data ?? null;
                },
                update: async (id: string, data: Record<string, unknown>) => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'table.update', payload: { name, id, data } }),
                  });
                  const json = await r.json() as { data?: unknown };
                  return json.data ?? null;
                },
                delete: async (id: string) => {
                  const t = await getToken();
                  const r = await fetch(`${apiUrl}/api/plugins/bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ plugin_id: plugin.plugin_id, method: 'table.delete', payload: { name, id } }),
                  });
                  const json = await r.json() as { data?: unknown; error?: unknown };
                  return !json.error;
                },
              }),
              getContext: async () => {
                return { workspace_id: '', user_id: '', page: 'full-page', record_id: null, record_type: null };
              },
              search: { register: (_handler: unknown) => {} },
              commands: { register: (_label: string, _handler: () => void) => {} },
            });

            const blob = new Blob([code], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);

            try {
              const importFn = new Function('url', 'return import(url)');
              const mod = await (importFn(url) as Promise<{ default?: { setup: (v: unknown) => void | Promise<void> } }>);
              if (mod.default?.setup) {
                await Promise.resolve(mod.default.setup(makeVencore()));
              }
              loadedRef.current.add(plugin.plugin_id);
            } finally {
              URL.revokeObjectURL(url);
            }
          } catch (err) {
            console.warn(`[vencore] Failed to load plugin ${plugin.plugin_id}:`, err);
          }
        }),
      );

      if (active) setLoading(false);
    })();

    return () => { active = false; };
  }, [isLoading, plugins.map((p) => p.plugin_id).join(',')]);

  useEffect(() => {
    function handleDashboardWidget(e: Event) {
      const { def, component } = (e as CustomEvent<{ def: Omit<DashboardWidgetDef, 'component'>; component: React.ComponentType }>).detail;
      setDashboardWidgets(prev => new Map(prev).set(def.id, { ...def, component }));
    }
    window.addEventListener('vencore:dashboard:register-widget', handleDashboardWidget);
    return () => {
      window.removeEventListener('vencore:dashboard:register-widget', handleDashboardWidget);
    };
  }, []);

  return (
    <PluginRuntimeCtx.Provider value={{ registry, loading, dashboardWidgets }}>
      {children}
    </PluginRuntimeCtx.Provider>
  );
}

interface PluginIframeSlotProps {
  pluginId: string;
  surfaceType: 'page' | 'widget' | 'panel';
  surfaceId: string;
  style?: React.CSSProperties;
}

export function PluginIframeSlot({ pluginId, surfaceType, surfaceId, style }: PluginIframeSlotProps) {
  const { registry } = usePluginRegistry();

  let Component: AnyComponent | undefined;

  if (surfaceType === 'page') {
    Component = registry.pages.get(`${pluginId}:${surfaceId}`) ?? registry.pages.get(`${pluginId}:/`);
  } else if (surfaceType === 'widget') {
    Component = registry.widgets.get(surfaceId)?.component;
  } else if (surfaceType === 'panel') {
    Component = registry.panels.get(surfaceId)?.component;
  }

  if (!Component) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>Not registered</span>
      </div>
    );
  }

  return <div style={style}><Component /></div>;
}
