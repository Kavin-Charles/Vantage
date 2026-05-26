'use client';

import { useState } from 'react';
import { DealForm } from './DealForm';
import { StagePill } from './StagePill';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import type { Deal, PipelineStage, StageField } from '@vantage/types';

type StageWithFields = PipelineStage & { fields: StageField[] };

interface Props {
  deal: Deal;
  stages: StageWithFields[];
  stageMap: Record<string, PipelineStage>;
  userMap: Record<string, string>;
  pipelineId: string;
  onDone: () => void;
}

function fmtValue(v: number | null | undefined) {
  if (!v) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.3 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

export function DealDetailCard({ deal, stages, stageMap, userMap, pipelineId, onDone }: Props) {
  const [editing, setEditing] = useState(false);
  const stage = deal.stage_id ? stageMap[deal.stage_id] : undefined;
  const ownerName = deal.owner_id ? (userMap[deal.owner_id] ?? '—') : '—';
  const ownerInitial = ownerName !== '—' ? ownerName[0].toUpperCase() : '?';

  if (editing) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setEditing(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: 0 }}
          >
            <span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><Icon name="chevron" size={13} /></span>
            Back
          </button>
        </div>
        <DealForm
          deal={deal}
          pipelineId={pipelineId}
          stages={stages}
          defaultStageId={deal.stage_id ?? stages[0]?.id ?? null}
          onDone={onDone}
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: 20, fontWeight: 600,
            fontFamily: 'var(--font-display)', letterSpacing: '-0.4px',
            color: 'var(--text)', lineHeight: 1.2,
          }}>
            {deal.name}
          </h2>
          <div style={{ marginTop: 8 }}>
            {stage && <StagePill stage={stage} />}
          </div>
        </div>
        <Button onClick={() => setEditing(true)} style={{ flexShrink: 0, padding: '6px 14px', fontSize: 13 }}>
          Edit
        </Button>
      </div>

      {/* Metrics grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16,
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px',
      }}>
        <Meta label="Value">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text)' }}>
            {fmtValue(deal.value)}
          </span>
        </Meta>
        <Meta label="Probability">
          {deal.probability != null ? `${deal.probability}%` : '—'}
        </Meta>
        <Meta label="Close date">
          {deal.close_date ? new Date(deal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
        </Meta>
        <Meta label="Owner">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
            }}>{ownerInitial}</span>
            {ownerName}
          </span>
        </Meta>
      </div>

      {/* Custom field values */}
      {deal.field_values && Object.keys(deal.field_values).length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 20px',
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.3 }}>
            Stage fields
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Object.entries(deal.field_values).map(([key, val]) => {
              const v = val ?? '';
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{v || '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Created at */}
      {deal.created_at && (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
          Created {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}
