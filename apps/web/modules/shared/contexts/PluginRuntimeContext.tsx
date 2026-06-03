'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

export type AnyComponent = React.ComponentType<any>;

export interface FrontendSurfaceRegistry {
  pages: Map<string, AnyComponent>;
  widgets: Map<string, AnyComponent>;
  panels: Map<string, { recordType: string; id: string; label: string; component: AnyComponent }>;
}

interface PluginRuntimeContextValue {
  registry: FrontendSurfaceRegistry;
  loading: boolean;
}

const defaultRegistry: FrontendSurfaceRegistry = {
  pages: new Map(),
  widgets: new Map(),
  panels: new Map(),
};

const PluginRuntimeCtx = createContext<PluginRuntimeContextValue>({
  registry: defaultRegistry,
  loading: false,
});

export function usePluginRegistry() {
  return useContext(PluginRuntimeCtx);
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

  useEffect(() => {
    if (isLoading) return;

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

            const makeVantage = () => ({
              registerPage: (path: string, component: AnyComponent) => {
                registry.pages.set(path, component);
              },
              registerWidget: (id: string, component: AnyComponent) => {
                registry.widgets.set(id, component);
              },
              registerPanel: (recordType: string, id: string, component: AnyComponent) => {
                registry.panels.set(`${recordType}:${id}`, { recordType, id, label: id, component });
              },
              toast: (message: string, type?: string) => {
                window.dispatchEvent(new CustomEvent('vantage:toast', { detail: { message, type } }));
              },
              navigate: (path: string) => {
                window.dispatchEvent(new CustomEvent('vantage:navigate', { detail: { path } }));
              },
              modal: {
                open: (opts: unknown) => window.dispatchEvent(new CustomEvent('vantage:modal:open', { detail: opts })),
                close: () => window.dispatchEvent(new CustomEvent('vantage:modal:close')),
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
              const mod = await (eval(`import("${url}")`) as Promise<{ default?: { setup: (v: unknown) => void | Promise<void> } }>);
              if (mod.default?.setup) {
                await Promise.resolve(mod.default.setup(makeVantage()));
              }
              loadedRef.current.add(plugin.plugin_id);
            } finally {
              URL.revokeObjectURL(url);
            }
          } catch (err) {
            console.warn(`[vantage] Failed to load plugin ${plugin.plugin_id}:`, err);
          }
        }),
      );

      if (active) setLoading(false);
    })();

    return () => { active = false; };
  }, [isLoading, plugins.map((p) => p.plugin_id).join(',')]);

  return (
    <PluginRuntimeCtx.Provider value={{ registry, loading }}>
      {children}
    </PluginRuntimeCtx.Provider>
  );
}
