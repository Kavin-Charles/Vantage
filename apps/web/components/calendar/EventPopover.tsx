'use client';

import { useEffect, useRef } from 'react';
import { eventColor, CATEGORY_LABELS, formatEventRange, type CalendarEvent, type CalendarCategory } from '@/lib/calendar';

interface EventPopoverProps {
  event: CalendarEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function EventPopover({ event, anchorRect, onClose, isAdmin, onEdit, onDelete }: EventPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const color = eventColor(event);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const top = anchorRect.bottom + window.scrollY + 6;
  const left = Math.min(anchorRect.left + window.scrollX, window.innerWidth - 260);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top,
        left,
        zIndex: 1000,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        padding: 16,
        width: 240,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {CATEGORY_LABELS[event.category as CalendarCategory] ?? event.category}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
        {event.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: event.description ? 8 : 0 }}>
        {formatEventRange(event)}
      </div>
      {event.description && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            {event.description}
          </div>
        </>
      )}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={onEdit}
            style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', fontFamily: 'inherit' }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid #fecaca', background: '#fee2e2', cursor: 'pointer', fontSize: 12, color: '#ef4444', fontFamily: 'inherit' }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
