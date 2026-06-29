# AI Assistant Plugin — Implementation Plan

> Status: design locked, pre-implementation.
> Date: 2026-06-29.
> Decisions: orchestration **in the plugin**; v1 = **helper bot only** (no CRM data); BYOK per-workspace; single OpenAI-compatible provider adapter.

A BYOK ("bring your own key") AI chat plugin for Vencore. The platform provides **no** inference — every workspace plugs in its own AI provider credits. Two pillars: (1) the user integrates their own key, (2) a machine-readable **UI-JSON** map lets the assistant answer "how do I do X" with deep links.

---

## 1. How it works (data flow)

```
┌── iframe: chat panel  (read-only CRM via facade; renders messages + confirm cards)
│      │  POST /api/plugins/route/ai-assistant/chat   { conversation_id, message }
│      ▼
├── backend sandbox (server.cjs)  ── ALL orchestration lives here
│      1. load conversation history          (plugin table: ai_messages)
│      2. retrieve UI-JSON chunks             (relevant to the question)
│      3. [phase 2+] read CRM context         (vencore.list/get — bridge-scoped)
│      4. [phase 2+] TOKENIZE PII  ───────────┐
│      5. http.fetch(provider, secret_headers) → host injects BYOK key server-side
│      6. provider returns text | tool_calls
│      7. tool_call?  read → run now;  write → return PROPOSAL (await confirm)
│      8. [phase 2+] DE-TOKENIZE  ◄───────────┘
│      9. persist messages + audit + usage; return answer
▼
host bridge: enforces data_access + workspace_id; decrypts/encrypts BYOK key
```

Why backend-centric: the frontend facade is **read-only** for CRM (`list`/`get` + plugin-table CRUD only). All writes/actions and the provider key handling must live in the isolated sandbox. This is also the secure choice.

---

## 2. Platform facts this design relies on (verified)

- **Bridge = native tool gateway.** Every CRM op is a registered bridge method gated by `data_access` + `workspace_id` (`packages/plugin-runtime/src/bridge-router.ts`). Plugins cannot run arbitrary SQL or cross tenants. Our safety model is the platform's default.
- **Backend sandbox** = child process per `(pluginId, workspaceId)`, **zero env vars**, IPC-only (`apps/api/src/lib/plugin-sandbox/runner.ts`, `manager.ts`). Has `create/update/delete` + `http.fetch`.
- **Frontend→backend channel** exists: `POST /api/plugins/route/:pluginId/*` → sandbox router → `http.onEndpoint` handler (`apps/api/src/index.ts:298`). 30s timeout.
- **Secret settings** are AES-encrypted host-side with `PLUGIN_SETTINGS_KEY` on write (`apps/api/src/routes/plugins.ts` PUT settings; `plugin-settings-crypto.ts`).
- **No streaming.** Bridge + endpoints are request/response, 30s cap. v1 is non-streaming.

### The one gap → mandatory host change
`settings.get` (`apps/api/src/index.ts:153`) returns the **raw stored value**. For secrets that's the **encrypted blob**, never decrypted, to any caller. So the sandbox cannot read the plaintext BYOK key. Fix in Phase 0 (below). This is the only host edit required for v1.

---

## 3. Phase 0 — host change (prerequisite)

**Extend `http.fetch` with server-side secret-header injection.** File: `apps/api/src/index.ts` (`http.fetch` handler ~line 130).

New optional payload field `secret_headers: Record<headerName, settingKey>`:

1. For each entry, look up `plugin_settings` for `(workspaceId, pluginSlug, settingKey)`.
2. If `encrypted`, `decryptSettingValue(value)` (already imported in `plugins.ts` — reuse the helper).
3. Inject as real request header before `fetch`. Never echo it back; strip from any response mirror.
4. If the setting is missing → `{ code: 'NO_KEY' }` error so the plugin can prompt the user to configure.

Effect: the BYOK key never enters sandbox memory or the browser. AI orchestration stays in the plugin; the key stays host-side. ~30 lines, fully backward-compatible (field is optional).

Verify: `/api/plugins/route/:pluginId/*` is reachable from the iframe with the workspace auth token (it is — same `requireAuth`).

---

## 4. plugin.json (manifest)

```jsonc
{
  "id": "ai-assistant",
  "name": "AI Assistant",
  "version": "0.1.0",
  "sdk_version": "0.0.4",
  "data_access": [
    "contacts:read","contacts:write","companies:read","companies:write",
    "deals:read","deals:write","tasks:read","tasks:write",
    "activity:read","activity:write","servers:read","websites:read",
    "storage:read","storage:write","http:fetch"
  ],
  "permissions": [
    { "key": "ai:use",       "label": "Use AI assistant",       "defaultRoles": ["admin","member"] },
    { "key": "ai:configure", "label": "Configure AI provider",  "defaultRoles": ["admin"] },
    { "key": "ai:act",       "label": "Let AI take actions",    "defaultRoles": ["admin","member"] }
  ],
  "settings_schema": [
    { "key": "provider",      "type": "select",  "label": "Provider", "options": ["openai","openrouter","azure","custom"], "default": "openai" },
    { "key": "base_url",      "type": "text",    "label": "Base URL (OpenAI-compatible)", "default": "https://api.openai.com/v1" },
    { "key": "model",         "type": "text",    "label": "Model", "default": "gpt-4o-mini" },
    { "key": "api_key",       "type": "text",    "label": "API Key", "secret": true },
    { "key": "ai_read_crm",   "type": "boolean", "label": "Allow AI to read CRM data", "default": false },
    { "key": "allow_actions", "type": "boolean", "label": "Allow AI to take actions",  "default": false },
    { "key": "retention_days","type": "number",  "label": "Conversation retention (days)", "default": 90, "min": 1, "max": 365 }
  ],
  "tables": [
    { "name": "ai_conversations", "columns": [
      { "name": "id","type":"uuid","primary":true },
      { "name":"user_id","type":"uuid" },
      { "name":"title","type":"text","nullable":true },
      { "name":"created_at","type":"timestamptz" },
      { "name":"updated_at","type":"timestamptz" },
      { "name":"deleted_at","type":"timestamptz","nullable":true }
    ], "drop_on_uninstall": true },
    { "name": "ai_messages", "columns": [
      { "name":"id","type":"uuid","primary":true },
      { "name":"conversation_id","type":"uuid" },
      { "name":"role","type":"text" },
      { "name":"content","type":"text","nullable":true },
      { "name":"tool_calls","type":"jsonb","nullable":true },
      { "name":"created_at","type":"timestamptz" }
    ], "indexes": [{ "columns": ["conversation_id"] }], "drop_on_uninstall": true },
    { "name": "ai_audit", "columns": [
      { "name":"id","type":"uuid","primary":true },
      { "name":"user_id","type":"uuid" },
      { "name":"conversation_id","type":"uuid","nullable":true },
      { "name":"tool","type":"text" },
      { "name":"fields_sent","type":"jsonb","nullable":true },
      { "name":"action","type":"text","nullable":true },
      { "name":"created_at","type":"timestamptz" }
    ], "drop_on_uninstall": true },
    { "name": "ai_usage", "columns": [
      { "name":"id","type":"uuid","primary":true },
      { "name":"user_id","type":"uuid" },
      { "name":"model","type":"text" },
      { "name":"tokens_in","type":"integer","nullable":true },
      { "name":"tokens_out","type":"integer","nullable":true },
      { "name":"est_cost","type":"decimal","nullable":true },
      { "name":"created_at","type":"timestamptz" }
    ], "drop_on_uninstall": true }
  ],
  "surfaces": {
    "nav": [{ "label": "AI", "path": "/ai", "icon": "Sparkles", "group": "general" }],
    "pages": [{ "path": "/ai", "title": "AI Assistant" }],
    "panels": [
      { "record_type": "contact", "id": "ai-contact", "label": "Ask AI" },
      { "record_type": "deal",    "id": "ai-deal",    "label": "Ask AI" }
    ]
  },
  "build": { "server": "src/server.ts", "client": "src/client.tsx" }
}
```

> Note: tables auto-scope to `workspace_id` via the runtime table-client. The `user_id` columns enforce per-user conversation isolation in queries.

---

## 5. UI-JSON (the "how do I X" knowledge)

**Generated, never hand-written.** Build-time pipeline:
1. Parse routes from `apps/web/app/**` + nav/surfaces from installed manifests.
2. Enrich from `graphify-out/graph.json` (page → component → action relationships) and `vencore-full.html`.
3. Emit chunked nodes:
   ```jsonc
   { "feature":"create deal", "route":"/deals/new", "module":"crm",
     "path":["Sidebar → Deals → New Deal (top-right)"],
     "fields":["name","value","stage","contact"],
     "requires_role":"member" }
   ```
4. Bundle into the server bundle (or seed into plugin `storage` on first run).

**Retrieval:** v1 keyword/section match over chunks → inject top-k into the system prompt. Move to embeddings when token cost hurts.

**Deep links:** every chunk carries `route` → assistant returns a clickable "Open →" that calls `vencore.navigate(route)`.

**White-label filter:** filter chunks by the workspace's **enabled modules** + the **user role** before retrieval. Never surface infra features to a workspace without infra, or admin-only actions to a member.

---

## 6. Backend endpoints (`http.onEndpoint`)

- `POST /chat` — `{ conversation_id?, message }` → runs orchestration, returns `{ reply, deep_links[], proposal? }`.
- `POST /confirm` — `{ conversation_id, proposal_id }` → executes a previously proposed write action; returns result. *(Phase 3)*
- `GET  /conversations`, `GET /conversations/:id` — history (also reachable as plugin-table reads from the frontend).
- `POST /validate-key` — cheap provider ping to confirm the BYOK key works (used by settings UI).

Orchestration loop (in `/chat`): build messages → retrieve UI-JSON → [phase2 CRM read + tokenize] → `http.fetch(base_url + '/chat/completions', { secret_headers: { Authorization: 'api_key' }, body })` → parse tool calls → run reads / queue writes as proposals → [phase2 de-tokenize] → persist + audit + usage → respond.

---

## 7. Data-safety model (Phase 2, designed now)

Stack every layer:

1. **Tool gateway** — AI never holds the DB; it calls bridge tools. *(native)*
2. **Workspace + role scope** — tools inherit `workspace_id`; AI gets exactly the caller's permissions, never more. *(native)*
3. **Field allowlist** — each CRM-read tool returns an explicit column set; new columns are not auto-exposed.
4. **Row caps** — never more than ~50 rows to the provider; otherwise "refine your question."
5. **Aggregate-first** — prefer count/sum/avg tools over row dumps ("total pipeline value" = one number).
6. **Tokenization** (sandbox, in-session, Redis-style TTL via `storage`): names/emails/phones/company → `PERSON_7`, `EMAIL_3`, `COMPANY_2`; **numbers/enums/stages/dates stay real** (needed for reasoning, safe). De-tokenize on the way out. Map never sent to provider.
7. **Free-text firewall** — Tier A default: never send activity/deal note bodies; send only metadata (type/date/length). Tier B (scrub-and-send) = opt-in, later.
8. **Audit** — `ai_audit` records every tool call + the fields that left + which action ran. "What did the AI see" = sellable compliance feature.
9. **Kill switch** — `ai_read_crm=false` by default; copilot features dark until an admin opts in.

---

## 8. Actions (Phase 3)

- **Same door as humans** — AI writes go through the same bridge methods + scope + role.
- **Propose → confirm** — `/chat` returns a proposal card; frontend shows `[Confirm] [Cancel]`; `/confirm` executes. AI never writes silently.
- **Risk tiers:** low (log note/task) auto after confirm; medium (stage change/edit) confirm + diff; high (delete/bulk/owner change) admin-only or extra confirm; **blocked:** hard delete, settings, the AI key itself.
- **Bulk guard** — explicit "yes, all N" + admin.
- **Undo** — soft-delete already exists; surface "undo" after writes.
- **Accountability** — every action → `activity.create` flagged `meta.via = "ai"` + the prompt that caused it.

---

## 9. Phasing

| Phase | Ships | Gate |
|---|---|---|
| **0** | host `http.fetch` secret-header injection | prerequisite |
| **1** | BYOK settings + key validation + UI-JSON helper bot + deep links + chat page. **No CRM data.** | first release |
| **2** | tokenization + CRM-read tools + `ai_read_crm` gate + audit + usage + cost widget | data copilot |
| **3** | propose→confirm actions + risk tiers + `via:ai` logging | actions |
| **4** | record panels, SSE streaming, per-user keys, multi-provider, Tier B scrub | polish |

v1 = Phase 0 + Phase 1.

---

## 10. Known limits / future host asks

- **Floating dock** — surfaces are nav/page/widget/panel only; a true global floating launcher needs a new surface type ("dock"/"global"). v1 uses the `/ai` nav page + contact/deal panels. Propose `dock` surface to the SDK later.
- **Streaming** — needs SSE wiring (Vencore has `/api/sse`); v1 non-streaming, watch the 30s endpoint timeout on long tool loops (mitigate: cap loop iterations, keep completions small).
- **Per-user keys** — current settings are per-workspace; per-user keys need a settings-scope extension. v2.

---

## 11. First implementation steps

1. Phase 0 host patch + a unit test for `secret_headers` injection (key never echoed).
2. Scaffold the plugin: `vencore create ai-assistant` (CLI), drop in the manifest above.
3. UI-JSON generator script (routes + graphify) → bundled asset.
4. Backend `/chat` + `/validate-key` (helper-bot only).
5. Frontend chat page (`client.tsx`): message list, input, deep-link buttons, settings link.
6. Settings UI for BYOK (provider/base_url/model/api_key/toggles).
7. Build → zip → upload via `POST /api/plugins/upload`; smoke-test end to end.
