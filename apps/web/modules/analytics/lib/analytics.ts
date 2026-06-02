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
