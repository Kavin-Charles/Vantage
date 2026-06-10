'use client';
import type { DashboardSummary } from '../lib/dashboard-api';

interface Props {
  dashboards: DashboardSummary[];
  currentId: string;
  onCreateNew?: () => void;
  isAdmin: boolean;
}

export function DashboardTabs(_props: Props) { return null; }
