'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { useApiToken } from '@/lib/useApiToken';
import { getRevenue, getPipeline, getTeam } from '@/lib/analytics';
import type { Period } from '@/lib/analytics';
import { KpiCards } from './KpiCards';
import { RevenueChart } from './RevenueChart';
import { PipelineChart } from './PipelineChart';
import { RepLeaderboard } from './RepLeaderboard';

const PERIODS: { label: string; value: Period }[] = [
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '12M', value: '12m' },
];

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

export default function AnalyticsPage() {
  const getToken = useApiToken();
  const [period, setPeriod] = useState<Period>('30d');

  const { data: revenueData, isLoading: revLoading } = useQuery({
    queryKey: ['analytics-revenue', period],
    queryFn: async () => getRevenue(await getToken(), period),
  });

  const { data: pipelineData, isLoading: pipeLoading } = useQuery({
    queryKey: ['analytics-pipeline', period],
    queryFn: async () => getPipeline(await getToken(), period),
  });

  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['analytics-team', period],
    queryFn: async () => getTeam(await getToken(), period),
  });

  const periodToggle = (
    <div
      style={{
        display: 'flex',
        gap: 3,
        background: 'var(--surface2)',
        borderRadius: 'var(--radius-md)',
        padding: 3,
      }}
    >
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => setPeriod(p.value)}
          style={{
            padding: '4px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            background: period === p.value ? 'var(--surface)' : 'transparent',
            color: period === p.value ? 'var(--text)' : 'var(--text2)',
            boxShadow: period === p.value ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            transition: 'all .15s',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Topbar action={periodToggle} />

      <div style={{ padding: 24 }}>
        {/* KPI cards row */}
        <KpiCards data={revenueData?.data} isLoading={revLoading} />

        {/* Revenue over time */}
        <div style={{ ...card, padding: '20px 24px' }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: 16,
            }}
          >
            Revenue over time
          </div>
          <RevenueChart
            series={revenueData?.data?.series ?? []}
            isLoading={revLoading}
            period={period}
          />
        </div>

        {/* Pipeline by stage */}
        <div style={{ ...card, padding: '20px 24px' }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: 16,
            }}
          >
            Pipeline by stage
          </div>
          <PipelineChart
            stages={pipelineData?.data?.stages ?? []}
            isLoading={pipeLoading}
          />
        </div>

        {/* Rep leaderboard */}
        <div style={{ ...card, marginBottom: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '20px 24px 0',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Rep leaderboard
          </div>
          <RepLeaderboard reps={teamData?.data?.reps} isLoading={teamLoading} />
        </div>
      </div>
    </>
  );
}
