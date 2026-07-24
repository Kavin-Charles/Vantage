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
  plugin_data_sharing?: boolean;
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
  title?: string | null;
  social_links?: SocialLinks | null;
  avatar_url?: string | null;
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
  status: 'active' | 'prospect' | 'churned';
  annual_revenue?: number | null;
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
  hostname: string | null;
  os: string | null;
  arch: string | null;
  kernel: string | null;
  agent_version: string | null;
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

export type MetricsRange = '1h' | '24h' | '7d' | '30d';

/**
 * Unified metrics point returned by GET /servers/:id/metrics. Short ranges come
 * from raw snapshots; long ranges from rollups (avg/max already aggregated).
 */
export interface MetricsPoint {
  t: string;          // ISO timestamp (snapshot recorded_at or rollup bucket)
  cpu_pct: number;    // avg
  mem_pct: number;    // avg
  disk_pct: number;   // avg
  load_avg_1m: number;
  net_in_bytes: number;
  net_out_bytes: number;
  cpu_max?: number;
  mem_max?: number;
  disk_max?: number;
}

export interface MetricsSeries {
  range: MetricsRange;
  resolution: 'raw' | 'hour' | 'day';
  points: MetricsPoint[];
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

export type ChannelType = 'channel' | 'dm' | 'group_dm';
export type ChannelMemberRole = 'owner' | 'member';

export interface Channel {
  id: UUID;
  workspace_id: UUID;
  name: string;
  type: ChannelType;
  is_private: boolean;
  topic: string | null;
  created_by: UUID | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  /** Populated on list responses — count of messages the user hasn't read yet */
  unread_count?: number;
  /** Populated on list responses — latest message preview */
  last_message?: Pick<Message, 'id' | 'body' | 'user_id' | 'created_at'> | null;
}

export interface ChannelMember {
  channel_id: UUID;
  user_id: UUID;
  role: ChannelMemberRole;
  joined_at: string;
  /** Populated on member list responses */
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface Message {
  id: UUID;
  channel_id: UUID;
  workspace_id: UUID;
  user_id: UUID | null;
  body: string;
  parent_message_id: UUID | null;
  thread_count: number;
  mention_user_ids: UUID[] | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  /** Populated on responses */
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
  author?: Pick<User, 'id' | 'name' | 'email'> | null;
}

export interface MessageReaction {
  message_id: UUID;
  user_id: UUID;
  emoji: string;
  created_at: string;
}

export interface MessageAttachment {
  id: UUID;
  message_id: UUID;
  workspace_id: UUID;
  r2_key: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
  /** Presigned download URL — short-lived, generated on read */
  url?: string;
}

export interface ChannelReadState {
  channel_id: UUID;
  user_id: UUID;
  last_read_message_id: UUID | null;
}

export interface MessagesPage {
  messages: Message[];
  has_more: boolean;
  oldest_id: string | null;
}

export type WsClientEvent =
  | { type: 'subscribe'; channel_ids: string[] }
  | { type: 'typing.start'; channel_id: string }
  | { type: 'typing.stop'; channel_id: string }
  | { type: 'mark_read'; channel_id: string; message_id: string };

export type WsServerEvent =
  | { type: 'message.new'; message: Message }
  | { type: 'message.edited'; message_id: string; body: string; edited_at: string }
  | { type: 'message.deleted'; message_id: string; channel_id: string }
  | { type: 'reaction.added'; message_id: string; user_id: string; emoji: string }
  | { type: 'reaction.removed'; message_id: string; user_id: string; emoji: string }
  | { type: 'channel.member_joined'; channel_id: string; user: Pick<User, 'id' | 'name' | 'email'> }
  | { type: 'channel.member_left'; channel_id: string; user_id: string }
  | { type: 'user.presence'; user_id: string; status: 'online' | 'away' | 'offline' }
  | { type: 'user.typing'; channel_id: string; user_id: string; name: string };

export interface SocialLinks {
  linkedin?: string;
  twitter?: string;
  website?: string;
}

/**
 * Not yet exported elsewhere in this package — added here because
 * ContactOverview needs it. Mirrors `DealTable` in packages/db/src/schema.ts.
 */
export interface Deal {
  id: UUID;
  workspace_id: UUID;
  pipeline_id: UUID | null;
  stage_id: UUID | null;
  contact_id: UUID | null;
  company_id: UUID | null;
  owner_id: UUID;
  name: string;
  value: number;
  probability: number;
  close_date: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type DealPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Deal as projected by the contact/company overview endpoints from a
 * `pipeline_items` row: name/value read out of `field_values`, `stage`
 * resolved to the pipeline stage's display name. Distinct from the legacy
 * `Deal` (which mirrored the dropped `deals` table).
 */
export interface OverviewDeal {
  id: UUID;
  name: string;
  value: number;
  stage_id: UUID | null;
  stage: string | null;
  contact_id: UUID | null;
  company_id: UUID | null;
}

export interface ContactOverviewMetrics {
  total_deal_value: number;
  interaction_count: number;
  current_stage: string | null;
  last_contact_at: string | null;
}

export interface StageFunnelEntry {
  stage: string;
  total: number;
}

export interface ContactOverview {
  contact: Contact;
  deals: OverviewDeal[];
  activities: Activity[];
  tasks: Task[];
  metrics: ContactOverviewMetrics;
  stage_funnel: StageFunnelEntry[];
}

export interface CompanyOverviewMetrics {
  total_deal_value: number;
  open_deal_count: number;
  contact_count: number;
  last_activity_at: string | null;
}

export interface CompanyOverview {
  company: Company;
  contacts: Contact[];
  deals: OverviewDeal[];
  activities: Activity[];
  tasks: Task[];
  metrics: CompanyOverviewMetrics;
}
