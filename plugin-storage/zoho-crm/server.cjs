var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../../AppData/Local/Temp/vencore-plugin-MQrV4w/src/server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);

// ../../../AppData/Local/Temp/vencore-plugin-MQrV4w/src/shared/zoho.ts
var DATA_CENTERS = {
  US: { accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com", crmHost: "https://crm.zoho.com" },
  EU: { accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu", crmHost: "https://crm.zoho.eu" },
  IN: { accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in", crmHost: "https://crm.zoho.in" },
  AU: { accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au", crmHost: "https://crm.zoho.com.au" },
  JP: { accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp", crmHost: "https://crm.zoho.jp" }
};
function dc(code) {
  return DATA_CENTERS[(code ?? "US").toUpperCase()] ?? DATA_CENTERS["US"];
}
var MODULE_FIELDS = {
  Contacts: ["id", "First_Name", "Last_Name", "Full_Name", "Email", "Phone", "Mobile", "Account_Name", "Lead_Source", "Owner", "Modified_Time"],
  Accounts: ["id", "Account_Name", "Industry", "Website", "Billing_City", "Billing_Country", "Employees", "Owner", "Modified_Time"],
  Deals: ["id", "Deal_Name", "Amount", "Currency", "Stage", "Probability", "Closing_Date", "Contact_Name", "Account_Name", "Owner", "Modified_Time"]
};
var MODULE_CONTRACTS = {
  Contacts: "crm.contact@v1",
  Accounts: "crm.company@v1",
  Deals: "crm.deal@v1"
};
function str(v) {
  if (v == null || v === "") return null;
  return String(v);
}
function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function lookupName(v) {
  if (v && typeof v === "object" && "name" in v) return str(v.name);
  return str(v);
}
function lookupId(v) {
  if (v && typeof v === "object" && "id" in v) return str(v.id);
  return null;
}
function buildExtras(raw, mappedKeys) {
  const extras = {};
  for (const [k, v] of Object.entries(raw)) {
    if (mappedKeys.includes(k)) continue;
    if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      extras[k] = v;
    }
  }
  return extras;
}
function mapContact(raw, crmHost) {
  const id = String(raw["id"]);
  return {
    external_id: id,
    name: str(raw["Full_Name"]) ?? ([str(raw["First_Name"]), str(raw["Last_Name"])].filter(Boolean).join(" ") || "Unnamed contact"),
    email: str(raw["Email"]),
    phone: str(raw["Phone"]) ?? str(raw["Mobile"]),
    company_name: lookupName(raw["Account_Name"]),
    status: str(raw["Lead_Source"]),
    owner_name: lookupName(raw["Owner"]),
    url: `${crmHost}/crm/tab/Contacts/${id}`,
    modified_at: str(raw["Modified_Time"]),
    extras: buildExtras(raw, ["id", "Full_Name", "First_Name", "Last_Name", "Email", "Phone", "Mobile", "Account_Name", "Lead_Source", "Owner", "Modified_Time"])
  };
}
function mapAccount(raw, crmHost) {
  const id = String(raw["id"]);
  const city = str(raw["Billing_City"]);
  const country = str(raw["Billing_Country"]);
  return {
    external_id: id,
    name: str(raw["Account_Name"]) ?? "Unnamed account",
    industry: str(raw["Industry"]),
    website: str(raw["Website"]),
    location: [city, country].filter(Boolean).join(", ") || null,
    employee_count: num(raw["Employees"]),
    url: `${crmHost}/crm/tab/Accounts/${id}`,
    modified_at: str(raw["Modified_Time"]),
    extras: buildExtras(raw, ["id", "Account_Name", "Industry", "Website", "Billing_City", "Billing_Country", "Employees", "Owner", "Modified_Time"])
  };
}
function mapDeal(raw, crmHost) {
  const id = String(raw["id"]);
  const stage = str(raw["Stage"]);
  const stageLc = (stage ?? "").toLowerCase();
  return {
    external_id: id,
    name: str(raw["Deal_Name"]) ?? "Unnamed deal",
    value: num(raw["Amount"]),
    currency: str(raw["Currency"]),
    stage,
    is_won: stageLc.includes("closed won") || stageLc === "won",
    is_closed: stageLc.startsWith("closed") || stageLc === "won" || stageLc === "lost",
    probability: num(raw["Probability"]),
    close_date: str(raw["Closing_Date"]),
    contact_external_id: lookupId(raw["Contact_Name"]),
    company_external_id: lookupId(raw["Account_Name"]),
    owner_name: lookupName(raw["Owner"]),
    url: `${crmHost}/crm/tab/Potentials/${id}`,
    modified_at: str(raw["Modified_Time"]),
    extras: buildExtras(raw, ["id", "Deal_Name", "Amount", "Currency", "Stage", "Probability", "Closing_Date", "Contact_Name", "Account_Name", "Owner", "Modified_Time"])
  };
}
var MODULE_MAPPERS = {
  Contacts: mapContact,
  Accounts: mapAccount,
  Deals: mapDeal
};

// ../../../AppData/Local/Temp/vencore-plugin-MQrV4w/src/server.ts
var MODULES = ["Contacts", "Accounts", "Deals"];
var PAGE_SIZE = 200;
var MAX_PAGES_PER_SYNC = 25;
function json(status, body) {
  return { status, headers: { "Content-Type": "application/json" }, body };
}
function parseBody(req) {
  if (!req.body) return null;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}
var syncing = false;
var server_default = {
  async setup(vencore) {
    async function dataCenter() {
      return dc(await vencore.settings.get("data_center"));
    }
    async function isConnected() {
      const rt = await vencore.settings.get("refresh_token");
      return rt === "__secret_set__" || typeof rt === "string" && rt.length > 0;
    }
    async function refreshAccessToken() {
      const d = await dataCenter();
      const clientId = await vencore.settings.get("client_id") ?? "";
      if (!clientId) throw new Error("Zoho Client ID is not configured");
      const res = await vencore.http.fetch(`${d.accounts}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=refresh_token&client_id=${encodeURIComponent(clientId)}&client_secret={client_secret}&refresh_token={refresh_token}`,
        secret_body: true
      });
      const data = JSON.parse(res.body);
      if (!res.ok || !data.access_token) {
        throw new Error(`Token refresh failed: ${data.error ?? res.status}`);
      }
      const state = {
        access_token: data.access_token,
        expires_at: Date.now() + ((data.expires_in ?? 3600) - 120) * 1e3,
        api_domain: data.api_domain ?? null
      };
      await vencore.storage.set("oauth", state);
      return state;
    }
    async function getAccessToken() {
      const cached = await vencore.storage.get("oauth");
      if (cached && cached.expires_at > Date.now()) return cached;
      return refreshAccessToken();
    }
    async function zohoFetch(path, retried = false) {
      const d = await dataCenter();
      const oauth = await getAccessToken();
      const base = oauth.api_domain ?? d.api;
      const res = await vencore.http.fetch(`${base}/crm/v8${path}`, {
        headers: { Authorization: `Zoho-oauthtoken ${oauth.access_token}` },
        timeout: 6e4
      });
      if (res.status === 401 && !retried) {
        await refreshAccessToken();
        return zohoFetch(path, true);
      }
      let data = {};
      try {
        data = res.body ? JSON.parse(res.body) : {};
      } catch {
      }
      return { status: res.status, data };
    }
    async function getModuleState(module2) {
      return await vencore.storage.get(`sync:${module2}`) ?? {
        cursor: null,
        last_synced_at: null,
        last_count: 0,
        total_synced: 0,
        last_error: null
      };
    }
    async function syncModule(module2) {
      const state = await getModuleState(module2);
      const d = await dataCenter();
      const contract = MODULE_CONTRACTS[module2];
      const mapper = MODULE_MAPPERS[module2];
      const fields = MODULE_FIELDS[module2].join(",");
      let page = 1;
      let synced = 0;
      let maxModified = state.cursor;
      try {
        for (; page <= MAX_PAGES_PER_SYNC; page++) {
          let path = `/${module2}?fields=${encodeURIComponent(fields)}&per_page=${PAGE_SIZE}&page=${page}&sort_by=Modified_Time&sort_order=asc`;
          if (state.cursor) {
            path += `&modified_since=${encodeURIComponent(state.cursor)}`;
          }
          const { status, data } = await zohoFetch(path);
          if (status === 204) break;
          if (status === 429) throw new Error("Zoho rate limit hit \u2014 sync will resume on the next run");
          if (status < 200 || status >= 300) {
            throw new Error(`Zoho ${module2} fetch failed (HTTP ${status}): ${JSON.stringify(data).slice(0, 200)}`);
          }
          const records = data["data"] ?? [];
          if (records.length === 0) break;
          const mapped = records.map((r) => mapper(r, d.crmHost));
          await vencore.hub.publish(contract, mapped);
          synced += mapped.length;
          for (const r of records) {
            const mt = r["Modified_Time"];
            if (mt && (!maxModified || mt > maxModified)) maxModified = mt;
          }
          const info = data["info"];
          if (!info?.more_records) break;
        }
        await vencore.storage.set(`sync:${module2}`, {
          cursor: maxModified,
          last_synced_at: (/* @__PURE__ */ new Date()).toISOString(),
          last_count: synced,
          total_synced: state.total_synced + synced,
          last_error: null
        });
        return { synced, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await vencore.storage.set(`sync:${module2}`, {
          ...state,
          last_synced_at: (/* @__PURE__ */ new Date()).toISOString(),
          last_error: message
        });
        return { synced, error: message };
      }
    }
    async function syncAll() {
      if (syncing) return { ok: false, results: {}, duration_ms: 0 };
      syncing = true;
      const started = Date.now();
      const results = {};
      try {
        if (!await isConnected()) {
          return { ok: false, results: { _: { synced: 0, error: "Not connected to Zoho" } }, duration_ms: 0 };
        }
        for (const module2 of MODULES) {
          results[module2] = await syncModule(module2);
        }
        await vencore.storage.set("last_full_sync_at", (/* @__PURE__ */ new Date()).toISOString());
        const failed = Object.values(results).filter((r) => r.error);
        if (failed.length > 0) {
          await vencore.notify({
            title: "Zoho CRM sync finished with errors",
            body: failed.map((f) => f.error).join("; ").slice(0, 300),
            type: "warning"
          });
        }
        return { ok: failed.length === 0, results, duration_ms: Date.now() - started };
      } finally {
        syncing = false;
      }
    }
    const contributed = await vencore.hub.getSetting("sync_interval_min");
    const intervalMin = Number(contributed ?? await vencore.settings.get("sync_interval_min") ?? 15);
    vencore.cron.register(`every ${Math.max(5, intervalMin || 15)}m`, "sync", async () => {
      await syncAll();
    });
    vencore.http.onEndpoint("/status", async () => {
      const oauth = await vencore.storage.get("oauth");
      const d = await dataCenter();
      const modules = {};
      for (const m of MODULES) modules[m] = await getModuleState(m);
      const body = {
        connected: await isConnected(),
        data_center: await vencore.settings.get("data_center") ?? "US",
        api_domain: oauth?.api_domain ?? d.api,
        sync_interval_min: await vencore.settings.get("sync_interval_min") ?? 15,
        modules,
        last_full_sync_at: await vencore.storage.get("last_full_sync_at") ?? null,
        syncing
      };
      return json(200, body);
    });
    vencore.http.onEndpoint("/oauth/exchange", async (req) => {
      const body = parseBody(req);
      const code = body?.code?.trim();
      if (!code) return json(400, { error: "Grant code is required" });
      const d = await dataCenter();
      const clientId = await vencore.settings.get("client_id") ?? "";
      if (!clientId) return json(400, { error: "Configure the Zoho Client ID and Client Secret in plugin settings first." });
      const res = await vencore.http.fetch(`${d.accounts}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=authorization_code&client_id=${encodeURIComponent(clientId)}&client_secret={client_secret}&code=${encodeURIComponent(code)}`,
        secret_body: true
      });
      const data = JSON.parse(res.body);
      if (!res.ok || data.error || !data.access_token) {
        return json(400, { error: `Zoho rejected the grant code: ${data.error ?? `HTTP ${res.status}`}` });
      }
      if (!data.refresh_token) {
        return json(400, { error: 'Zoho returned no refresh token. Generate the grant code with scope "ZohoCRM.modules.READ,ZohoCRM.settings.READ" and try again.' });
      }
      await vencore.settings.set("refresh_token", data.refresh_token);
      await vencore.storage.set("oauth", {
        access_token: data.access_token,
        expires_at: Date.now() + ((data.expires_in ?? 3600) - 120) * 1e3,
        api_domain: data.api_domain ?? null
      });
      void syncAll();
      return json(200, { ok: true });
    });
    vencore.http.onEndpoint("/sync", async () => {
      const result = await syncAll();
      return json(result.ok ? 200 : 500, result);
    });
    vencore.http.onEndpoint("/records", async (req) => {
      const body = parseBody(req);
      const module2 = body?.module ?? "Contacts";
      const contract = MODULE_CONTRACTS[module2];
      if (!contract) return json(400, { error: `Unknown module '${module2}'` });
      const page = await vencore.hub.query(contract, {
        provider: "zoho-crm",
        cursor: body?.cursor,
        limit: Math.min(body?.limit ?? 50, 100)
      });
      return json(200, page);
    });
    vencore.http.onEndpoint("/disconnect", async () => {
      await vencore.settings.set("refresh_token", "");
      await vencore.storage.delete("oauth");
      await vencore.storage.delete("last_full_sync_at");
      for (const m of MODULES) await vencore.storage.delete(`sync:${m}`);
      return json(200, { ok: true });
    });
  }
};
