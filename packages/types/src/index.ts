export type UUID = string;

export type ContactStatus = 'prospect' | 'customer' | 'cold' | 'churned';
export type DealStage = 'lead' | 'qualifying' | 'proposal' | 'closing' | 'won' | 'lost';
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

export interface Deal {
  id: UUID;
  workspace_id: UUID;
  contact_id: UUID | null;
  company_id: UUID | null;
  owner_id: UUID;
  name: string;
  value: number;
  stage: DealStage;
  probability: number;
  close_date: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: UUID;
  workspace_id: UUID;
  assignee_id: UUID;
  contact_id: UUID | null;
  deal_id: UUID | null;
  title: string;
  due_date: Date | null;
  status: TaskStatus;
  created_at: Date;
  updated_at: Date;
}

export interface Activity {
  id: UUID;
  workspace_id: UUID;
  user_id: UUID;
  contact_id: UUID | null;
  deal_id: UUID | null;
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
  storage_gb: number | null;
  connection_count: number | null;
  replication_lag_s: number | null;
  status: InfraDatabaseStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
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
