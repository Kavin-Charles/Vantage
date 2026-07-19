'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getInfraAnalytics, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { OverviewTile } from './OverviewTile';

export function InfraOverviewTile({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-infra', period],
    queryFn: async () => getInfraAnalytics(await getToken(), period),
  });

  const s = data?.data?.servers;
  const total = s ? s.online + s.degraded + s.offline + s.stopped : 0;
  const critical = data?.data?.alerts.critical ?? 0;

  return (
    <OverviewTile
      label="Servers online"
      value={`${s?.online ?? 0}/${total}`}
      sub={critical > 0 ? `${critical} critical alert${critical === 1 ? '' : 's'}` : 'No critical alerts'}
      isLoading={isLoading}
    />
  );
}
