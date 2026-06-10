# Plugin HTTP Endpoints + API Heap Fix

**Date:** 2026-06-10

## Changes

### 1. `http.onEndpoint` in plugin-loader

**File:** `apps/api/src/lib/plugin-loader.ts`

The host-side `vencore` object passed to `plugin.setup()` previously had `http.fetch` but no `http.onEndpoint`. Plugins calling `vencore.http.onEndpoint(...)` would throw `TypeError: vencore.http.onEndpoint is not a function`.

**Fix:** Added `_httpHandlers[]` array and `http.onEndpoint(path, handler)` to the vencore object. After `setup()` resolves, if any handlers were registered, an Express `Router` is built from them and stored in `routerCache`.

The router is then served at:
```
/api/plugins/route/:pluginId/<path>
```

Handler translation — `PluginHttpRequest` → Express `req`:

| Plugin field | Express source |
|---|---|
| `method` | `req.method` |
| `path` | `req.path` |
| `query` | `req.query` |
| `headers` | `req.headers` |
| `body` | `req.body` (JSON-stringified if object) |
| `params` | `req.params` |

Paths support Express-style patterns (`:param`, `*`).

**Example plugin usage:**
```typescript
vencore.http.onEndpoint('/accounts', async (req) => {
  return { status: 200, body: { data: [] } };
});

vencore.http.onEndpoint('/accounts/:id', async (req) => {
  return { status: 200, body: { data: { id: req.params.id } } };
});
```

---

### 2. API server heap limit

**File:** `apps/api/.npmrc`

```
node-options=--max-old-space-size=4096
```

Plugin bundles are self-contained CJS — all dependencies bundled in. Large plugins (e.g. mail plugin with nodemailer, imap, etc.) produce 30-40 MB bundles. Loading these caused OOM crashes on the default 1.5 GB Node.js heap.

The `.npmrc` `node-options` setting applies to `node` processes started by npm/pnpm scripts in that directory, raising the heap to 4 GB.

> If deploying to a container, also set `NODE_OPTIONS=--max-old-space-size=4096` in the environment.
