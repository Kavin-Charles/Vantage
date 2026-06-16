'use client';
import { useState } from 'react';
import { KanbanCard } from './KanbanCard';
import type { PipelineItem } from '@/modules/pipeline/lib/items';
import type { PipelineField, PipelineStage } from '@/modules/pipeline/lib/pipelines';

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
}

function stageColor(stage: PipelineStage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

export function KanbanColumn({
  stage, items, fields, draggingId, isDragOver,
  onDragOver, onDragLeave, onDrop, onCardClick,
  onCardDragStart, onCardDragEnd, onAddClick, onCardContextMenu,
}: Props) {
  const [addHovered, setAddHovered] = useState(false);
  const color = stageColor(stage);

  return (
    <div
      style={{
        minWidth: 260,
        maxWidth: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      {/* Column header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        padding: '0 2px',
      }}>
        <span style={{
          background: color + '1a',
          color: color,
          borderRadius: 6,
          padding: '3px 9px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.2px',
        }}>
          {stage.name}
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--text3)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
        }}>
          {items.length}
        </span>
        <button
          onClick={onAddClick}
          onMouseEnter={() => setAddHovered(true)}
          onMouseLeave={() => setAddHovered(false)}
          style={{
            marginLeft: 'auto',
            width: 22,
            height: 22,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: addHovered ? 'var(--surface2)' : 'var(--surface)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: addHovered ? 'var(--text)' : 'var(--text3)',
            lineHeight: 1,
            transition: 'all .15s ease',
            padding: 0,
          }}
          title={`Add item to ${stage.name}`}
        >
          +
        </button>
      </div>

      {/* Drop zone */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 80,
          borderRadius: 14,
          padding: isDragOver ? 6 : 0,
          margin: isDragOver ? -6 : 0,
          background: isDragOver ? 'var(--surface2)' : 'transparent',
          transition: 'all .12s ease',
        }}
      >
        {items.map(item => (
          <KanbanCard
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
            padding: '20px 0',
            textAlign: 'center',
            color: 'var(--text3)',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
            opacity: isDragOver ? 0.6 : 0.4,
            transition: 'opacity .15s',
          }}>
            {isDragOver ? 'Drop here' : 'Empty'}
          </div>
        )}
      </div>
    </div>
  );
}
