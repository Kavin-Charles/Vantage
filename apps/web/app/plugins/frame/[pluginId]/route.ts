import { type NextRequest } from 'next/server';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

/**
 * Serves the plugin iframe shell page.
 * This runs outside Next.js layouts — returns raw HTML.
 *
 * The iframe:
 *   1. Sets up a postMessage bridge (parent ↔ frame).
 *   2. Exposes window.React / window.ReactDOM from inline bundles.
 *   3. Loads the plugin's client.js as an ES module.
 *   4. Calls default.setup(vencore) — vencore bridges to parent via postMessage.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> },
): Promise<Response> {
  const { pluginId } = await params;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Plugin Frame</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', system-ui, sans-serif; background: transparent; }
    #plugin-root { width: 100%; height: 100%; }
    #plugin-error { padding: 16px; color: #991b1b; font-size: 13px; display: none; }
  </style>
  <script>
    // ── postMessage bridge setup ──────────────────────────────────────────────
    const _pending = new Map();
    let _counter = 0;
    const _activeSurfaces = {};
    // Set by __buildVencore so bridge requests carry the pluginId for parent routing
    let _pluginId = null;

    async function _bridgeCall(method, payload) {
      const id = ++_counter;
      return new Promise((resolve, reject) => {
        _pending.set(id, { resolve, reject });
        window.parent.postMessage({ type: 'bridge:request', id, method, payload, pluginId: _pluginId }, '*');
        setTimeout(() => {
          if (_pending.has(id)) {
            _pending.delete(id);
            reject({ code: 'BRIDGE_TIMEOUT', message: 'Bridge call timed out: ' + method });
          }
        }, 30000);
      });
    }

    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;

      if (d.type === 'bridge:response') {
        const p = _pending.get(d.id);
        if (p) { _pending.delete(d.id); p.resolve(d.result); }
      }

      if (d.type === 'surface:activate') {
        const handler = _activeSurfaces[d.surfaceType + ':' + (d.surfaceId ?? d.path ?? '')];
        if (handler) handler(d);
      }
    });

    // ── Surface renderer — supports React components AND vanilla DOM functions ─
    function _renderSurface(component, ctx) {
      const root = document.getElementById('plugin-root') || document.body;
      if (typeof component !== 'function') return;
      try {
        const result = component(ctx);
        // If React is available and the component returned a React element, use createRoot
        if (result !== null && result !== undefined && typeof result === 'object' && result.$$typeof && window.React && window.ReactDOM) {
          window.ReactDOM.createRoot(root).render(result);
        }
        // Otherwise the component already handled DOM updates directly (vanilla DOM approach)
      } catch (err) {
        root.innerHTML = '<p style="padding:16px;color:#991b1b;font-size:13px">Surface render error: ' + (err && err.message ? err.message : String(err)) + '</p>';
      }
    }

    // ── vencore facade for frontend plugins ───────────────────────────────────
    window.__buildVencore = function(pluginId) {
      _pluginId = pluginId;
      return {
        registerPage(path, component) {
          _activeSurfaces['page:' + path] = (ctx) => _renderSurface(component, ctx);
          window.parent.postMessage({ type: 'surface:register', kind: 'page', path, pluginId }, '*');
        },
        registerWidget(id, component) {
          _activeSurfaces['widget:' + id] = (ctx) => _renderSurface(component, ctx);
          window.parent.postMessage({ type: 'surface:register', kind: 'widget', id, pluginId }, '*');
        },
        registerPanel(recordType, id, component) {
          _activeSurfaces['panel:' + recordType + ':' + id] = (ctx) => _renderSurface(component, ctx);
          window.parent.postMessage({ type: 'surface:register', kind: 'panel', recordType, id, pluginId }, '*');
        },
        toast(message, type) {
          window.parent.postMessage({ type: 'host:toast', message, toastType: type }, '*');
        },
        navigate(path) {
          window.parent.postMessage({ type: 'host:navigate', path }, '*');
        },
        modal: {
          open(opts) { window.parent.postMessage({ type: 'host:modal:open', opts }, '*'); },
          close() { window.parent.postMessage({ type: 'host:modal:close' }, '*'); },
        },
        search: { register(_h) {} },
        commands: { register(_l, _h) {} },
        settings: {
          get: (key) => _bridgeCall('settings.get', { key }).then(r => r?.data ?? null),
        },
        user: {
          get: () => _bridgeCall('user.get', {}).then(r => r?.data ?? null),
        },
        workspace: {
          get: () => _bridgeCall('workspace.get', {}).then(r => r?.data ?? null),
        },
        getContext: () => _bridgeCall('context.get', {}).then(r => r?.data ?? null),
        bus: {
          on(_event, _handler) {},
          emit: (event, payload) => _bridgeCall('bus.emit', { event, payload }),
        },
        list: (resource, filter) => _bridgeCall(resource + '.list', { filter }).then(r => r?.data ?? []),
        get: (resource, id) => _bridgeCall(resource + '.get', { id }).then(r => r?.data ?? null),
        table: (name) => ({
          list: (opts) => _bridgeCall('table.list', { name, ...(opts||{}) }).then(r => r?.data ?? []),
          get: (id) => _bridgeCall('table.get', { name, id }).then(r => r?.data ?? null),
          insert: (data) => _bridgeCall('table.insert', { name, data }).then(r => r?.data ?? null),
          update: (id, data) => _bridgeCall('table.update', { name, id, data }).then(r => r?.data ?? null),
          delete: (id) => _bridgeCall('table.delete', { name, id }).then(r => !r?.error),
        }),
      };
    };
  </script>
</head>
<body>
  <div id="plugin-root"></div>
  <div id="plugin-error"></div>
  <script type="module">
    // Token is retrieved from parent before loading client.js
    async function getToken() {
      return new Promise((resolve) => {
        const id = ++window._counter || (window._counter = 1);
        window.addEventListener('message', function handler(e) {
          if (e.data?.type === 'frame:token' && e.data?.frameId === id) {
            window.removeEventListener('message', handler);
            resolve(e.data.token);
          }
        });
        window.parent.postMessage({ type: 'frame:token:request', frameId: id }, '*');
        setTimeout(() => resolve(null), 5000);
      });
    }

    try {
      const token = await getToken();
      const pluginId = ${JSON.stringify(pluginId)};

      // Load React and ReactDOM from the parent origin so they share the same instance
      // Plugin client.js uses globalThis.React / globalThis.ReactDOM via esbuild plugin
      const reactRes = await fetch('/plugins/frame/react-globals.js');
      if (reactRes.ok) {
        const code = await reactRes.text();
        new Function(code)();
      }

      // Load plugin client.js with auth token
      const apiUrl = ${JSON.stringify(API_URL)};
      const clientUrl = apiUrl + '/api/plugins/' + encodeURIComponent(pluginId) + '/client.js';
      const res = await fetch(clientUrl, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load plugin client (' + res.status + ')');

      const code = await res.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      try {
        const importFn = new Function('url', 'return import(url)');
        const mod = await importFn(blobUrl);
        if (mod.default?.setup) {
          const vencore = window.__buildVencore(pluginId);
          await Promise.resolve(mod.default.setup(vencore));
          window.parent.postMessage({ type: 'frame:ready', pluginId }, '*');
        }
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      const el = document.getElementById('plugin-error');
      if (el) { el.style.display = 'block'; el.textContent = 'Plugin load error: ' + (err?.message ?? err); }
      window.parent.postMessage({ type: 'frame:error', pluginId: ${JSON.stringify(pluginId)}, message: err?.message ?? String(err) }, '*');
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Frame isolation CSP: allow scripts from same origin only, no parent frame access to DOM
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src *; style-src 'self' 'unsafe-inline';",
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
    },
  });
}
