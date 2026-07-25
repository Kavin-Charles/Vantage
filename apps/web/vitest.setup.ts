export {};

declare global {
  // eslint-disable-next-line no-var
  var jsdom: { window: Window } | undefined;
}

// Vitest 2.x's jsdom environment (see populateGlobal() in
// vitest/dist/chunks/index.*.js) only proxies a curated list of DOM globals
// onto globalThis; `localStorage`/`sessionStorage` aren't in that list. When
// `k in global` is already true for a key that isn't in the curated list,
// the key is filtered out entirely and left untouched — so on Node 22+,
// which ships an experimental built-in `localStorage` global gated behind
// `--localstorage-file`, that broken built-in shadows jsdom's real
// implementation instead of being replaced by it. Anything that reads
// `localStorage` at module-eval time (e.g. store/auth-slice.ts) then throws.
//
// `globalThis.jsdom` is vitest's own reference to the live JSDOM instance —
// wire globalThis's storage properties to the real, working one.
if (typeof globalThis.jsdom !== 'undefined') {
  const realWindow = globalThis.jsdom.window;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => realWindow.localStorage,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get: () => realWindow.sessionStorage,
  });
}
