'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPmAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { OverviewTile } from './OverviewTile';

export function PmOverviewTile({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-pm', period],
    queryFn: async () => getPmAnalytics(await getToken(), period),
  });

  return (
    <OverviewTile
      label="Task completion"
      value={`${data?.data?.tasks.completion_rate ?? 0}%`}
      sub={`${data?.data?.projects.active ?? 0} active projects`}
      isLoading={isLoading}
    />
  );
}
