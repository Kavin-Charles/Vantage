/**
 * Serves React and ReactDOM as window globals for plugin iframes.
 * Plugins compiled with `reactWindowPlugin()` expect `globalThis.React` / `globalThis.ReactDOM`.
 */
export async function GET(): Promise<Response> {
  // Import React server-side to get the version, serve a shim that loads the same version
  const script = `
(function() {
  // React and ReactDOM are injected by the host page into this frame
  // via the parent's window.postMessage before this script runs.
  // If not yet available, poll briefly.
  if (typeof globalThis.React === 'undefined') {
    // Request React from parent
    window.parent.postMessage({ type: 'frame:react:request' }, '*');
  }
})();
`;

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
