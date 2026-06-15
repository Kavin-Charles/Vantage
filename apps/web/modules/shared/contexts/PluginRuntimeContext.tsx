'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

export type AnyComponent = React.ComponentType<any>;

export interface FrontendSurfaceRegistry {
  pages: Map<string, { pluginId: string; path: string }>;
  widgets: Map<string, { pluginId: string; id: string }>;
  panels: Map<string, { pluginId: string; recordType: string; id: string; label: string }>;
}

interface PluginRuntimeContextValue {
  registry: FrontendSurfaceRegistry;
  loading: boolean;
  dashboardWidgets: Map<string, DashboardWidgetDef>;
  /** Sends a bridge call on behalf of an iframe plugin, relaying to the API. */
  relayBridgeCall(pluginId: string, method: string, payload: unknown): Promise<unknown>;
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
  relayBridgeCall: async () => ({ data: null, error: { code: 'NOT_READY', message: 'Runtime not initialized' } }),
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
  const [dashboardWidgets, setDashboardWidgets] = useState<Map<string, DashboardWidgetDef>>(new Map());

  // Map from pluginId → iframe element for token + bridge relay
  const iframeRefs = useRef(new Map<string, HTMLIFrameElement>());
  // Pending bridge calls relayed to iframe plugin → API → iframe
  const pendingBridgeCalls = useRef(new Map<number, { resolve: (r: unknown) => void }>());
  const bridgeCallCounter = useRef(0);

  const relayBridgeCall = useCallback(async (pluginId: string, method: string, payload: unknown): Promise<unknown> => {
    const token = await getToken();
    const res = await fetch(`${apiUrl}/api/plugins/bridge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ plugin_id: pluginId, method, payload }),
    });
    return res.json();
  }, [apiUrl, getToken]);

  // Handle postMessages from plugin iframes
  useEffect(() => {
    async function handleMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || typeof d !== 'object') return;

      // Token request from iframe — respond with auth token
      if (d.type === 'frame:token:request') {
        const frameId = d.frameId;
        const token = await getToken();
        (e.source as WindowProxy)?.postMessage({ type: 'frame:token', frameId, token }, '*');
        return;
      }

      // Bridge call from plugin iframe → relay to API → respond to iframe
      if (d.type === 'bridge:request') {
        const { id, method, payload } = d as { id: number; method: string; payload: unknown };
        // Prefer pluginId sent in the message (works for both hidden + visible iframes).
        // Fall back to source-window matching for older frames that don't send it.
        let pluginId: string | null = (d as any).pluginId ?? null;
        if (!pluginId) {
          for (const [pid, iframe] of iframeRefs.current) {
            if (iframe.contentWindow === e.source) { pluginId = pid; break; }
          }
        }
        if (!pluginId) return;

        try {
          const result = await relayBridgeCall(pluginId, method, payload);
          (e.source as WindowProxy)?.postMessage({ type: 'bridge:response', id, result }, '*');
        } catch (err) {
          (e.source as WindowProxy)?.postMessage({
            type: 'bridge:response',
            id,
            result: { data: null, error: { code: 'RELAY_ERROR', message: err instanceof Error ? err.message : String(err) } },
          }, '*');
        }
        return;
      }

      // Surface registration from iframe
      if (d.type === 'surface:register') {
        const { kind, pluginId } = d as { kind: string; pluginId: string };
        if (kind === 'page') {
          registry.pages.set(`${pluginId}:${d.path}`, { pluginId, path: d.path });
        } else if (kind === 'widget') {
          registry.widgets.set(`${pluginId}:${d.id}`, { pluginId, id: d.id });
        } else if (kind === 'panel') {
          registry.panels.set(`${pluginId}:${d.recordType}:${d.id}`, {
            pluginId, recordType: d.recordType, id: d.id, label: d.id,
          });
        }
        return;
      }

      // React globals request from iframe
      if (d.type === 'frame:react:request') {
        (e.source as WindowProxy)?.postMessage({
          type: 'frame:react:globals',
          // We don't inject React objects cross-origin — plugins must bundle React or use globalThis.React
          // injected by the frame page itself.
        }, '*');
        return;
      }

      // Host UI events forwarded from iframe
      if (d.type === 'host:toast') {
        window.dispatchEvent(new CustomEvent('vencore:toast', { detail: { message: d.message, type: d.toastType } }));
      }
      if (d.type === 'host:navigate') {
        window.dispatchEvent(new CustomEvent('vencore:navigate', { detail: { path: d.path } }));
      }
      if (d.type === 'host:modal:open') {
        window.dispatchEvent(new CustomEvent('vencore:modal:open', { detail: d.opts }));
      }
      if (d.type === 'host:modal:close') {
        window.dispatchEvent(new CustomEvent('vencore:modal:close'));
      }

      if (d.type === 'frame:ready') {
        // Plugin iframe finished setup
      }
      if (d.type === 'frame:error') {
        console.warn(`[vencore] Plugin frame error (${d.pluginId}):`, d.message);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [getToken, registry, relayBridgeCall]);

  // Mount hidden iframes for each enabled plugin that has a client bundle
  useEffect(() => {
    if (isLoading) return;

    const enabledWithClient = plugins.filter((p) => p.enabled && p.manifest?.build?.client);

    if (enabledWithClient.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let readyCount = 0;

    for (const plugin of enabledWithClient) {
      if (iframeRefs.current.has(plugin.plugin_id)) continue;

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      // allow-same-origin needed for postMessage to work reliably
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.src = `/plugins/frame/${encodeURIComponent(plugin.plugin_id)}`;
      document.body.appendChild(iframe);
      iframeRefs.current.set(plugin.plugin_id, iframe);

      // Track when each frame is ready
      const readyHandler = (e: MessageEvent) => {
        if (e.data?.type === 'frame:ready' && e.data?.pluginId === plugin.plugin_id) {
          window.removeEventListener('message', readyHandler);
          readyCount++;
          if (readyCount >= enabledWithClient.length) {
            setLoading(false);
          }
        }
        if (e.data?.type === 'frame:error' && e.data?.pluginId === plugin.plugin_id) {
          window.removeEventListener('message', readyHandler);
          readyCount++;
          if (readyCount >= enabledWithClient.length) {
            setLoading(false);
          }
        }
      };
      window.addEventListener('message', readyHandler);
    }

    // Fallback: mark loading done after 10s regardless
    const timeout = setTimeout(() => setLoading(false), 10_000);
    return () => clearTimeout(timeout);
  }, [isLoading, plugins.map((p) => p.plugin_id).join(',')]);

  // Cleanup iframes on unmount
  useEffect(() => {
    return () => {
      for (const [, iframe] of iframeRefs.current) {
        iframe.remove();
      }
      iframeRefs.current.clear();
    };
  }, []);

  // Dashboard widget registration (via postMessage or CustomEvent)
  useEffect(() => {
    function handleDashboardWidget(e: Event) {
      const { def, component } = (e as CustomEvent<{ def: Omit<DashboardWidgetDef, 'component'>; component: React.ComponentType }>).detail;
      setDashboardWidgets(prev => new Map(prev).set(def.id, { ...def, component }));
    }
    window.addEventListener('vencore:dashboard:register-widget', handleDashboardWidget);
    return () => window.removeEventListener('vencore:dashboard:register-widget', handleDashboardWidget);
  }, []);

  return (
    <PluginRuntimeCtx.Provider value={{ registry, loading, dashboardWidgets, relayBridgeCall }}>
      {children}
    </PluginRuntimeCtx.Provider>
  );
}

/**
 * PluginIframeSlot — renders a plugin's iframe surface in the active slot.
 * Use this where you previously rendered plugin components directly.
 */
export function PluginIframeSlot({
  pluginId,
  surfaceType,
  surfaceId,
  className,
  style,
}: {
  pluginId: string;
  surfaceType: 'page' | 'widget' | 'panel';
  surfaceId: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Activate the surface in the plugin iframe once mounted
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'surface:activate',
        surfaceType,
        surfaceId,
        path: surfaceId,
      }, '*');
    }, 500);
    return () => clearTimeout(timer);
  }, [surfaceType, surfaceId]);

  return (
    <iframe
      ref={iframeRef}
      src={`/plugins/frame/${encodeURIComponent(pluginId)}`}
      sandbox="allow-scripts allow-same-origin"
      className={className}
      style={{ border: 'none', width: '100%', height: '100%', ...style }}
      title={`Plugin: ${pluginId}`}
    />
  );
}
