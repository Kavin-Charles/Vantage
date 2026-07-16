'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRevenue, getPipeline, getTeam, type AnalyticsSectionProps } from '@/modules/analytics/lib/analytics';
import { KpiCards } from '../components/KpiCards';
import { RevenueChart } from '../components/RevenueChart';
import { PipelineChart } from '../components/PipelineChart';
import { RepLeaderboard } from '../components/RepLeaderboard';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

export function CrmAnalyticsSection({ period }: AnalyticsSectionProps) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

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

  function chartMenu(queryKey: string, rows: Record<string, unknown>[] | undefined, filename: string) {
    const items: ContextMenuItem[] = [
      { icon: 'refresh', label: 'Refresh', onClick: () => void qc.invalidateQueries({ queryKey: [queryKey, period] }) },
      { icon: 'open', label: 'Export CSV', disabled: !rows || rows.length === 0, onClick: () => downloadCsv(filename, rows ?? []) },
    ];
    return (e: React.MouseEvent) => openMenu(e, items);
  }

  return (
    <div>
      <KpiCards data={revenueData?.data} isLoading={revLoading} />

      <div
        onContextMenu={chartMenu('analytics-revenue', revenueData?.data?.series as Record<string, unknown>[] | undefined, 'revenue.csv')}
        style={{ ...card, padding: '20px 24px' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          Revenue over time
        </div>
        <RevenueChart series={revenueData?.data?.series ?? []} isLoading={revLoading} period={period} />
      </div>

      <div
        onContextMenu={chartMenu('analytics-pipeline', pipelineData?.data?.stages as Record<string, unknown>[] | undefined, 'pipeline.csv')}
        style={{ ...card, padding: '20px 24px' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          Pipeline by stage
        </div>
        <PipelineChart stages={pipelineData?.data?.stages ?? []} isLoading={pipeLoading} />
      </div>

      <div
        onContextMenu={chartMenu('analytics-team', teamData?.data?.reps as Record<string, unknown>[] | undefined, 'rep-leaderboard.csv')}
        style={{ ...card, overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 24px 0', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Rep leaderboard
        </div>
        <RepLeaderboard reps={teamData?.data?.reps} isLoading={teamLoading} />
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
