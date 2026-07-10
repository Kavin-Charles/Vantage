// ── Domain models (plugin-visible shape — no internal DB fields) ─────────────

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  status?: Contact['status'];
  company_id?: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'prospect' | 'customer' | 'cold' | 'churned';
  company_id: string | null;
  owner_id: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactFilter {
  status?: Contact['status'];
  company_id?: string;
  limit?: number;
  offset?: number;
}

export interface DealInput {
  name: string;
  value?: number;
  stage_id?: string;
  pipeline_id?: string;
  probability?: number;
  close_date?: string;
  contact_id?: string;
  company_id?: string;
}

export interface Deal {
  id: string;
  name: string;
  value: number;
  stage_id: string | null;
  pipeline_id: string | null;
  probability: number;
  close_date: string | null;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface DealFilter {
  stage_id?: string;
  pipeline_id?: string;
  contact_id?: string;
  owner_id?: string;
  limit?: number;
  offset?: number;
}

export interface CompanyInput {
  name: string;
  industry?: string;
  location?: string;
  employee_count?: number;
  website?: string;
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  location: string | null;
  employee_count: number | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyFilter {
  limit?: number;
  offset?: number;
}

export interface TaskInput {
  title: string;
  due_date?: string;
  assignee_id?: string;
  contact_id?: string;
  deal_id?: string;
}

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'done';
  due_date: string | null;
  assignee_id: string;
  contact_id: string | null;
  deal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskFilter {
  status?: Task['status'];
  assignee_id?: string;
  contact_id?: string;
  deal_id?: string;
  limit?: number;
}

export interface ActivityInput {
  type: ActivityRecord['type'];
  body?: string;
  meta?: Record<string, unknown>;
  contact_id?: string;
  deal_id?: string;
}

export interface ActivityRecord {
  id: string;
  type: 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert';
  body: string | null;
  meta: Record<string, unknown> | null;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  created_at: string;
}

export interface ActivityFilter {
  contact_id?: string;
  deal_id?: string;
  type?: ActivityRecord['type'];
  limit?: number;
}

export interface Server {
  id: string;
  name: string;
  region: string | null;
  ip_address: string | null;
  status: 'online' | 'degraded' | 'offline' | 'stopped';
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  uptime_seconds: number | null;
  last_ping_at: string | null;
}

export interface ServerFilter {
  status?: Server['status'];
  limit?: number;
}

export interface Website {
  id: string;
  url: string;
  label: string | null;
  status: 'online' | 'degraded' | 'offline';
  response_ms: number | null;
  uptime_pct_30d: number | null;
  ssl_expiry_date: string | null;
  last_checked_at: string | null;
}

export interface WebsiteFilter {
  status?: Website['status'];
  limit?: number;
}

// ── Context (frontend only) ──────────────────────────────────────────────────

export interface PluginContext {
  workspace_id: string;
  user_id: string;
  page: 'contact-detail' | 'deal-detail' | 'dashboard-widget' | 'full-page' | string;
  record_id: string | null;
  record_type: 'contact' | 'deal' | null;
}

// ── Error + Result ───────────────────────────────────────────────────────────

export interface PluginError {
  code: string;
  message: string;
}

export type PluginResult<T> =
  | { data: T; error: null }
  | { data: null; error: PluginError };

// ── HTTP bridge types ────────────────────────────────────────────────────────

export interface HttpFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
}

// ── Bridge call / result ─────────────────────────────────────────────────────

export interface BridgeCall {
  method: string;
  payload: unknown;
}

export type BridgeResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: PluginError };

export type BridgeFn = (call: BridgeCall) => Promise<BridgeResult>;

// ── Plugin table schema (manifest) ──────────────────────────────────────────

export type PluginColumnType =
  | 'uuid' | 'text' | 'integer' | 'bigint' | 'boolean'
  | 'decimal' | 'timestamptz' | 'jsonb';

export interface PluginColumnDef {
  name: string;
  type: PluginColumnType;
  nullable?: boolean;
  primary?: boolean;
  unique?: boolean;
  default?: string;
}

export interface PluginIndexDef {
  columns: string[];
  unique?: boolean;
}

export interface PluginTableDef {
  name: string;
  columns: PluginColumnDef[];
  indexes?: PluginIndexDef[];
  drop_on_uninstall?: boolean;
}

export interface PluginMigration {
  version: string;
  up: string;
  down?: string;
}

// ── Resource type map ────────────────────────────────────────────────────────

export type ResourceTypeMap = {
  contacts: { row: Contact; input: ContactInput; filter: ContactFilter };
  companies: { row: Company; input: CompanyInput; filter: CompanyFilter };
  deals: { row: Deal; input: DealInput; filter: DealFilter };
  tasks: { row: Task; input: TaskInput; filter: TaskFilter };
  activity: { row: ActivityRecord; input: ActivityInput; filter: ActivityFilter };
  servers: { row: Server; input: never; filter: ServerFilter };
  websites: { row: Website; input: never; filter: WebsiteFilter };
};

export type KnownResource = keyof ResourceTypeMap;

export type ResourceRow<R extends string> =
  R extends KnownResource ? ResourceTypeMap[R]['row'] : unknown;

export type ResourceInput<R extends string> =
  R extends KnownResource ? ResourceTypeMap[R]['input'] : Record<string, unknown>;

export type ResourceFilter<R extends string> =
  R extends KnownResource ? ResourceTypeMap[R]['filter'] : Record<string, unknown>;

// ── PluginTableClient ────────────────────────────────────────────────────────

export interface PluginTableClient {
  list(opts?: {
    where?: Record<string, unknown>;
    orderBy?: string;
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>[]>;
  get(id: string): Promise<Record<string, unknown>>;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<void>;
  upsert(
    data: Record<string, unknown>,
    opts: { on_conflict: string },
  ): Promise<Record<string, unknown>>;
  count(where?: Record<string, unknown>): Promise<number>;
}

// ── Permissions ──────────────────────────────────────────────────────────────

export type PluginPermission =
  | 'contacts:read' | 'contacts:write'
  | 'companies:read' | 'companies:write'
  | 'deals:read' | 'deals:write'
  | 'tasks:read' | 'tasks:write'
  | 'activity:read' | 'activity:write'
  | 'servers:read'
  | 'websites:read'
  | 'storage:read' | 'storage:write'
  | 'http:fetch'
  | `hub:read:${string}`
  | `hub:write:${string}`;

// ── Data hub (cross-plugin data sharing) ─────────────────────────────────────

/** Declares that this plugin publishes records for a contract into the hub. */
export interface PluginProvidesDef {
  /** Versioned contract id, e.g. "crm.contact@v1". */
  contract: string;
  /** How records reach consumers. Only "synced" (materialized) is supported. */
  mode?: 'synced';
}

/** Declares that this plugin reads records for a contract from the hub. */
export interface PluginConsumesDef {
  /** Versioned contract id, e.g. "crm.contact@v1". */
  contract: string;
  /** When true, the plugin works without any installed provider. */
  optional?: boolean;
}

/**
 * A hook feature declared by a plugin: an admin-toggleable behavior that runs
 * in the plugin sandbox when a contract event fires. The host dispatches
 * `hook:<id>` to the plugin with the event payload + saved config.
 */
export interface PluginHookFeatureDef {
  /** Stable feature id, referenced by the dispatched `hook:<id>` bus event. */
  id: string;
  name: string;
  description?: string;
  /** Contract event that triggers this feature, e.g. "crm.deal@v1:stage_changed". */
  trigger: string;
  /** Contract that must have an active provider for the feature to be available. */
  requires_contract?: string;
  /** Admin-configurable parameters, rendered on the hooks settings page. */
  config_schema?: PluginSettingsField[];
}

/**
 * A UI section a plugin contributes to a named page slot. The plugin's client
 * bundle registers a matching component via `vencore.registerSection(id, C)`.
 */
export interface PluginSectionDef {
  /** Stable section id, also the registration key. */
  id: string;
  /** Target slot as `page:slotId`, e.g. "contact-detail:sidebar". */
  slot: string;
  label?: string;
  /** Ordering weight within a slot — lower renders first. Default 100. */
  priority?: number;
  /** Only render when this contract has an active provider. */
  requires_contract?: string;
}

/** A settings field a plugin contributes to a domain settings page. */
export interface ContributedSettingsField {
  key: string;
  type: PluginSettingsFieldType;
  label: string;
  default?: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  secret?: boolean;
  /** When true, consumers may read this value via hub.getSharedSetting. */
  shared?: boolean;
}

/**
 * Feature settings a plugin contributes to a domain settings page (e.g. sync
 * frequency under CRM settings). Auth/private config stays on the plugin's own
 * settings page via settings_schema; these belong where users expect them.
 */
export interface PluginSettingsContributionDef {
  /** Domain settings page: 'crm' | 'infra' | 'general'. */
  domain: string;
  /** Section id within the domain page. */
  section: string;
  label: string;
  fields: ContributedSettingsField[];
}

/** Named UI insertion points a page exposes. */
export interface SlotDef {
  id: string;
  layout: 'single' | 'stack' | 'grid' | 'inline';
}

/** v1 slot catalog — pages and the slots they expose. */
export const SLOT_CATALOG: Record<string, SlotDef[]> = {
  'dashboard': [
    { id: 'stats', layout: 'grid' }, { id: 'main', layout: 'stack' },
    { id: 'sidebar', layout: 'stack' }, { id: 'widgets', layout: 'grid' },
    { id: 'extras', layout: 'stack' },
  ],
  'contact-detail': [
    { id: 'header', layout: 'single' }, { id: 'main', layout: 'stack' },
    { id: 'sidebar', layout: 'stack' }, { id: 'timeline', layout: 'stack' },
    { id: 'extras', layout: 'stack' },
  ],
  'deal-detail': [
    { id: 'header', layout: 'single' }, { id: 'main', layout: 'stack' },
    { id: 'sidebar', layout: 'stack' }, { id: 'timeline', layout: 'stack' },
    { id: 'extras', layout: 'stack' },
  ],
  'company-detail': [
    { id: 'header', layout: 'single' }, { id: 'main', layout: 'stack' },
    { id: 'sidebar', layout: 'stack' }, { id: 'extras', layout: 'stack' },
  ],
  'contact-list': [{ id: 'toolbar', layout: 'inline' }, { id: 'extras', layout: 'stack' }],
  'deal-list': [{ id: 'toolbar', layout: 'inline' }, { id: 'extras', layout: 'stack' }],
};

export function isKnownSlot(slot: string): boolean {
  const [page, slotId] = slot.split(':');
  if (!page || !slotId) return false;
  return (SLOT_CATALOG[page] ?? []).some((s) => s.id === slotId);
}

/** A record as stored in / returned by the hub. */
export interface HubRecord<T = Record<string, unknown>> {
  provider: string;
  external_id: string;
  data: T;
  updated_at: string;
}

export interface HubQueryOptions {
  /** Restrict to one provider plugin id. */
  provider?: string;
  /** Exact-match filters on top-level record fields. */
  filter?: Record<string, string | number | boolean>;
  cursor?: string;
  limit?: number;
}

export interface HubQueryResult<T = Record<string, unknown>> {
  records: Array<HubRecord<T>>;
  next_cursor: string | null;
}

export interface HubProviderInfo {
  plugin_id: string;
  name: string;
  record_count: number;
  last_published_at: string | null;
}

// ── Hook events ──────────────────────────────────────────────────────────────

export type PluginHookEvent =
  | 'contact.created' | 'contact.updated' | 'contact.deleted'
  | 'deal.created' | 'deal.updated' | 'deal.deleted'
  | 'task.created' | 'task.updated'
  | (string & {});

// ── Plugin manifest ──────────────────────────────────────────────────────────

export interface PluginNavEntry {
  label: string;
  href: string;
  icon?: string;
  group?: 'crm' | 'infra' | 'general';
}

export interface PluginPermissionDef {
  key: string;
  label: string;
  defaultRoles: Array<'admin' | 'member'>;
}

export type PluginSettingsFieldType = 'text' | 'boolean' | 'number' | 'select';

export interface PluginSettingsFieldBase {
  type: PluginSettingsFieldType;
  key: string;
  label: string;
  secret?: boolean;
}

export interface PluginSettingsTextField extends PluginSettingsFieldBase {
  type: 'text';
  default?: string;
}

export interface PluginSettingsBooleanField extends PluginSettingsFieldBase {
  type: 'boolean';
  default?: boolean;
}

export interface PluginSettingsNumberField extends PluginSettingsFieldBase {
  type: 'number';
  default?: number;
  min?: number;
  max?: number;
}

export interface PluginSettingsSelectField extends PluginSettingsFieldBase {
  type: 'select';
  options: string[];
  default?: string;
}

export type PluginSettingsField =
  | PluginSettingsTextField
  | PluginSettingsBooleanField
  | PluginSettingsNumberField
  | PluginSettingsSelectField;

export interface PluginSurfaces {
  nav?: Array<{ label: string; path: string; icon?: string; group?: 'crm' | 'infra' | 'general' }>;
  pages?: Array<{ path: string; title: string }>;
  widgets?: Array<{ id: string; label: string }>;
  panels?: Array<{ record_type: string; id: string; label: string }>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** SDK version this plugin was built with. Host validates major version compat. */
  sdk_version?: string;
  description?: string;
  icon?: string;
  author?: string;
  homepage?: string;
  permissions?: PluginPermissionDef[];
  data_access?: PluginPermission[];
  tables?: PluginTableDef[];
  migrations?: PluginMigration[];
  hooks?: PluginHookEvent[];
  emits?: string[];
  listens?: string[];
  provides?: PluginProvidesDef[];
  consumes?: PluginConsumesDef[];
  hook_features?: PluginHookFeatureDef[];
  sections?: PluginSectionDef[];
  settings_contributions?: PluginSettingsContributionDef[];
  endpoints?: string[];
  surfaces?: PluginSurfaces;
  settings_schema?: PluginSettingsField[];
  build?: { server?: string; client?: string };
  nav?: PluginNavEntry;
  ui?: {
    widgets?: Array<'contact-detail' | 'deal-detail' | 'dashboard-widget' | 'full-page'>;
  };
}
