'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRevenue, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { OverviewTile } from './OverviewTile';

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function CrmOverviewTile({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-revenue', period],
    queryFn: async () => getRevenue(await getToken(), period),
  });

  return (
    <OverviewTile
      label="Revenue"
      value={fmtMoney(data?.data?.total_revenue ?? 0)}
      sub={`${data?.data?.deals_won ?? 0} deals won`}
      isLoading={isLoading}
    />
  );
}
