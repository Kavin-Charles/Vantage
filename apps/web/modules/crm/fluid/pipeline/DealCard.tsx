'use client';
import { useState } from 'react';
import { FieldRenderer } from '@/modules/crm/pipeline/components/fields/FieldRenderer';
import { FluidBadge, MSIcon } from '@/modules/shared/fluid/ui';
import { deriveDealPriority, type DealPriority } from './lib/dealPriority';
import type { PipelineItem } from '@/modules/crm/pipeline/lib/items';
import type { PipelineField } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  item: PipelineItem;
  fields: PipelineField[];
  isDragging: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const PRIORITY_TONE: Record<DealPriority, 'red' | 'gold' | 'blue' | 'neutral'> = {
  urgent: 'red',
  high: 'gold',
  medium: 'blue',
  low: 'neutral',
};

const PRIORITY_LABEL: Record<DealPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Only surfaces a priority badge when the pipeline defines a numeric "probability"
 * field and this item actually carries a numeric value for it — never guesses. */
function probabilityPriority(item: PipelineItem, fields: PipelineField[]): DealPriority | null {
  const field = fields.find(f => f.type === 'number' && f.key.toLowerCase() === 'probability');
  if (!field) return null;
  const raw = item.field_values[field.key];
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
  return deriveDealPriority(raw);
}

export function DealCard({ item, fields, isDragging, onClick, onDragStart, onDragEnd, onContextMenu }: Props) {
  const [hovered, setHovered] = useState(false);
  const previewFields = fields.slice(0, 3);
  const priority = probabilityPriority(item, fields);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="glass-panel"
      style={{
        borderRadius: 'var(--fl-radius-input)',
        padding: '14px 16px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: hovered && !isDragging ? 'var(--fl-shadow-float)' : 'none',
        transform: hovered && !isDragging ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow .15s ease, opacity .15s ease, transform .15s ease',
      }}
    >
      {priority && (
        <div style={{ marginBottom: 8 }}>
          <FluidBadge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</FluidBadge>
        </div>
      )}

      {previewFields.length > 0 ? (
        previewFields.map(f => (
          <div key={f.id} style={{ marginBottom: 6 }}>
            <span style={{
              fontSize: 10, color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)',
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              {f.label}
            </span>
            <div style={{ marginTop: 2, fontFamily: 'var(--fl-font-body)' }}>
              <FieldRenderer field={f} value={item.field_values[f.key]} />
            </div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)' }}>
          {item.id.slice(0, 8)}
        </div>
      )}

      <div style={{
        marginTop: 8, display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)',
      }}>
        <MSIcon name="schedule" size={12} />
        {new Date(item.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}
