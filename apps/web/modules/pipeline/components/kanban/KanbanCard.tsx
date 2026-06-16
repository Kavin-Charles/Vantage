'use client';
import { useState } from 'react';
import { FieldRenderer } from '@/modules/pipeline/components/fields/FieldRenderer';
import type { PipelineItem } from '@/modules/pipeline/lib/items';
import type { PipelineField } from '@/modules/pipeline/lib/pipelines';

interface Props {
  item: PipelineItem;
  fields: PipelineField[];
  isDragging: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function KanbanCard({ item, fields, isDragging, onClick, onDragStart, onDragEnd, onContextMenu }: Props) {
  const [hovered, setHovered] = useState(false);
  const previewFields = fields.slice(0, 3);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 14px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: hovered && !isDragging ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
        transform: hovered && !isDragging ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow .15s ease, opacity .15s ease, transform .15s ease',
      }}
    >
      {previewFields.length > 0 ? (
        previewFields.map(f => (
          <div key={f.id} style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {f.label}
            </span>
            <div style={{ marginTop: 2 }}>
              <FieldRenderer field={f} value={item.field_values[f.key]} />
            </div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          {item.id.slice(0, 8)}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
        {new Date(item.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}
