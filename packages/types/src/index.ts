export type UUID = string;

export type ContactStatus = 'prospect' | 'customer' | 'cold' | 'churned';
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';
export type TaskStatus = 'todo' | 'done';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type UserRole = 'admin' | 'member';
export type WorkspacePlan = 'trial' | 'active' | 'cancelled';
export type ActivityType = 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert';
export type ResourceType = 'server' | 'database' | 'website' | 'crm';
export type UsageMeterStatus = 'pending' | 'invoiced' | 'paid' | 'failed';

export interface Workspace {
  id: UUID;
  name: string;
  domain: string;
  plan: WorkspacePlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  seat_count: number;
  contact_count: number;
  server_count: number;
  db_count: number;
  trial_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: UUID;
  workspace_id: UUID;
  clerk_user_id: string;
  name: string;
  email: string;
  role: UserRole;
  last_login_at: Date | null;
  created_at: Date;
}

export interface ContactTag {
  id: UUID;
  name: string;
  color: string;
}

export interface Contact {
  id: UUID;
  workspace_id: UUID;
  company_id: UUID | null;
  owner_id: UUID;
  name: string;
  email: string;
  phone: string | null;
  status: ContactStatus;
  last_contacted_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  /** Present on contacts list/get responses; absent on raw DB rows from other endpoints. */
  tags?: ContactTag[];
}

export interface Company {
  id: UUID;
  workspace_id: UUID;
  name: string;
  industry: string | null;
  location: string | null;
  employee_count: number | null;
  website: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  record_type_id: string;
  view: 'kanban' | 'table' | 'list';
  table_columns: string[] | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemGroup {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface GroupStage {
  id: string;
  group_id: string;
  name: string;
  color: string | null;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemField {
  id: string;
  group_id: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  workspace_id: string;
  group_id: string;
  stage_id: string;
  title: string;
  value: number | null;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
  converted_from_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Populated when fetching items list */
  field_values?: Record<string, string>;
}

export interface ItemGroupWithStages extends ItemGroup {
  stages: (GroupStage & { fields: ItemField[] })[];
  fields: ItemField[];
}

export interface Task {
  id: UUID;
  workspace_id: UUID;
  assignee_id: UUID;
  contact_id: UUID | null;
  record_id: UUID | null;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  created_at: Date;
  updated_at: Date;
}

export interface Activity {
  id: UUID;
  workspace_id: UUID;
  user_id: UUID;
  contact_id: UUID | null;
  record_id: UUID | null;
  type: ActivityType;
  body: string | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
}

export interface Alert {
  id: UUID;
  workspace_id: UUID;
  resource_type: ResourceType;
  resource_id: UUID | null;
  severity: AlertSeverity;
  message: string;
  metric_type: string | null;
  acknowledged: boolean;
  acknowledged_by: UUID | null;
  resolved: boolean;
  resolved_at: Date | null;
  created_at: Date;
}

export interface UsageMeter {
  id: UUID;
  workspace_id: UUID;
  period_start: Date;
  period_end: Date;
  contact_count_peak: number;
  server_count_peak: number;
  db_count_peak: number;
  seat_count_peak: number;
  base_fee: number;
  overage_total: number;
  total_bill: number;
  stripe_invoice_id: string | null;
  status: UsageMeterStatus;
  created_at: Date;
}

export type ServerStatus = 'online' | 'degraded' | 'offline' | 'stopped';
export type DbEngine = 'postgres' | 'mysql' | 'redis' | 'clickhouse' | 'mongo' | 'other';
export type InfraDatabaseStatus = 'healthy' | 'degraded' | 'offline';
export type WebsiteStatus = 'online' | 'degraded' | 'offline';

export interface Server {
  id: string;
  workspace_id: string;
  name: string;
  region: string | null;
  ip_address: string | null;
  agent_token_hash: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  uptime_seconds: number | null;
  load_avg_1m: number | null;
  net_in_bytes: number | null;
  net_out_bytes: number | null;
  ssh_port: number;
  status: ServerStatus;
  last_ping_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfraDatabase {
  id: string;
  workspace_id: string;
  name: string;
  engine: DbEngine;
  version: string | null;
  host: string | null;
  port: number | null;
  db_user: string | null;
  database_name: string | null;
  use_ssl: boolean;
  has_password?: boolean;
  storage_gb: number | null;
  connection_count: number | null;
  replication_lag_s: number | null;
  memory_used_mb: number | null;
  connected_clients: number | null;
  uptime_seconds: number | null;
  status: InfraDatabaseStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfraDatabaseColumn {
  name: string;
  data_type: string;
  nullable: boolean;
  primary_key: boolean;
}

export interface InfraDatabaseTable {
  schema: string;
  name: string;
  columns: InfraDatabaseColumn[];
  primary_key: string[];
}

export interface InfraDatabaseRows {
  columns: InfraDatabaseColumn[];
  rows: Record<string, unknown>[];
  primary_key: string[];
  page: number;
  limit: number;
}

export interface InfraDatabaseSqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  kind: 'select' | 'dml';
}

export interface InfraDatabaseConnectionTestResult {
  ok: boolean;
  latency_ms: number;
  message: string;
}

export interface Website {
  id: string;
  workspace_id: string;
  url: string;
  label: string | null;
  host: string | null;
  response_ms: number | null;
  uptime_pct_30d: number | null;
  ssl_expiry_date: string | null;
  status: WebsiteStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricsSnapshot {
  id: string;
  server_id: string;
  workspace_id: string;
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  load_avg_1m: number;
  net_in_bytes: number;
  net_out_bytes: number;
  recorded_at: string;
}

export interface AlertThreshold {
  id: string;
  workspace_id: string;
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  response_ms: number;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: { code: string; message: string };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface WorkspaceSshKeypair {
  id: string;
  workspace_id: string;
  public_key: string;
  ssh_user: string;
  // encrypted_private_key and iv are never sent to clients
  created_at: string;
  updated_at: string;
}

export interface SshCommandLog {
  id: string;
  workspace_id: string;
  server_id: string;
  user_id: string;
  command: string;
  exit_code: number | null;
  created_at: string;
}

export interface SshServiceEntry {
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface SshFileEntry {
  name: string;
  type: 'file' | 'dir' | 'link' | 'other';
  size: number;
  modified: string;
}

// SSE event shapes sent by SSH routes
export type SshStreamEvent =
  | { type: 'stdout'; line: string }
  | { type: 'stderr'; line: string }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string }
  | { type: 'service'; entry: SshServiceEntry };

export interface WebhookSubscription {
  id: string;
  workspace_id: string;
  target_url: string;
  event: string;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event: string;
  payload: unknown;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface ApiKey {
  id: string;
  workspace_id: string;
  name: string;
  prefix: string;
  scope: string;
  last_used_at: string | null;
  created_at: string;
  // key_hash never returned to client
}

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  category: 'holiday' | 'company_event' | 'meeting' | 'other';
  color: string | null;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type DeploymentStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
export type DeploymentSource = 'webhook' | 'agent' | 'manual';

export interface Deployment {
  id: UUID;
  workspace_id: UUID;
  server_id: UUID | null;
  name: string | null;
  environment: string | null;
  status: DeploymentStatus;
  source: DeploymentSource;
  started_at: string;
  finished_at: string | null;
  duration_s: number | null;
  git_commit: string | null;
  git_branch: string | null;
  git_tag: string | null;
  git_message: string | null;
  git_author: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface PipelineRecord {
  id: string;
  workspace_id: string;
  record_type_id: string;
  pipeline_id: string;
  stage_id: string;
  record_number: string | null;
  name: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordFieldValue {
  id: string;
  record_id: string;
  field_id: string;
  value: unknown;
}

export interface PipelineRecordWithValues extends PipelineRecord {
  field_values: RecordFieldValue[];
}

export interface RecordType {
  id: string;
  workspace_id: string;
  name: string;
  icon: string | null;
  description: string | null;
  auto_number_enabled: boolean;
  auto_number_prefix: string | null;
  auto_number_format: string;
  auto_number_sequence: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RecordTypeField {
  id: string;
  record_type_id: string;
  label: string;
  field_type: FieldType;
  options: { label: string; value: string }[] | null;
  is_required: boolean;
  position: number;
  created_at: string;
}

export interface RecordTypePermission {
  id: string;
  record_type_id: string;
  role: UserRole;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface RecordTypeWithFields extends RecordType {
  fields: RecordTypeField[];
}

export interface PipelineWithDetails extends Pipeline {
  stages: PipelineStage[];
  record_type: RecordTypeWithFields | null;
}

export interface ConversionTemplate {
  id: string;
  workspace_id: string;
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  position: number;
  created_at: string;
}

export interface ConversionFieldMapping {
  id: string;
  template_id: string;
  source_field_id: string | null;
  source_builtin: string | null;
  target_field_id: string | null;
  target_builtin: string | null;
}

export interface ConversionTemplateWithMappings extends ConversionTemplate {
  field_mappings: ConversionFieldMapping[];
}
