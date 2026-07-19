import { apiFetch } from '@/modules/shared/lib/api';

export type Period = '30d' | '90d' | '12m';

export interface SeriesPoint {
  label: string;   // ISO date string from API — format on client
  revenue: number;
  count: number;
}

export interface RevenueData {
  total_revenue: number;
  deals_won: number;
  win_rate: number;
  avg_deal_size: number;
  series: SeriesPoint[];
}

export interface StageData {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  count: number;
  value: number;
}

export interface PipelineData {
  stages: StageData[];
}

export interface RepData {
  user_id: string;
  name: string;
  deals_won: number;
  revenue: number;
  win_rate: number;
}

export interface TeamData {
  reps: RepData[];
}

export function getRevenue(token: string, period: Period) {
  return apiFetch<{ data: RevenueData; error: null }>(
    `/api/analytics/revenue?period=${period}`,
    { token },
  );
}

export function getPipeline(token: string, period: Period) {
  return apiFetch<{ data: PipelineData; error: null }>(
    `/api/analytics/pipeline?period=${period}`,
    { token },
  );
}

export function getTeam(token: string, period: Period) {
  return apiFetch<{ data: TeamData; error: null }>(
    `/api/analytics/team?period=${period}`,
    { token },
  );
}

// ── Analytics hub ─────────────────────────────────────────────────────────────

export interface InfraAnalytics {
  servers: { online: number; degraded: number; offline: number; stopped: number; avg_cpu: number; avg_mem: number; avg_disk: number };
  websites: { total: number; avg_uptime: number; ssl_expiring_soon: number };
  alerts: { critical: number; warning: number; info: number };
}

export interface PmAnalytics {
  projects: { active: number };
  tasks: { total: number; done: number; overdue: number; open: number; completion_rate: number };
  velocity: Array<{ sprint_name: string; velocity: number | null; end_date: string | null }>;
  workload: Array<{ user_id: string; name: string; total: number; done: number; overdue: number }>;
}

export interface ResolvedAnalyticsSection {
  kind: 'builtin' | 'plugin';
  plugin_id: string;
  id: string;
  slot_id: string;
  label: string | null;
  priority: number;
}

export interface AnalyticsSectionProps {
  period: Period;
}

export function getInfraAnalytics(token: string, period: Period) {
  return apiFetch<{ data: InfraAnalytics; error: null }>(
    `/api/analytics/infra?period=${period}`,
    { token },
  );
}

export function getPmAnalytics(token: string, period: Period) {
  return apiFetch<{ data: PmAnalytics; error: null }>(
    `/api/analytics/pm?period=${period}`,
    { token },
  );
}

export function getAnalyticsSections(token: string) {
  return apiFetch<{ data: ResolvedAnalyticsSection[]; error: null }>(
    '/api/hub/sections/analytics',
    { token },
  );
}
