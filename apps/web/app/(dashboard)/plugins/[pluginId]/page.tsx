'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { Topbar } from '@/components/Topbar';

interface WorkspacePlugin {
  id: string;
  plugin_id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed_at: string;
  manifest: {
    description?: string;
    permissions?: string[];
    nav?: { label: string; href: string; icon?: string };
  };
}

export default function PluginPage({ params }: { params: Promise<{ pluginId: string }> }) {
  const { pluginId } = use(params);
  const getToken = useApiToken();
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const { data: plugin, isLoading } = useQuery({
    queryKey: ['plugin-info', pluginId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/plugins`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json() as { data: WorkspacePlugin[] };
      return json.data.find(p => p.plugin_id === pluginId) ?? null;
    },
  });

  // Listen for PLUGIN_READY from iframe, then send token
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'PLUGIN_READY') setIframeReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!iframeReady || !iframeRef.current) return;
    void getToken().then(token => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'AUTH_TOKEN', token },
        apiUrl,
      );
    });
  }, [iframeReady, apiUrl, getToken]);

  const uiSrc = `${apiUrl}/api/plugins/route/${pluginId}/ui`;

  if (isLoading) {
    return (
      <>
        <Topbar />
        <div style={{ padding: 28 }}>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</p>
        </div>
      </>
    );
  }

  if (!plugin) {
    return (
      <>
        <Topbar />
        <div style={{ padding: 28, maxWidth: 480 }}>
          <div style={{ padding: '32px 24px', borderRadius: 12, textAlign: 'center', border: '1px dashed var(--border)', background: 'var(--surface)' }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)' }}>Plugin not installed.</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text3)' }}>
              Install from{' '}
              <a href="/settings/plugins" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                Settings → Plugins
              </a>.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!plugin.enabled) {
    return (
      <>
        <Topbar />
        <div style={{ padding: 28, maxWidth: 480 }}>
          <div style={{ padding: '32px 24px', borderRadius: 12, textAlign: 'center', border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)' }}>{plugin.name} is disabled.</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text3)' }}>
              Enable it from{' '}
              <a href="/settings/plugins" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                Settings → Plugins
              </a>.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <iframe
        ref={iframeRef}
        src={uiSrc}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title={plugin.name}
      />
    </div>
  );
}
