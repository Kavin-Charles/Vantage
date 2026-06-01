import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { ServerStatus, DbEngine, InfraDatabaseStatus, WebsiteStatus, FieldType } from '@vantage/types';

export interface WorkspaceTable {
  id: Generated<string>;
  name: string;
  domain: string | null;
  seat_count: Generated<number>;
  contact_count: Generated<number>;
  server_count: Generated<number>;
  db_count: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  email: string;
  role: Generated<'admin' | 'member'>;
  password_hash: string;
  password_reset_token: string | null;
  password_reset_expires_at: Date | null;
  last_login_at: Date | null;
  created_at: Generated<Date>;
}

export interface CompanyTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  industry: string | null;
  location: string | null;
  employee_count: number | null;
  website: string | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ContactTable {
  id: Generated<string>;
  workspace_id: string;
  company_id: string | null;
  owner_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: Generated<'prospect' | 'customer' | 'cold' | 'churned'>;
  last_contacted_at: Date | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DealTable {
  id: Generated<string>;
  workspace_id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  name: string;
  value: Generated<number>;
  probability: Generated<number>;
  close_date: Date | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TaskTable {
  id: Generated<string>;
  workspace_id: string;
  assignee_id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  due_date: Date | null;
  status: Generated<'todo' | 'done'>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ActivityTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  type: 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert';
  body: string | null;
  meta: Record<string, unknown> | null;
  created_at: Generated<Date>;
}

export interface AlertTable {
  id: Generated<string>;
  workspace_id: string;
  resource_type: 'server' | 'database' | 'website' | 'crm';
  resource_id: string | null;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  acknowledged: Generated<boolean>;
  acknowledged_by: string | null;
  resolved: Generated<boolean>;
  resolved_at: Date | null;
  created_at: Generated<Date>;
}

export interface ServerTable {
  id: Generated<string>;
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
  ssh_port: Generated<number>;
  status: Generated<ServerStatus>;
  last_ping_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface InfraDatabaseTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  engine: DbEngine;
  version: string | null;
  host: string | null;
  port: number | null;
  db_user: string | null;
  db_password: string | null;
  database_name: string | null;
  use_ssl: Generated<boolean>;
  storage_gb: number | null;
  connection_count: number | null;
  replication_lag_s: number | null;
  memory_used_mb: number | null;
  connected_clients: number | null;
  uptime_seconds: number | null;
  status: Generated<InfraDatabaseStatus>;
  last_checked_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface WebsiteTable {
  id: Generated<string>;
  workspace_id: string;
  url: string;
  label: string | null;
  host: string | null;
  response_ms: number | null;
  uptime_pct_30d: number | null;
  ssl_expiry_date: string | null;
  status: Generated<WebsiteStatus>;
  last_checked_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface MetricsSnapshotTable {
  id: Generated<string>;
  server_id: string;
  workspace_id: string;
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  load_avg_1m: number;
  net_in_bytes: number;
  net_out_bytes: number;
  recorded_at: Generated<string>;
}

export interface AlertThresholdTable {
  id: Generated<string>;
  workspace_id: string;
  cpu_pct: Generated<number>;
  mem_pct: Generated<number>;
  disk_pct: Generated<number>;
  response_ms: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface WorkspaceSshKeypairTable {
  id: Generated<string>;
  workspace_id: string;
  public_key: string;
  encrypted_private_key: string;
  iv: string;
  ssh_user: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SshCommandLogTable {
  id: Generated<string>;
  workspace_id: string;
  server_id: string;
  user_id: string;
  command: string;
  exit_code: number | null;
  created_at: Generated<string>;
}

export interface PipelineTable {
  id: Generated<string>;
  workspace_id: string;
  record_type_id: string | null;
  name: string;
  is_default: Generated<boolean>;
  position: Generated<number>;
  view: Generated<string>;          // 'kanban' | 'table' | 'list'
  table_columns: string[] | null;   // jsonb, null = use default columns
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PipelineStageTable {
  id: Generated<string>;
  pipeline_id: string;
  name: string;
  color: Generated<string>;
  position: Generated<number>;
  is_won: Generated<boolean>;
  is_lost: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StageFieldTable {
  id: Generated<string>;
  stage_id: string;
  name: string;
  field_type: FieldType;
  is_required: Generated<boolean>;
  options: string[] | null;  // jsonb
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DealFieldValueTable {
  id: Generated<string>;
  deal_id: string;
  field_id: string;
  value: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemGroupTable {
  id: Generated<string>;
  pipeline_id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface GroupStageTable {
  id: Generated<string>;
  group_id: string;
  name: string;
  color: string | null;
  position: Generated<number>;
  is_won: Generated<boolean>;
  is_lost: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemTable {
  id: Generated<string>;
  workspace_id: string;
  group_id: string;
  stage_id: string;
  title: string;
  value: number | null;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
  converted_from_id: string | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemFieldTable {
  id: Generated<string>;
  group_id: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  required: Generated<boolean>;
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemFieldValueTable {
  id: Generated<string>;
  item_id: string;
  field_id: string;
  value: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WebhookSubscriptionTable {
  id: Generated<string>;
  workspace_id: string;
  target_url: string;
  event: string;
  secret: string;
  created_at: Generated<string>;
}

export interface WebhookDeliveryTable {
  id: Generated<string>;
  subscription_id: string;
  event: string;
  payload: unknown;
  status: Generated<string>;
  attempts: Generated<number>;
  next_attempt_at: Generated<string>;
  last_error: string | null;
  created_at: Generated<string>;
  delivered_at: string | null;
}

export interface ApiKeyTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  key_hash: string;
  prefix: string;
  scope: string;
  last_used_at: Date | null;
  created_at: Generated<Date>;
}

export interface NotificationTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  resource_type: string | null;
  resource_id: string | null;
  read: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface EmailAccountTable {
  id: Generated<string>;
  user_id: string;
  workspace_id: string;
  provider: 'gmail' | 'imap';
  email: string;
  display_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  gmail_history_id: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_pass: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  use_ssl: Generated<boolean>;
  sync_status: Generated<'idle' | 'syncing' | 'error'>;
  sync_error: string | null;
  last_synced_at: string | null;
  gmail_watch_expiry: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface EmailTable {
  id: Generated<string>;
  account_id: string;
  workspace_id: string;
  user_id: string;
  message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  snippet: string | null;
  folder: Generated<'inbox' | 'sent' | 'drafts' | 'trash' | 'spam'>;
  is_read: Generated<boolean>;
  is_starred: Generated<boolean>;
  sent_at: string;
  synced_at: Generated<string>;
  contact_id: string | null;
  deal_id: string | null;
}

export interface PushTokenTable {
  id: Generated<string>;
  user_id: string;
  workspace_id: string;
  token: string;
  platform: string;
  preferences: Generated<Record<string, boolean>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RecordTypeTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  icon: Generated<string>;
  color: Generated<string>;
  position: Generated<number>;
  auto_number_enabled: Generated<boolean>;
  auto_number_prefix: Generated<string>;
  auto_number_format: Generated<string>;
  auto_number_sequence: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface RecordTypeFieldTable {
  id: Generated<string>;
  record_type_id: string;
  label: string;
  field_type: FieldType;
  options: unknown | null;
  is_required: Generated<boolean>;
  position: Generated<number>;
  created_at: Generated<string>;
}

export interface RecordTypePermissionTable {
  id: Generated<string>;
  record_type_id: string;
  role: 'admin' | 'member';
  can_view: Generated<boolean>;
  can_create: Generated<boolean>;
  can_edit: Generated<boolean>;
  can_delete: Generated<boolean>;
}

export interface StageRequiredFieldTable {
  stage_id: string;
  field_id: string;
}

export interface PipelineRecordTable {
  id: Generated<string>;
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
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface RecordFieldValueTable {
  id: Generated<string>;
  record_id: string;
  field_id: string;
  value: unknown;
}

export interface ConversionTemplateTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  position: Generated<number>;
  created_at: Generated<string>;
}

export interface ConversionFieldMappingTable {
  id: Generated<string>;
  template_id: string;
  source_field_id: string | null;
  source_builtin: string | null;
  target_field_id: string | null;
  target_builtin: string | null;
}

export interface RecordConversionTable {
  id: Generated<string>;
  source_record_id: string;
  target_record_id: string;
  template_id: string;
  converted_by: string;
  converted_at: Generated<string>;
}

export interface CalendarEventTable {
  id: Generated<string>;
  workspace_id: string;
  title: string;
  description: string | null;
  category: 'holiday' | 'company_event' | 'meeting' | 'other';
  color: string | null;
  start_date: string;
  end_date: string | null;
  all_day: Generated<boolean>;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SystemSettingsTable {
  key: string;
  value: Record<string, unknown>;
  updated_at: Generated<Date>;
}

export interface WorkspaceImapConfigTable {
  workspace_id: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeploymentTable {
  id: Generated<string>;
  workspace_id: string;
  server_id: string | null;
  name: string | null;
  environment: string | null;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  source: 'webhook' | 'agent' | 'manual';
  started_at: Generated<Date>;
  finished_at: Date | null;
  duration_s: number | null;
  git_commit: string | null;
  git_branch: string | null;
  git_tag: string | null;
  git_message: string | null;
  git_author: string | null;
  meta: Record<string, unknown> | null;
  created_at: Generated<Date>;
}

export type Deployment = Selectable<DeploymentTable>;
export type NewDeployment = Insertable<DeploymentTable>;
export type DeploymentUpdate = Updateable<DeploymentTable>;

export interface WorkspaceModuleTable {
  id: Generated<string>;
  workspace_id: string;
  module_id: string;
  enabled: Generated<boolean>;
  updated_at: Generated<Date>;
  updated_by: string | null;
}

export interface WorkspacePluginTable {
  id: Generated<string>;
  workspace_id: string;
  plugin_id: string;
  name: string;
  version: string;
  manifest: Record<string, unknown>;
  enabled: Generated<boolean>;
  installed_at: Generated<Date>;
}

export interface UserPermissionTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  permission: string;
  granted: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface Database {
  workspaces: WorkspaceTable;
  users: UserTable;
  companies: CompanyTable;
  contacts: ContactTable;
  deals: DealTable;
  tasks: TaskTable;
  activities: ActivityTable;
  alerts: AlertTable;
  servers: ServerTable;
  infra_databases: InfraDatabaseTable;
  websites: WebsiteTable;
  metrics_snapshots: MetricsSnapshotTable;
  alert_thresholds: AlertThresholdTable;
  deployments: DeploymentTable;
  workspace_ssh_keypairs: WorkspaceSshKeypairTable;
  ssh_command_log: SshCommandLogTable;
  pipelines: PipelineTable;
  pipeline_stages: PipelineStageTable;
  stage_fields: StageFieldTable;
  deal_field_values: DealFieldValueTable;
  item_groups: ItemGroupTable;
  group_stages: GroupStageTable;
  items: ItemTable;
  item_fields: ItemFieldTable;
  item_field_values: ItemFieldValueTable;
  webhook_subscriptions: WebhookSubscriptionTable;
  webhook_deliveries: WebhookDeliveryTable;
  api_keys: ApiKeyTable;
  notifications: NotificationTable;
  email_accounts: EmailAccountTable;
  emails: EmailTable;
  push_tokens: PushTokenTable;
  record_types: RecordTypeTable;
  record_type_fields: RecordTypeFieldTable;
  record_type_permissions: RecordTypePermissionTable;
  stage_required_fields: StageRequiredFieldTable;
  pipeline_records: PipelineRecordTable;
  record_field_values: RecordFieldValueTable;
  conversion_templates: ConversionTemplateTable;
  conversion_field_mappings: ConversionFieldMappingTable;
  record_conversions: RecordConversionTable;
  calendar_events: CalendarEventTable;
  system_settings: SystemSettingsTable;
  workspace_imap_config: WorkspaceImapConfigTable;
  workspace_modules: WorkspaceModuleTable;
  workspace_plugins: WorkspacePluginTable;
  user_permissions: UserPermissionTable;
}

// Convenience types
export type Workspace = Selectable<WorkspaceTable>;
export type NewWorkspace = Insertable<WorkspaceTable>;
export type WorkspaceUpdate = Updateable<WorkspaceTable>;

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;

export type Company = Selectable<CompanyTable>;
export type NewCompany = Insertable<CompanyTable>;
export type CompanyUpdate = Updateable<CompanyTable>;

export type Contact = Selectable<ContactTable>;
export type NewContact = Insertable<ContactTable>;
export type ContactUpdate = Updateable<ContactTable>;

export type Deal = Selectable<DealTable>;
export type NewDeal = Insertable<DealTable>;
export type DealUpdate = Updateable<DealTable>;

export type Pipeline = Selectable<PipelineTable>;
export type NewPipeline = Insertable<PipelineTable>;
export type PipelineUpdate = Updateable<PipelineTable>;

export type PipelineStage = Selectable<PipelineStageTable>;
export type NewPipelineStage = Insertable<PipelineStageTable>;
export type PipelineStageUpdate = Updateable<PipelineStageTable>;

export type StageField = Selectable<StageFieldTable>;
export type NewStageField = Insertable<StageFieldTable>;
export type StageFieldUpdate = Updateable<StageFieldTable>;

export type DealFieldValue = Selectable<DealFieldValueTable>;
export type NewDealFieldValue = Insertable<DealFieldValueTable>;

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type TaskUpdate = Updateable<TaskTable>;

export type Activity = Selectable<ActivityTable>;
export type NewActivity = Insertable<ActivityTable>;

export type Alert = Selectable<AlertTable>;
export type NewAlert = Insertable<AlertTable>;

export type Server = Selectable<ServerTable>;
export type NewServer = Insertable<ServerTable>;
export type ServerUpdate = Updateable<ServerTable>;
export type InfraDatabase = Selectable<InfraDatabaseTable>;
export type NewInfraDatabase = Insertable<InfraDatabaseTable>;
export type InfraDatabaseUpdate = Updateable<InfraDatabaseTable>;
export type Website = Selectable<WebsiteTable>;
export type NewWebsite = Insertable<WebsiteTable>;
export type WebsiteUpdate = Updateable<WebsiteTable>;
export type MetricsSnapshot = Selectable<MetricsSnapshotTable>;
export type NewMetricsSnapshot = Insertable<MetricsSnapshotTable>;
export type AlertThreshold = Selectable<AlertThresholdTable>;
export type NewAlertThreshold = Insertable<AlertThresholdTable>;
export type AlertThresholdUpdate = Updateable<AlertThresholdTable>;

export type ItemGroup = Selectable<ItemGroupTable>;
export type NewItemGroup = Insertable<ItemGroupTable>;
export type ItemGroupUpdate = Updateable<ItemGroupTable>;

export type GroupStage = Selectable<GroupStageTable>;
export type NewGroupStage = Insertable<GroupStageTable>;
export type GroupStageUpdate = Updateable<GroupStageTable>;

export type Item = Selectable<ItemTable>;
export type NewItem = Insertable<ItemTable>;
export type ItemUpdate = Updateable<ItemTable>;

export type ItemField = Selectable<ItemFieldTable>;
export type NewItemField = Insertable<ItemFieldTable>;
export type ItemFieldUpdate = Updateable<ItemFieldTable>;

export type ItemFieldValue = Selectable<ItemFieldValueTable>;
export type NewItemFieldValue = Insertable<ItemFieldValueTable>;
export type ItemFieldValueUpdate = Updateable<ItemFieldValueTable>;

export type WorkspaceSshKeypair = Selectable<WorkspaceSshKeypairTable>;
export type NewWorkspaceSshKeypair = Insertable<WorkspaceSshKeypairTable>;
export type SshCommandLog = Selectable<SshCommandLogTable>;
export type NewSshCommandLog = Insertable<SshCommandLogTable>;

export type WebhookSubscription = Selectable<WebhookSubscriptionTable>;
export type NewWebhookSubscription = Insertable<WebhookSubscriptionTable>;
export type WebhookSubscriptionUpdate = Updateable<WebhookSubscriptionTable>;
export type WebhookDelivery = Selectable<WebhookDeliveryTable>;
export type NewWebhookDelivery = Insertable<WebhookDeliveryTable>;
export type WebhookDeliveryUpdate = Updateable<WebhookDeliveryTable>;

export type ApiKey = Selectable<ApiKeyTable>;
export type NewApiKey = Insertable<ApiKeyTable>;
export type ApiKeyUpdate = Updateable<ApiKeyTable>;

export type Notification = Selectable<NotificationTable>;
export type NewNotification = Insertable<NotificationTable>;
export type NotificationUpdate = Updateable<NotificationTable>;

export type EmailAccount = Selectable<EmailAccountTable>;
export type NewEmailAccount = Insertable<EmailAccountTable>;
export type EmailAccountUpdate = Updateable<EmailAccountTable>;
export type Email = Selectable<EmailTable>;
export type NewEmail = Insertable<EmailTable>;
export type EmailUpdate = Updateable<EmailTable>;

export type PushToken = Selectable<PushTokenTable>;
export type NewPushToken = Insertable<PushTokenTable>;
export type PushTokenUpdate = Updateable<PushTokenTable>;

export type RecordType = Selectable<RecordTypeTable>;
export type NewRecordType = Insertable<RecordTypeTable>;
export type RecordTypeUpdate = Updateable<RecordTypeTable>;

export type RecordTypeField = Selectable<RecordTypeFieldTable>;
export type NewRecordTypeField = Insertable<RecordTypeFieldTable>;
export type RecordTypeFieldUpdate = Updateable<RecordTypeFieldTable>;

export type RecordTypePermission = Selectable<RecordTypePermissionTable>;
export type NewRecordTypePermission = Insertable<RecordTypePermissionTable>;
export type RecordTypePermissionUpdate = Updateable<RecordTypePermissionTable>;

export type StageRequiredField = Selectable<StageRequiredFieldTable>;
export type NewStageRequiredField = Insertable<StageRequiredFieldTable>;

export type PipelineRecord = Selectable<PipelineRecordTable>;
export type NewPipelineRecord = Insertable<PipelineRecordTable>;
export type PipelineRecordUpdate = Updateable<PipelineRecordTable>;

export type RecordFieldValue = Selectable<RecordFieldValueTable>;
export type NewRecordFieldValue = Insertable<RecordFieldValueTable>;
export type RecordFieldValueUpdate = Updateable<RecordFieldValueTable>;

export type ConversionTemplate = Selectable<ConversionTemplateTable>;
export type NewConversionTemplate = Insertable<ConversionTemplateTable>;
export type ConversionTemplateUpdate = Updateable<ConversionTemplateTable>;

export type ConversionFieldMapping = Selectable<ConversionFieldMappingTable>;
export type NewConversionFieldMapping = Insertable<ConversionFieldMappingTable>;
export type ConversionFieldMappingUpdate = Updateable<ConversionFieldMappingTable>;

export type RecordConversion = Selectable<RecordConversionTable>;
export type NewRecordConversion = Insertable<RecordConversionTable>;

export type CalendarEvent = Selectable<CalendarEventTable>;
export type NewCalendarEvent = Insertable<CalendarEventTable>;
export type CalendarEventUpdate = Updateable<CalendarEventTable>;

export type WorkspaceImapConfig = Selectable<WorkspaceImapConfigTable>;
export type NewWorkspaceImapConfig = Insertable<WorkspaceImapConfigTable>;
export type WorkspaceImapConfigUpdate = Updateable<WorkspaceImapConfigTable>;

export type WorkspaceModule = Selectable<WorkspaceModuleTable>;
export type NewWorkspaceModule = Insertable<WorkspaceModuleTable>;
export type WorkspaceModuleUpdate = Updateable<WorkspaceModuleTable>;

export type WorkspacePlugin = Selectable<WorkspacePluginTable>;
export type NewWorkspacePlugin = Insertable<WorkspacePluginTable>;
export type WorkspacePluginUpdate = Updateable<WorkspacePluginTable>;

export type UserPermission = Selectable<UserPermissionTable>;
export type NewUserPermission = Insertable<UserPermissionTable>;
export type UserPermissionUpdate = Updateable<UserPermissionTable>;
