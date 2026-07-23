'use client';
import { useState } from 'react';
import { DealCard } from './DealCard';
import { MSIcon } from '@/modules/shared/fluid/ui';
import type { PipelineItem } from '@/modules/crm/pipeline/lib/items';
import type { PipelineField, PipelineStage } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  stage: PipelineStage;
  items: PipelineItem[];
  fields: PipelineField[];
  draggingId: string | null;
  isDragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onCardClick: (itemId: string) => void;
  onCardDragStart: (itemId: string) => void;
  onCardDragEnd: () => void;
  onAddClick: () => void;
  onCardContextMenu: (itemId: string, e: React.MouseEvent) => void;
  canEdit: boolean;
}

function stageColor(stage: PipelineStage): string {
  if (stage.is_won) return '#2e7d32';
  if (stage.is_lost) return 'var(--fl-error)';
  return stage.color || 'var(--fl-primary)';
}

/** Sums a numeric "value" field across a stage's items, when the pipeline
 * defines one — omitted entirely otherwise (never assumes a fixed schema). */
function stageValueTotal(items: PipelineItem[], fields: PipelineField[]): number | null {
  const valueField = fields.find(f => f.type === 'number' && f.key.toLowerCase() === 'value');
  if (!valueField) return null;
  const total = items.reduce((sum, item) => {
    const raw = item.field_values[valueField.key];
    return typeof raw === 'number' && !Number.isNaN(raw) ? sum + raw : sum;
  }, 0);
  return total;
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toLocaleString()}`;
}

export function PipelineColumn({
  stage, items, fields, draggingId, isDragOver,
  onDragOver, onDragLeave, onDrop, onCardClick,
  onCardDragStart, onCardDragEnd, onAddClick, onCardContextMenu, canEdit,
}: Props) {
  const [addHovered, setAddHovered] = useState(false);
  const color = stageColor(stage);
  const valueTotal = stageValueTotal(items, fields);

  return (
    <div
      style={{ minWidth: 280, maxWidth: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 2px' }}>
        <span style={{
          width: 8, height: 8, borderRadius: 'var(--fl-radius-pill)', background: color, flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 14, color: 'var(--fl-on-surface)',
        }}>
          {stage.name}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)',
          background: 'var(--fl-surface-container)', borderRadius: 'var(--fl-radius-pill)', padding: '1px 8px',
        }}>
          {items.length}
        </span>
        {canEdit && (
          <button
            onClick={onAddClick}
            onMouseEnter={() => setAddHovered(true)}
            onMouseLeave={() => setAddHovered(false)}
            title={`Add item to ${stage.name}`}
            style={{
              marginLeft: 'auto', width: 24, height: 24, border: 'none', borderRadius: 'var(--fl-radius-pill)',
              background: addHovered ? 'var(--fl-surface-container-high)' : 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fl-on-surface-variant)', transition: 'background .15s ease', padding: 0,
            }}
          >
            <MSIcon name="add" size={16} />
          </button>
        )}
      </div>

      {valueTotal !== null && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
          fontFamily: 'var(--fl-font-body)', marginBottom: 10, padding: '0 2px',
        }}>
          {formatCurrency(valueTotal)}
        </div>
      )}

      {/* Drop zone */}
      <div
        className="glass-panel"
        style={{
          display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120,
          borderRadius: 'var(--fl-radius-card)', padding: 10,
          background: isDragOver ? 'var(--fl-surface-container-high)' : 'var(--fl-glass-panel-bg)',
          transition: 'background .12s ease', flex: 1,
        }}
      >
        {items.map(item => (
          <DealCard
            key={item.id}
            item={item}
            fields={fields}
            isDragging={draggingId === item.id}
            onClick={() => onCardClick(item.id)}
            onDragStart={() => onCardDragStart(item.id)}
            onDragEnd={onCardDragEnd}
            onContextMenu={e => onCardContextMenu(item.id, e)}
          />
        ))}
        {items.length === 0 && (
          <div style={{
            padding: '24px 0', textAlign: 'center', color: 'var(--fl-on-surface-variant)',
            fontSize: 12, fontFamily: 'var(--fl-font-body)', opacity: isDragOver ? 0.7 : 0.5,
            transition: 'opacity .15s',
          }}>
            {isDragOver ? 'Drop here' : 'Empty'}
          </div>
        )}
      </div>
    </div>
  );
}
