import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface WorkspaceTable {
  id: Generated<string>;
  name: string;
  domain: string;
  plan: Generated<'trial' | 'active' | 'cancelled'>;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  seat_count: Generated<number>;
  contact_count: Generated<number>;
  server_count: Generated<number>;
  db_count: Generated<number>;
  trial_ends_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserTable {
  id: Generated<string>;
  workspace_id: string;
  clerk_user_id: string;
  name: string;
  email: string;
  role: Generated<'admin' | 'member'>;
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
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  name: string;
  value: Generated<number>;
  stage: Generated<'lead' | 'qualifying' | 'proposal' | 'closing' | 'won' | 'lost'>;
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

export interface UsageMeterTable {
  id: Generated<string>;
  workspace_id: string;
  period_start: Date;
  period_end: Date;
  contact_count_peak: Generated<number>;
  server_count_peak: Generated<number>;
  db_count_peak: Generated<number>;
  seat_count_peak: Generated<number>;
  base_fee: Generated<number>;
  overage_total: Generated<number>;
  total_bill: Generated<number>;
  stripe_invoice_id: string | null;
  status: Generated<'pending' | 'invoiced' | 'paid' | 'failed'>;
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
  usage_meters: UsageMeterTable;
}

// Convenience types
export type Workspace = Selectable<WorkspaceTable>;
export type NewWorkspace = Insertable<WorkspaceTable>;
export type WorkspaceUpdate = Updateable<WorkspaceTable>;

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;

export type Company = Selectable<CompanyTable>;
export type NewCompany = Insertable<CompanyTable>;
export type CompanyUpdate = Updateable<CompanyTable>;

export type Contact = Selectable<ContactTable>;
export type NewContact = Insertable<ContactTable>;
export type ContactUpdate = Updateable<ContactTable>;

export type Deal = Selectable<DealTable>;
export type NewDeal = Insertable<DealTable>;
export type DealUpdate = Updateable<DealTable>;

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type TaskUpdate = Updateable<TaskTable>;

export type Activity = Selectable<ActivityTable>;
export type NewActivity = Insertable<ActivityTable>;

export type Alert = Selectable<AlertTable>;
export type NewAlert = Insertable<AlertTable>;

export type UsageMeter = Selectable<UsageMeterTable>;
