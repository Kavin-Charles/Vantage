import type { PipelineStage, GroupStage } from '@vantage/types';

const STAGE_BADGE: Record<string, 'gray' | 'blue' | 'amber' | 'purple' | 'green' | 'red'> = {
  lead: 'gray', qualifying: 'blue', proposal: 'amber',
  closing: 'purple', won: 'green', lost: 'red',
};

const BADGE_COLORS: Record<string, { background: string; color: string }> = {
  green:  { background: 'var(--green-bg)',  color: 'var(--green)'  },
  amber:  { background: 'var(--amber-bg)',  color: 'var(--amber)'  },
  red:    { background: 'var(--red-bg)',    color: 'var(--red)'    },
  blue:   { background: 'var(--blue-bg)',   color: 'var(--blue)'   },
  purple: { background: 'var(--purple-bg)', color: 'var(--purple)' },
  gray:   { background: 'var(--surface2)',  color: 'var(--text2)'  },
};

export function stageBadgeColor(stage: PipelineStage | GroupStage): 'gray' | 'blue' | 'amber' | 'purple' | 'green' | 'red' {
  if (stage.is_won) return 'green';
  if (stage.is_lost) return 'red';
  return STAGE_BADGE[stage.name?.toLowerCase() ?? ''] ?? 'gray';
}

export function StagePill({ stage }: { stage?: PipelineStage | GroupStage }) {
  if (!stage) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const color = stageBadgeColor(stage);
  const colors = BADGE_COLORS[color] ?? BADGE_COLORS.gray;
  return (
    <span style={{
      ...colors, fontSize: 11, fontWeight: 600,
      padding: '2px 9px', borderRadius: 999,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {stage.name}
    </span>
  );
}
