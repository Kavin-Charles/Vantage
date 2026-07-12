var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// global-externals-stub:react
var require_react = __commonJS({
  "global-externals-stub:react"(exports, module) {
    module.exports = window.React;
  }
});

// ../../../AppData/Local/Temp/vencore-plugin-MQrV4w/src/client.tsx
var import_react = __toESM(require_react());
var SETTINGS_PATH = "/settings/plugins/zoho-crm";
var MODULES = ["Contacts", "Accounts", "Deals"];
function ZohoPage({ vencore }) {
  const [status, setStatus] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [view, setView] = (0, import_react.useState)("overview");
  const [grantCode, setGrantCode] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const invoke = (0, import_react.useCallback)(async (path, payload) => {
    if (!vencore.invoke) throw new Error("Host does not support plugin invoke");
    return vencore.invoke(path, payload);
  }, [vencore]);
  const loadStatus = (0, import_react.useCallback)(async () => {
    try {
      const s = await invoke("/status");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, [invoke]);
  (0, import_react.useEffect)(() => {
    void loadStatus();
  }, [loadStatus]);
  async function connect() {
    if (!grantCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await invoke("/oauth/exchange", { code: grantCode.trim() });
      if (res.error) {
        setError(res.error);
        return;
      }
      setGrantCode("");
      vencore.toast("Connected to Zoho CRM \u2014 first sync started", "success");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }
  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await invoke("/sync");
      const total = Object.values(res.results).reduce((n, r) => n + r.synced, 0);
      const failed = Object.values(res.results).filter((r) => r.error);
      if (failed.length > 0) {
        setError(failed.map((f) => f.error).join(" \xB7 "));
        vencore.toast("Sync finished with errors", "warning");
      } else {
        vencore.toast(`Synced ${total.toLocaleString()} records from Zoho`, "success");
      }
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!window.confirm("Disconnect Zoho CRM? Synced records stay in the hub until the plugin is disabled.")) return;
    setBusy(true);
    try {
      await invoke("/disconnect");
      vencore.toast("Disconnected from Zoho CRM", "info");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }
  if (loading) return /* @__PURE__ */ import_react.default.createElement("div", { style: S.muted }, "Loading\u2026");
  return /* @__PURE__ */ import_react.default.createElement("div", { style: S.page }, /* @__PURE__ */ import_react.default.createElement("div", { style: S.header }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("h1", { style: S.title }, "Zoho CRM"), /* @__PURE__ */ import_react.default.createElement("p", { style: S.subtitle }, status?.connected ? `Connected \xB7 ${status.data_center} data center \xB7 syncs every ${status.sync_interval_min} min` : "Not connected")), status?.connected && /* @__PURE__ */ import_react.default.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ import_react.default.createElement("button", { style: S.btnPrimary, disabled: busy || status.syncing, onClick: () => void syncNow() }, busy || status.syncing ? "Syncing\u2026" : "Sync now"), /* @__PURE__ */ import_react.default.createElement("button", { style: S.btnGhost, disabled: busy, onClick: () => void disconnect() }, "Disconnect"))), status?.connected && /* @__PURE__ */ import_react.default.createElement("div", { style: S.tabs }, ["overview", "records"].map((v) => /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      key: v,
      onClick: () => setView(v),
      style: { ...S.tab, ...view === v ? S.tabActive : {} }
    },
    v === "overview" ? "Overview" : "Records"
  ))), error && /* @__PURE__ */ import_react.default.createElement("div", { style: S.errorBox }, error), !status?.connected ? /* @__PURE__ */ import_react.default.createElement(
    ConnectCard,
    {
      grantCode,
      setGrantCode,
      busy,
      onConnect: () => void connect(),
      onOpenSettings: () => vencore.navigate(SETTINGS_PATH),
      dataCenter: status?.data_center ?? "US"
    }
  ) : view === "overview" ? /* @__PURE__ */ import_react.default.createElement(Overview, { status }) : /* @__PURE__ */ import_react.default.createElement(RecordsBrowser, { invoke }));
}
function ConnectCard({ grantCode, setGrantCode, busy, onConnect, onOpenSettings, dataCenter }) {
  return /* @__PURE__ */ import_react.default.createElement("div", { style: S.card }, /* @__PURE__ */ import_react.default.createElement("p", { style: S.cardTitle }, "Connect your Zoho CRM account"), /* @__PURE__ */ import_react.default.createElement("ol", { style: S.steps }, /* @__PURE__ */ import_react.default.createElement("li", null, "Open ", /* @__PURE__ */ import_react.default.createElement("b", null, "api-console.zoho.com"), " (matching your data center \u2014 currently ", /* @__PURE__ */ import_react.default.createElement("b", null, dataCenter), ") and create a ", /* @__PURE__ */ import_react.default.createElement("b", null, "Self Client"), "."), /* @__PURE__ */ import_react.default.createElement("li", null, "Copy the Client ID and Client Secret into ", /* @__PURE__ */ import_react.default.createElement("button", { style: S.linkBtn, onClick: onOpenSettings }, "plugin settings"), " and save."), /* @__PURE__ */ import_react.default.createElement("li", null, "In the Self Client's ", /* @__PURE__ */ import_react.default.createElement("b", null, "Generate Code"), " tab, request scope", " ", /* @__PURE__ */ import_react.default.createElement("code", { style: S.code }, "ZohoCRM.modules.READ,ZohoCRM.settings.READ"), " with a 10-minute expiry, and paste the generated code below.")), /* @__PURE__ */ import_react.default.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14 } }, /* @__PURE__ */ import_react.default.createElement(
    "input",
    {
      style: S.input,
      placeholder: "Paste grant code (1000.xxxx\u2026)",
      value: grantCode,
      onChange: (e) => setGrantCode(e.target.value)
    }
  ), /* @__PURE__ */ import_react.default.createElement("button", { style: S.btnPrimary, disabled: busy || !grantCode.trim(), onClick: onConnect }, busy ? "Connecting\u2026" : "Connect")));
}
function Overview({ status }) {
  return /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("div", { style: S.statGrid }, MODULES.map((m) => {
    const s = status.modules[m];
    return /* @__PURE__ */ import_react.default.createElement("div", { key: m, style: S.card }, /* @__PURE__ */ import_react.default.createElement("p", { style: S.statLabel }, m), /* @__PURE__ */ import_react.default.createElement("p", { style: S.statValue }, (s?.total_synced ?? 0).toLocaleString()), /* @__PURE__ */ import_react.default.createElement("p", { style: S.mutedSmall }, s?.last_error ? /* @__PURE__ */ import_react.default.createElement("span", { style: { color: "var(--red, #991b1b)" } }, "Error: ", s.last_error.slice(0, 80)) : s?.last_synced_at ? `Last sync ${new Date(s.last_synced_at).toLocaleString()} \xB7 +${s.last_count}` : "Never synced"));
  })), /* @__PURE__ */ import_react.default.createElement("p", { style: S.mutedSmall }, "Records are published into the Vencore data hub as ", /* @__PURE__ */ import_react.default.createElement("code", { style: S.code }, "crm.contact@v1"), ",", " ", /* @__PURE__ */ import_react.default.createElement("code", { style: S.code }, "crm.company@v1"), " and ", /* @__PURE__ */ import_react.default.createElement("code", { style: S.code }, "crm.deal@v1"), " \u2014 any module or plugin that consumes those contracts (project hooks, AI assistant, \u2026) sees them automatically."));
}
function RecordsBrowser({ invoke }) {
  const [module, setModule] = (0, import_react.useState)("Contacts");
  const [rows, setRows] = (0, import_react.useState)([]);
  const [cursor, setCursor] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const load = (0, import_react.useCallback)(async (mod, cur) => {
    setLoading(true);
    try {
      const page = await invoke("/records", { module: mod, cursor: cur, limit: 50 });
      setRows((prev) => cur ? [...prev, ...page.records] : page.records);
      setCursor(page.next_cursor);
    } finally {
      setLoading(false);
    }
  }, [invoke]);
  (0, import_react.useEffect)(() => {
    void load(module);
  }, [module, load]);
  const cols = {
    Contacts: [{ key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "company_name", label: "Company" }],
    Accounts: [{ key: "name", label: "Name" }, { key: "industry", label: "Industry" }, { key: "website", label: "Website" }, { key: "location", label: "Location" }],
    Deals: [{ key: "name", label: "Name" }, { key: "stage", label: "Stage" }, { key: "value", label: "Value" }, { key: "close_date", label: "Close date" }]
  };
  return /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("div", { style: S.tabs }, MODULES.map((m) => /* @__PURE__ */ import_react.default.createElement("button", { key: m, onClick: () => setModule(m), style: { ...S.tab, ...module === m ? S.tabActive : {} } }, m))), /* @__PURE__ */ import_react.default.createElement("div", { style: S.card }, /* @__PURE__ */ import_react.default.createElement("table", { style: S.table }, /* @__PURE__ */ import_react.default.createElement("thead", null, /* @__PURE__ */ import_react.default.createElement("tr", null, cols[module].map((c) => /* @__PURE__ */ import_react.default.createElement("th", { key: c.key, style: S.th }, c.label)), /* @__PURE__ */ import_react.default.createElement("th", { style: S.th }))), /* @__PURE__ */ import_react.default.createElement("tbody", null, rows.map((r) => /* @__PURE__ */ import_react.default.createElement("tr", { key: r.external_id }, cols[module].map((c) => /* @__PURE__ */ import_react.default.createElement("td", { key: c.key, style: S.td }, formatCell(r.data[c.key]))), /* @__PURE__ */ import_react.default.createElement("td", { style: { ...S.td, textAlign: "right" } }, typeof r.data["url"] === "string" && /* @__PURE__ */ import_react.default.createElement("a", { href: r.data["url"], target: "_blank", rel: "noreferrer", style: S.openLink }, "Open in Zoho \u2197")))), rows.length === 0 && !loading && /* @__PURE__ */ import_react.default.createElement("tr", null, /* @__PURE__ */ import_react.default.createElement("td", { colSpan: cols[module].length + 1, style: { ...S.td, textAlign: "center", color: "var(--text3, #9e998f)" } }, "No ", module.toLowerCase(), " synced yet.")))), cursor && /* @__PURE__ */ import_react.default.createElement("div", { style: { textAlign: "center", padding: "10px 0 2px" } }, /* @__PURE__ */ import_react.default.createElement("button", { style: S.btnGhost, disabled: loading, onClick: () => void load(module, cursor) }, loading ? "Loading\u2026" : "Load more"))));
}
function formatCell(v) {
  if (v == null || v === "") return "\u2014";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}
function SyncWidget({ vencore }) {
  const [status, setStatus] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (vencore.invoke) {
      vencore.invoke("/status").then(setStatus).catch(() => setStatus(null));
    }
  }, [vencore]);
  const total = status ? MODULES.reduce((n, m) => n + (status.modules[m]?.total_synced ?? 0), 0) : 0;
  return /* @__PURE__ */ import_react.default.createElement("div", { style: { padding: 4 } }, /* @__PURE__ */ import_react.default.createElement("p", { style: { ...S.statLabel, margin: 0 } }, "Zoho CRM"), status?.connected ? /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("p", { style: { ...S.statValue, margin: "2px 0" } }, total.toLocaleString()), /* @__PURE__ */ import_react.default.createElement("p", { style: { ...S.mutedSmall, margin: 0 } }, "records synced", status.last_full_sync_at ? ` \xB7 ${new Date(status.last_full_sync_at).toLocaleTimeString()}` : "")) : /* @__PURE__ */ import_react.default.createElement("p", { style: { ...S.mutedSmall, margin: "4px 0 0" } }, "Not connected"));
}
var S = {
  page: { maxWidth: 960, margin: "0 auto", padding: "20px 24px", fontFamily: "'DM Sans', sans-serif", color: "var(--text, #1a1814)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontFamily: "'Instrument Serif', serif", fontSize: 26, fontWeight: 400, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--text2, #6b665c)", margin: "4px 0 0" },
  tabs: { display: "flex", gap: 4, marginBottom: 14 },
  tab: { padding: "6px 14px", borderRadius: 8, border: "1px solid transparent", background: "transparent", fontSize: 13, fontWeight: 500, color: "var(--text2, #6b665c)", cursor: "pointer", fontFamily: "inherit" },
  tabActive: { background: "var(--surface, #fff)", border: "1px solid var(--border, #e4e0d8)", color: "var(--text, #1a1814)" },
  card: { background: "var(--surface, #fff)", border: "1px solid var(--border, #e4e0d8)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: 600, margin: "0 0 10px" },
  steps: { fontSize: 13, color: "var(--text2, #6b665c)", lineHeight: 1.8, margin: 0, paddingLeft: 18 },
  code: { background: "var(--surface2, #f0ede6)", borderRadius: 5, padding: "1px 6px", fontSize: 12 },
  input: { flex: 1, padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border, #e4e0d8)", background: "var(--surface, #fff)", color: "var(--text, #1a1814)", outline: "none", fontFamily: "inherit" },
  btnPrimary: { padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--text, #1a1814)", color: "var(--bg, #f7f6f2)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #e4e0d8)", background: "transparent", color: "var(--text, #1a1814)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  linkBtn: { border: "none", background: "none", color: "var(--blue, #1e3a8a)", cursor: "pointer", fontSize: 13, padding: 0, fontFamily: "inherit", textDecoration: "underline" },
  errorBox: { background: "var(--red-bg, #fee2e2)", color: "var(--red, #991b1b)", border: "1px solid var(--red, #991b1b)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 },
  statLabel: { fontSize: 12, fontWeight: 600, color: "var(--text3, #9e998f)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" },
  statValue: { fontFamily: "'Instrument Serif', serif", fontSize: 28, margin: "0 0 4px" },
  muted: { color: "var(--text3, #9e998f)", fontSize: 13, padding: 24 },
  mutedSmall: { color: "var(--text3, #9e998f)", fontSize: 12, lineHeight: 1.6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border, #e4e0d8)", fontSize: 11.5, fontWeight: 600, color: "var(--text3, #9e998f)", textTransform: "uppercase", letterSpacing: "0.04em" },
  td: { padding: "9px 10px", borderBottom: "1px solid var(--border, #e4e0d8)", color: "var(--text, #1a1814)" },
  openLink: { fontSize: 12, color: "var(--blue, #1e3a8a)", textDecoration: "none" }
};
function ContactSyncSection({ vencore }) {
  return /* @__PURE__ */ import_react.default.createElement("div", { style: {
    border: "1px solid var(--border, #e4e0d8)",
    borderRadius: 10,
    background: "var(--surface, #fff)",
    padding: "12px 14px",
    fontFamily: "'DM Sans', sans-serif"
  } }, /* @__PURE__ */ import_react.default.createElement("p", { style: { margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text3, #9e998f)" } }, "Zoho CRM"), /* @__PURE__ */ import_react.default.createElement("p", { style: { margin: "6px 0 0", fontSize: 13, color: "var(--text2, #6b665c)" } }, "This contact is synced from Zoho CRM."), /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      onClick: () => vencore.navigate("/plugins/zoho-crm"),
      style: {
        marginTop: 8,
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 500,
        border: "1px solid var(--border, #e4e0d8)",
        borderRadius: 7,
        background: "transparent",
        color: "var(--text, #1a1814)",
        cursor: "pointer",
        fontFamily: "inherit"
      }
    },
    "Open Zoho sync"
  ));
}
var client_default = {
  setup(vencore) {
    vencore.registerPage("/", () => /* @__PURE__ */ import_react.default.createElement(ZohoPage, { vencore }));
    if (vencore.registerWidget) {
      vencore.registerWidget("zoho-sync-status", () => /* @__PURE__ */ import_react.default.createElement(SyncWidget, { vencore }));
    }
    if (vencore.registerSection) {
      vencore.registerSection("zoho-contact-sync", () => /* @__PURE__ */ import_react.default.createElement(ContactSyncSection, { vencore }));
    }
  }
};
export {
  client_default as default
};
